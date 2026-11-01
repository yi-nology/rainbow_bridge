package businesshost

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Relay is reachable only through the Job's authenticated per-Pod internal
// channel. Ordinary gateway traffic never reaches this handler.
func Relay(socket string, key []byte, instance, podUID, base string) http.Handler {
	transport := &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	client := &http.Client{Transport: transport, Timeout: 8 * time.Second}
	businessURL, _ := url.Parse("http://127.0.0.1:18080")
	proxy := httputil.NewSingleHostReverseProxy(businessURL)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, e := io.ReadAll(io.LimitReader(r.Body, 4097))
		if e != nil || len(body) > 4096 || Authenticate(r, body, key) != nil {
			http.Error(w, "internal authentication failed", 401)
			return
		}
		if r.URL.Path == "/v1/command" {
			c, e := decodeCommand(body)
			if e != nil || c.Instance != instance || c.PodUID != podUID {
				http.Error(w, "host mismatch", 409)
				return
			}
			// Re-sign because proxy/server paths are identical, but body must be
			// replayed after authentication consumed the incoming request body.
			req, _ := http.NewRequestWithContext(r.Context(), "POST", "http://host/v1/command", strings.NewReader(string(body)))
			Sign(req, body, key, time.Now())
			res, e := client.Do(req)
			if e != nil {
				http.Error(w, "host IPC unavailable", 503)
				return
			}
			defer res.Body.Close()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(res.StatusCode)
			_, _ = io.Copy(w, res.Body)
			return
		}
		prefix := "/v1/business" + base
		path := strings.TrimPrefix(r.URL.Path, "/v1/business")
		if r.Method != "GET" || !strings.HasPrefix(r.URL.Path, prefix+"/") || r.URL.Query().Get("rb_pod_uid") != podUID || (path != base+"/ping" && !strings.HasPrefix(path, base+"/api/v1/runtime/")) {
			http.NotFound(w, r)
			return
		}
		r.URL.Path = path
		r.URL.RawPath = ""
		q := r.URL.Query()
		q.Del("rb_pod_uid")
		r.URL.RawQuery = q.Encode()
		r.Header.Del("X-Rainbow-Host-Signature")
		r.Header.Del("X-Rainbow-Host-Time")
		proxy.ServeHTTP(w, r)
	})
}
