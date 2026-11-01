package main

import (
	"context"
	"flag"
	"github.com/yi-nology/rainbow_bridge/pkg/businesshost"
	"log"
	"os"
)

func main() {
	config := flag.String("config", "/app-config/config.yaml", "完整业务Secret配置")
	binary := flag.String("binary", "/app/server", "固定可信业务程序")
	health := flag.Bool("health", false, "检查守护IPC循环，不要求业务child运行")
	flag.Parse()
	if *health {
		key, e := os.ReadFile("/host-auth/key")
		if e != nil {
			os.Exit(1)
		}
		if _, e = businesshost.LocalStatus(context.Background(), "/ipc/business-host.sock", key, os.Getenv("RB_INSTANCE_ID"), os.Getenv("RB_POD_UID")); e != nil {
			os.Exit(1)
		}
		return
	}
	h, e := businesshost.Open(context.Background(), businesshost.Config{Instance: os.Getenv("RB_INSTANCE_ID"), PodUID: os.Getenv("RB_POD_UID"), ControlDSN: os.Getenv("RB_HOST_CONTROL_DSN"), ConfigFile: *config, Binary: *binary, KeyFile: "/host-auth/key", Socket: "/ipc/business-host.sock", RuntimeDir: "/host-runtime"})
	if e != nil {
		log.Fatal("business host initialization rejected")
	}
	defer h.Close()
	// PID1 deliberately does not turn its own termination into a clean child
	// proof. Unobserved child exits remain unresolved in durable control state.
	if e = h.Serve(context.Background()); e != nil {
		log.Fatal("business host IPC stopped")
	}
}
