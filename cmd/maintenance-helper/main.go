package main

import (
	"context"
	"errors"
	"flag"
	"github.com/yi-nology/rainbow_bridge/biz/maintenanceweb"
	"github.com/yi-nology/rainbow_bridge/pkg/businesshost"
	"github.com/yi-nology/rainbow_bridge/pkg/maintenanceconsole"
	"github.com/yi-nology/rainbow_bridge/pkg/maintenancegateway"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	file := flag.String("config", "/console/console.yaml", "独立控制配置")
	flag.Parse()
	c, e := maintenanceweb.LoadConfig(*file)
	if e != nil {
		log.Fatal("helper configuration invalid")
	}
	c.Address = "127.0.0.1:8081"
	go func() {
		if maintenanceconsole.Serve(ctx, c) != nil {
			log.Fatal("helper console stopped")
		}
	}()
	key, e := os.ReadFile("/host-auth/key")
	if e != nil || len(key) < 32 {
		log.Fatal("helper authentication unavailable")
	}
	go func() {
		s := &http.Server{Addr: ":19090", Handler: businesshost.Relay("/ipc/business-host.sock", key, c.InstanceID, os.Getenv("RB_POD_UID"), c.App.Server.BasePath), ReadHeaderTimeout: 3 * time.Second}
		if s.ListenAndServe() != nil {
			log.Fatal("helper internal channel stopped")
		}
	}()
	g, e := maintenancegateway.New(c.App.Server.BasePath, "http://127.0.0.1:8081", "http://127.0.0.1:18080")
	if e != nil {
		log.Fatal("helper routing invalid")
	}
	public := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/helper-health" {
			w.WriteHeader(204)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, c.App.Server.BasePath)
		if strings.HasPrefix(path, "/internal/") || strings.HasPrefix(path, "/v1/") {
			http.NotFound(w, r)
			return
		}
		g.ServeHTTP(w, r)
	})
	s := &http.Server{Addr: ":8080", Handler: public, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.Shutdown(shutdown)
	}()
	if e = s.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
		log.Fatal("helper public entry stopped")
	}
}
