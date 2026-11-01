// maintenance-backup is external to the serving application. No arbitrary SQL
// dumps or application background jobs are accepted by this tool.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/yi-nology/rainbow_bridge/biz/maintenance"
	"github.com/yi-nology/rainbow_bridge/biz/maintenanceweb"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	path := flag.String("config", "maintenance.yaml", "受限运维配置文件")
	webTask := flag.String("web-task", "", "由控制服务固定Job传入的task UUID")
	webConfig := flag.String("web-config", "", "受限worker配置")
	action := flag.String("action", "plan", "plan|backup|verify|restore-plan|restore|status|resume|abort|bootstrap")
	request := flag.String("request-id", "", "写命令的固定 UUID")
	backup := flag.String("backup-id", "", "控制索引中 available 的备份 UUID")
	confirm := flag.String("confirm", "", "预览或原作业的精确 fingerprint")
	appConfig := flag.String("app-config", "", "仅 bootstrap：应用配置文件")
	flag.Parse()
	cfg, err := maintenance.LoadConfig(*path)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Hour)
	defer cancel()
	if *webTask != "" {
		web, e := maintenanceweb.LoadConfig(*webConfig)
		if e != nil {
			return e
		}
		s, e := maintenanceweb.Open(ctx, web)
		if e != nil {
			return e
		}
		defer s.Pool.Close()
		return s.Worker(ctx, cfg, *webTask)
	}
	print := func(v any) error {
		b, e := json.MarshalIndent(v, "", "  ")
		if e != nil {
			return e
		}
		fmt.Println(string(b))
		return nil
	}
	if *action == "status" {
		o, e := maintenance.Status(ctx, cfg, *request)
		if e != nil {
			return errors.New("状态不可读取，请核对控制连接和 request-id")
		}
		return print(o)
	}
	if *action == "bootstrap" {
		app, err := config.Load(*appConfig)
		if err != nil {
			return errors.New("初始化应用配置不可读取")
		}
		fp, err := maintcontrol.Fingerprint(app)
		if err != nil {
			return err
		}
		if *confirm != cfg.InstanceID {
			return errors.New("bootstrap 必须确认 instance_id")
		}
		return maintenance.Bootstrap(ctx, cfg.ControlDSN, cfg.InstanceID, maintcontrol.Identity{Generation: app.Backup.Distributed.Generation, SessionGeneration: app.Backup.Distributed.SessionGeneration, Fingerprint: fp})
	}
	k, err := maintenance.NewKube(cfg.Kubernetes, cfg.Namespace)
	if err != nil {
		return err
	}
	if *action == "plan" || *action == "restore-plan" {
		kind := "backup"
		if *action == "restore-plan" {
			kind = "restore"
		}
		p, e := maintenance.BuildPlan(ctx, cfg, k, kind, *backup)
		if e != nil {
			return e
		}
		return print(p)
	}
	if *action == "verify" {
		app, _, err := maintenance.ApplicationConfig(ctx, k, cfg)
		if err != nil {
			return err
		}
		s, err := maintenance.NewOperatorStore(app, cfg)
		if err != nil {
			return err
		}
		m, sha, err := maintenance.LoadManifest(ctx, cfg, s, *backup)
		if err != nil {
			return err
		}
		return print(map[string]any{"backup_id": m.BackupID, "manifest_sha256": sha, "tables": len(m.Tables), "objects": len(m.Objects), "bytes": m.Bytes, "verified": true})
	}
	switch *action {
	case "backup", "restore", "resume", "abort":
		o, e := maintenance.Run(ctx, cfg, k, *action, *request, *confirm, *backup)
		if o.ID != "" {
			if err = print(o); err != nil {
				return err
			}
		}
		return e
	default:
		return errors.New("未知维护命令")
	}
}
