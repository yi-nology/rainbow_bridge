package maintenance

import (
	"context"
	"fmt"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

type fullScratch struct{ *os.File }

func (fullScratch) Write([]byte) (int, error) { return 0, syscall.ENOSPC }
func TestObjectCopyRejectsScratchFullAndTruncatedNetworkBeforeTargetWrite(t *testing.T) {
	for _, scenario := range []string{"disk_full", "truncated_network"} {
		t.Run(scenario, func(t *testing.T) {
			var targetWrites atomic.Int64
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "PUT" {
					targetWrites.Add(1)
					w.WriteHeader(200)
					return
				}
				w.Header().Set("Content-Length", "65536")
				w.Header().Set("ETag", `"owned-test-etag"`)
				w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
				if r.Method == "HEAD" {
					return
				}
				size := 65536
				if scenario == "truncated_network" {
					size = 4096
				}
				_, _ = fmt.Fprint(w, strings.Repeat("x", size))
			}))
			defer server.Close()
			cfg := config.MinioConfig{Endpoint: strings.TrimPrefix(server.URL, "http://"), AccessKey: "test-only-key", SecretKey: "test-only-secret", Region: "us-east-1"}
			store, e := NewStore(cfg, "owned-backup")
			if e != nil {
				t.Fatal(e)
			}
			if scenario == "disk_full" {
				store.scratch = func() (scratchFile, error) {
					f, e := os.CreateTemp(t.TempDir(), "full-*")
					if e != nil {
						return nil, e
					}
					return fullScratch{f}, nil
				}
			}
			lease := &Lease{Op: Operation{Phase: "copying", Data: OperationData{Progress: Progress{UpdatedAt: time.Now().Add(time.Minute)}}}}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			if _, e = store.copyObject(ctx, lease, "owned-source", "object", "", "owned-backup", "candidate", 65536, ""); e == nil {
				t.Fatal("incomplete bytes accepted")
			}
			if targetWrites.Load() != 0 || lease.Op.Phase != "copying" || lease.Op.Terminal {
				t.Fatal("copy failure advanced publication or wrote candidate")
			}
		})
	}
}
