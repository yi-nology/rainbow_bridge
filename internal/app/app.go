package app

import (
	"context"
	"log"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"
	hconfig "github.com/cloudwego/hertz/pkg/common/config"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	versionhandler "github.com/yi-nology/rainbow_bridge/biz/handler/version"
	"github.com/yi-nology/rainbow_bridge/biz/middleware"
	bizrouter "github.com/yi-nology/rainbow_bridge/biz/router"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	appconfig "github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"github.com/yi-nology/rainbow_bridge/pkg/lock"
	appredis "github.com/yi-nology/rainbow_bridge/pkg/redis"
)

type BuildConfig struct {
	Version   string
	GitCommit string
	BuildTime string
	BasePath  string
}

type Application struct {
	H        *server.Hertz
	Svc      *service.Service
	Config   *appconfig.Config
	BasePath string
}

func Initialize(cfgPath string, buildCfg BuildConfig) (*Application, error) {
	cfg, err := appconfig.Load(cfgPath)
	if err != nil {
		return nil, err
	}

	db, err := database.Open(cfg.Database)
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(&model.Config{}, &model.Asset{}, &model.Environment{}, &model.Pipeline{}); err != nil {
		return nil, err
	}

	if err := service.MigrateConfigDefaults(db); err != nil {
		return nil, err
	}

	if err := service.EnsureSystemDefaults(context.Background(), db); err != nil {
		return nil, err
	}

	if cfg.Redis.Enabled {
		redisClient, redisErr := appredis.NewClient(cfg.Redis)
		if redisErr != nil {
			return nil, redisErr
		}
		writeLock := lock.New(redisClient, "rainbow_bridge:write_lock", 30*time.Second, 60*time.Second)
		middleware.InitWriteLock(writeLock)
		log.Printf("Redis distributed write lock enabled (%s)", cfg.Redis.Address)
	}

	basePath := appconfig.NormalizeBasePath(buildCfg.BasePath)
	opts := []hconfig.Option{server.WithHostPorts(cfg.Server.Address)}
	if basePath != "" {
		opts = append(opts, server.WithBasePath(basePath))
	}
	h := server.Default(opts...)

	svc := service.NewService(db, basePath)

	versionhandler.AppVersion = buildCfg.Version
	versionhandler.AppGitCommit = buildCfg.GitCommit
	versionhandler.AppBuildTime = buildCfg.BuildTime
	versionhandler.IsIntranet = cfg.Intranet.Enabled

	bizrouter.InitHandlers(svc)

	if err := svc.MigrateToFullAssetPaths(context.Background()); err != nil {
		log.Printf("Warning: failed to migrate asset paths: %v", err)
	}

	h.Use(middleware.Recovery())
	h.Use(middleware.Logging())
	h.Use(middleware.CORS(&cfg.CORS))
	h.Use(middleware.Auth())

	return &Application{
		H:        h,
		Svc:      svc,
		Config:   cfg,
		BasePath: basePath,
	}, nil
}
