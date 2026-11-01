package businesshost

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestRelayPreservesAuthenticatedCommandAndRejectsWrongPod(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	socket := filepath.Join(t.TempDir(), "host.sock")
	ln, e := net.Listen("unix", socket)
	if e != nil {
		t.Skip("Unix socket unavailable")
	}
	defer ln.Close()
	h := &Host{cfg: Config{Instance: "instance", PodUID: "pod"}, key: key, status: Status{Protocol: Protocol, PodUID: "pod", BootID: "boot", State: "running"}}
	server := &http.Server{Handler: h.Handler()}
	go server.Serve(ln)
	defer server.Shutdown(context.Background())
	relay := httptest.NewServer(Relay(socket, key, "instance", "pod", "/rainbow-bridge"))
	defer relay.Close()
	for _, pod := range []string{"pod", "wrong"} {
		body, _ := json.Marshal(Command{Instance: "instance", PodUID: pod, Action: "status"})
		r, _ := http.NewRequest("POST", relay.URL+"/v1/command", bytes.NewReader(body))
		Sign(r, body, key, time.Now())
		res, e := http.DefaultClient.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if pod == "pod" && (res.StatusCode != 200 || !bytes.Contains(b, []byte(`"running"`))) {
			t.Fatalf("valid relay failed: %d %s", res.StatusCode, b)
		}
		if pod != "pod" && res.StatusCode != 409 {
			t.Fatal("cross-Pod command accepted")
		}
	}
}
