// admin-password-reset 是本机恢复入口:重置唯一管理员密码并撤销全部会话。
// 只复用配置、数据库连接与密码编码,不启动 HTTP 服务、不清空业务表。
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
)

func main() {
	configPath := flag.String("config", "config.yaml", "配置文件路径")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}
	newPassword := os.Getenv(service.AdminResetPasswordEnv)
	if newPassword == "" {
		log.Fatalf("请通过环境变量 %s 提供新密码(不放在命令行参数里)", service.AdminResetPasswordEnv)
	}

	guard, err := maintcontrol.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer guard.Close()
	if _, err = guard.Check(context.Background(), false); err != nil {
		log.Fatal(err)
	}
	db, err := database.Open(cfg.Database)
	if err != nil {
		log.Fatalf("打开数据库失败: %v", err)
	}
	// Startup DDL is permitted only after the same active-generation check.
	svc := service.NewService(db, nil, cfg.Server.BasePath, cfg)
	defer svc.CloseDistributedControl()
	if err := db.AutoMigrate(&model.AuthUser{}, &model.AuthSession{}); err != nil {
		log.Fatalf("迁移认证表失败: %v", err)
	}

	username, err := svc.ResetAdminPassword(context.Background(), newPassword)
	if err != nil {
		// 失败原因里不含密码
		log.Fatalf("重置密码失败: %v", err)
	}
	fmt.Printf("已重置管理员 %q 的密码并撤销其全部会话;业务表未改动。\n", username)
}
