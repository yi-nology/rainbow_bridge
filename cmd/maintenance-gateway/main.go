package main

import (
	"flag"
	"fmt"
	"github.com/yi-nology/rainbow_bridge/pkg/maintenancegateway"
	"net/http"
	"os"
	"time"
)

func main() {
	address := flag.String("address", ":8082", "监听地址")
	base := flag.String("base-path", "/rainbow-bridge", "固定站点前缀")
	console := flag.String("console", "http://maintenance-console:8081", "独立控制Service")
	business := flag.String("business", "http://business:8080", "业务Service")
	flag.Parse()
	h, e := maintenancegateway.New(*base, *console, *business)
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	s := &http.Server{Addr: *address, Handler: h, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	if e = s.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, "gateway停止")
		os.Exit(1)
	}
}
