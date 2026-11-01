package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	authhandler "github.com/yi-nology/rainbow_bridge/biz/handler/auth"
	maintenancehandler "github.com/yi-nology/rainbow_bridge/biz/handler/maintenance"
	"github.com/yi-nology/rainbow_bridge/biz/maintenanceweb"
	"github.com/yi-nology/rainbow_bridge/biz/middleware"
	authrouter "github.com/yi-nology/rainbow_bridge/biz/router/auth"
	maintenancerouter "github.com/yi-nology/rainbow_bridge/biz/router/maintenance"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/authauthority"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"github.com/yi-nology/rainbow_bridge/pkg/static"
	"os"
	"time"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
func run() error {
	file := flag.String("config", "console.yaml", "独立控制服务配置")
	init := flag.Bool("initialize", false, "显式部署初始化Job，不启动HTTP")
	source := flag.String("source-config", "", "初始化：源应用配置")
	flag.Parse()
	cfg, e := maintenanceweb.LoadConfig(*file)
	if e != nil {
		return e
	}
	ctx := context.Background()
	if *init {
		return initialize(ctx, cfg, *source)
	}
	config.ApplyAuthDefaults(&cfg.App)
	origins, e := config.ValidateAuthConfig(&cfg.App)
	if e != nil {
		return e
	}
	idle, absolute, e := config.AuthTimeoutPair(&cfg.App)
	if e != nil {
		return e
	}
	svc, e := service.NewAuthenticationService(ctx, &cfg.App)
	if e != nil {
		return e
	}
	defer svc.CloseDistributedControl()
	svc.SetAuthSettings(service.AuthSettings{CookieName: cfg.App.Auth.CookieName, CookieSecure: config.AuthCookieSecure(&cfg.App), TrustedOrigins: origins, IdleTimeout: idle, AbsoluteTimeout: absolute, BasePath: cfg.App.Server.BasePath})
	store, e := maintenanceweb.Open(ctx, cfg)
	if e != nil {
		return e
	}
	defer store.Pool.Close()
	address := cfg.Address
	if address == "" {
		address = ":8081"
	}
	h := server.Default(server.WithHostPorts(address), server.WithBasePath(cfg.App.Server.BasePath), server.WithMaxRequestBodySize(8192))
	h.Use(middleware.CORS(&cfg.App.CORS, origins, cfg.App.Server.BasePath))
	// Logout revokes result-only grants too; no fallback grants are minted by logout.
	h.Use(func(ctx context.Context, c *app.RequestContext) {
		token := string(c.Cookie(svc.AuthSettings().CookieName))
		c.Next(ctx)
		if string(c.Path()) == cfg.App.Server.BasePath+"/api/v1/auth/logout" && c.Response.StatusCode() == 200 {
			_ = store.RevokeResults(ctx, token)
		}
	})
	api := &maintenanceweb.HTTP{Store: store, Auth: svc}
	authhandler.SetService(svc)
	maintenancehandler.SetAPI(api)
	authrouter.Register(h)
	maintenancerouter.Register(h)
	h.GET("/api/v1/backup/capabilities", api.Serve("discovery"))
	h.GET("/ping", func(ctx context.Context, c *app.RequestContext) {
		check, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		if _, _, _, e := svc.AuthorityState(check); e != nil {
			c.JSON(503, map[string]any{"code": 503, "error_type": "CONTROL_UNAVAILABLE"})
			return
		}
		c.JSON(200, map[string]any{"code": 200, "component": "maintenance-console"})
	})
	h.GET("/internal/business-ready", func(ctx context.Context, c *app.RequestContext) {
		_, mode, _, e := svc.AuthorityState(ctx)
		if e != nil || mode != "active" {
			c.Status(403)
			return
		}
		c.Status(204)
	})
	files, e := static.WebFS()
	if e != nil {
		return e
	}
	h.NoRoute(maintenanceweb.Static(files, cfg.App.Server.BasePath))
	loop, cancel := context.WithCancel(ctx)
	defer cancel()
	go store.Loop(loop)
	h.Spin()
	return nil
}
func initialize(ctx context.Context, c maintenanceweb.Config, file string) error {
	// Dedicated init identity is never mounted in serving console or ordinary application Pods.
	dsn := os.Getenv("RB_AUTH_INIT_DSN")
	role := os.Getenv("RB_AUTH_SOURCE_ROLE")
	if dsn == "" || role == "" {
		return errors.New("初始化缺少独立部署身份")
	}
	app, e := config.Load(file)
	if e != nil {
		return errors.New("源配置不可读取")
	}
	source, e := database.Open(app.Database)
	if e != nil {
		return errors.New("源数据库不可读取")
	}
	db, _ := source.DB()
	defer db.Close()
	dc := config.DatabaseConfig{Driver: "postgres"}
	dc.Postgres.DSN = dsn
	control, e := database.Open(dc)
	if e != nil {
		return errors.New("初始化控制连接不可用")
	}
	sq, _ := control.DB()
	defer sq.Close()
	if e = authauthority.Migrate(ctx, source, control, c.InstanceID, role); e != nil {
		return e
	}
	return control.WithContext(ctx).Exec(maintenanceweb.Schema).Error
}
