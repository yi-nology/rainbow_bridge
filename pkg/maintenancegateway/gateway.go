// Package maintenancegateway keeps management and SPA routes alive while business Pods stop.
package maintenancegateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

func New(base, consoleURL, businessURL string) (http.Handler, error) {
	parse := func(raw string) (*url.URL, error) {
		u, e := url.Parse(raw)
		if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Path != "" {
			return nil, errors.New("gateway upstream无效")
		}
		return u, nil
	}
	console, e := parse(consoleURL)
	if e != nil {
		return nil, e
	}
	business, e := parse(businessURL)
	if e != nil {
		return nil, e
	}
	base = "/" + strings.Trim(base, "/")
	if base == "/" {
		base = ""
	}
	envelope := func(w http.ResponseWriter, status int, kind, message string) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"code": status, "msg": message, "error_type": kind})
	}
	proxy := func(u *url.URL, kind, message string) *httputil.ReverseProxy {
		p := httputil.NewSingleHostReverseProxy(u)
		p.Transport = &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 30 * time.Second, IdleConnTimeout: 60 * time.Second}
		p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, e error) { envelope(w, 503, kind, message) }
		return p
	}
	cp := proxy(console, "CONTROL_UNAVAILABLE", "控制服务暂不可用")
	bp := proxy(business, "MAINTENANCE_ACTIVE", "业务服务暂停，请查看维护任务")
	client := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{MaxIdleConnsPerHost: 4}}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if base != "" && r.URL.Path == "/" {
			http.Redirect(w, r, base+"/", http.StatusTemporaryRedirect)
			return
		}
		if base != "" && r.URL.Path != base && !strings.HasPrefix(r.URL.Path, base+"/") {
			http.NotFound(w, r)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, base)
		management := !strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/api/v1/auth/") || strings.HasPrefix(path, "/api/v1/maintenance/") || path == "/api/v1/backup/capabilities"
		if management {
			cp.ServeHTTP(w, r)
			return
		}
		check, e := http.NewRequestWithContext(r.Context(), "GET", consoleURL+base+"/internal/business-ready", nil)
		if e != nil {
			envelope(w, 503, "CONTROL_UNAVAILABLE", "控制服务暂不可用")
			return
		}
		res, e := client.Do(check)
		if e != nil {
			envelope(w, 503, "CONTROL_UNAVAILABLE", "控制服务暂不可用")
			return
		}
		res.Body.Close()
		if res.StatusCode != 204 {
			envelope(w, 503, "MAINTENANCE_ACTIVE", "业务服务暂停，请查看维护任务")
			return
		}
		bp.ServeHTTP(w, r)
	}), nil
}
