package businesshost

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"syscall"
	"time"
)

func (h *Host) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && r.URL.Path == "/health" {
			w.WriteHeader(204)
			return
		}
		if r.Method != "POST" || r.URL.Path != "/v1/command" {
			http.NotFound(w, r)
			return
		}
		body, e := io.ReadAll(io.LimitReader(r.Body, 4097))
		if e != nil || len(body) > 4096 {
			http.Error(w, "invalid request", 400)
			return
		}
		if authenticate(r, body, h.key, time.Now()) != nil {
			http.Error(w, "internal authentication failed", 401)
			return
		}
		c, e := decodeCommand(body)
		if e != nil || c.Instance != h.cfg.Instance || c.PodUID != h.cfg.PodUID {
			http.Error(w, "host identity mismatch", 409)
			return
		}
		switch c.Action {
		case "stop":
			e = h.Stop(r.Context(), c)
		case "start":
			e = h.Start(r.Context(), &c)
		}
		w.Header().Set("Content-Type", "application/json")
		if e != nil {
			w.WriteHeader(409)
		}
		// Only state and identities are exposed; never raw DB/exec errors/config.
		_ = json.NewEncoder(w).Encode(h.Status())
	})
}

func (h *Host) Serve(ctx context.Context) error {
	// Never unlink an unverified stale socket or another host's endpoint.
	if info, e := os.Lstat(h.cfg.Socket); e == nil {
		if info.Mode()&os.ModeSocket == 0 {
			return errors.New("IPC path is not a socket")
		}
		c, dialErr := net.DialTimeout("unix", h.cfg.Socket, time.Second)
		if dialErr == nil {
			c.Close()
			return errors.New("another host is listening")
		}
		if !errors.Is(dialErr, syscall.ECONNREFUSED) {
			return errors.New("previous IPC owner is unknown")
		}
		if e = os.Remove(h.cfg.Socket); e != nil {
			return e
		}
	}
	ln, e := net.Listen("unix", h.cfg.Socket)
	if e != nil {
		return errors.New("host IPC unavailable; inspect previous host before replacing socket")
	}
	defer ln.Close()
	if e = os.Chmod(h.cfg.Socket, 0660); e != nil {
		return e
	}
	s := &http.Server{Handler: h.Handler(), ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 8 * time.Second}
	go func() {
		<-ctx.Done()
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.Shutdown(stop)
	}()
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				launch, cancel := context.WithTimeout(ctx, 3*time.Second)
				_ = h.Start(launch, nil)
				cancel()
			}
		}
	}()
	return s.Serve(ln)
}
