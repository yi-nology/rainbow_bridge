package maintenancegateway

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestManagementSurvivesBusinessStop(t *testing.T) {
	var active atomic.Bool
	console := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/internal/business-ready") {
			if active.Load() {
				w.WriteHeader(204)
			} else {
				w.WriteHeader(403)
			}
			return
		}
		w.Write([]byte("console:" + r.URL.Path))
	}))
	defer console.Close()
	business := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("business")) }))
	defer business.Close()
	h, e := New("/rainbow-bridge", console.URL, business.URL)
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range []string{"/login", "/backups/tasks/a", "/assets/lazy.js", "/api/v1/auth/me", "/api/v1/maintenance/tasks/a", "/api/v1/backup/capabilities"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "/rainbow-bridge"+p, nil))
		if w.Code != 200 || !strings.HasPrefix(w.Body.String(), "console:") {
			t.Fatalf("management unavailable: %s", p)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/rainbow-bridge/api/v1/config/update", strings.NewReader("{}")))
	if w.Code != 503 || !strings.Contains(w.Body.String(), "MAINTENANCE_ACTIVE") {
		t.Fatal("business write not blocked")
	}
	active.Store(true)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/rainbow-bridge/api/v1/config/list", nil))
	b, _ := io.ReadAll(w.Result().Body)
	if string(b) != "business" {
		t.Fatal("business routing failed")
	}
}
