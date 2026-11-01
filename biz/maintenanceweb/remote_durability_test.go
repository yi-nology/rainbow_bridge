package maintenanceweb

import (
	"context"
	"encoding/json"
	"encoding/pem"
	"errors"
	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// Opt-in test: real exclusive PG request/outbox; a deterministic TLS Kubernetes
// adapter simulates create success followed by a lost HTTP response.
func TestRemoteDurableAcceptanceAndLostCreateResponse(t *testing.T) {
	file := os.Getenv("RB_WEB_TEST_CONFIG")
	if file == "" {
		t.Skip("requires exclusively provisioned web control DB")
	}
	cfg, e := LoadConfig(file)
	if e != nil {
		t.Fatal(e)
	}
	if cfg.Namespace != "rb-web-20261030-01" {
		t.Fatal("exclusive test namespace required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	var mutex sync.Mutex
	var created map[string]any
	posts := 0
	api := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mutex.Lock()
		defer mutex.Unlock()
		if r.Method == "POST" {
			posts++
			if e := json.NewDecoder(r.Body).Decode(&created); e != nil {
				t.Error(e)
			}
			object(created, "metadata")["uid"] = "owned-fake-kube-uid"
			conn, _, e := w.(http.Hijacker).Hijack()
			if e == nil {
				conn.Close()
			}
			return
		}
		if created == nil {
			w.WriteHeader(404)
			w.Write([]byte(`{"kind":"Status"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(created)
	}))
	defer api.Close()
	temp := t.TempDir()
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: api.Certificate().Raw})
	if e = os.WriteFile(filepath.Join(temp, "ca"), ca, 0600); e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(filepath.Join(temp, "token"), []byte("adapter-only"), 0600); e != nil {
		t.Fatal(e)
	}
	cfg.Kubernetes.Server = api.URL
	cfg.Kubernetes.CAFile = filepath.Join(temp, "ca")
	cfg.Kubernetes.TokenFile = filepath.Join(temp, "token")
	s, e := Open(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Pool.Close()
	actor := service.AdminIdentity{UserID: 1, Username: "qa_maint", Role: "admin"}
	request := Request{RequestID: uuid.NewString(), Kind: "backup"}
	first, e := s.Accept(ctx, "plan", "", request, actor)
	if e != nil {
		t.Fatal(e)
	}
	t.Log("owned durability task", first.TaskID)
	var wg sync.WaitGroup
	failures := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			same, e := s.Accept(ctx, "plan", "", request, actor)
			if e != nil {
				failures <- e
				return
			}
			if same.TaskID != first.TaskID {
				failures <- errors.New("duplicate task")
			}
		}()
	}
	wg.Wait()
	close(failures)
	for e := range failures {
		t.Error(e)
	}
	changed := request
	changed.Kind = "restore"
	_, e = s.Accept(ctx, "plan", "", changed, actor)
	var conflict *HTTPError
	if !errors.As(e, &conflict) || conflict.Code != "REQUEST_CONFLICT" {
		t.Fatalf("parameter conflict not rejected: %v", e)
	}
	_, e = s.Accept(ctx, "plan", "", Request{RequestID: uuid.NewString(), Kind: "backup"}, actor)
	if !errors.As(e, &conflict) || conflict.Code != "TASK_BUSY" {
		t.Fatalf("competing browser not rejected: %v", e)
	}
	if e = s.Reconcile(ctx); e == nil {
		t.Fatal("lost create response unexpectedly acknowledged")
	}
	queued, e := s.task(ctx, first.TaskID, false)
	if e != nil || queued.State != "queued" {
		t.Fatal("lost response did not retain queued outbox")
	}
	if e = s.Reconcile(ctx); e != nil {
		t.Fatal(e)
	}
	recovered, e := s.task(ctx, first.TaskID, false)
	if e != nil || recovered.State != "running" || recovered.JobUID != "owned-fake-kube-uid" {
		t.Fatal("restart reconciliation did not adopt exact Job")
	}
	mutex.Lock()
	count := posts
	mutex.Unlock()
	if count != 1 {
		t.Fatalf("duplicate Job create: %d", count)
	}
	if e = s.finish(ctx, first.TaskID, &Result{}, nil); e != nil {
		t.Fatal(e)
	}
	t.Log("real PG: 12 concurrent identical requests→one task; conflicting parameters/second browser rejected; mocked TLS K8s create accepted but response lost→same Job adopted, POST count=1")
}
