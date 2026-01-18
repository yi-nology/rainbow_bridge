package main

import (
	"context"
	"flag"
	"log"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"gorm.io/gorm"
)

// 数据迁移脚本：为现有 Pipeline 数据添加 environment_key
// 使用方法：go run script/migrate_pipeline_add_env.go -env=default

var (
	envKey = flag.String("env", "default", "要关联的环境key，默认为 default")
)

func main() {
	flag.Parse()

	log.Println("========== Pipeline 数据迁移工具 ==========")
	log.Printf("目标环境: %s\n", *envKey)

	// 加载配置
	cfg := config.MustLoad("./config.yaml")

	// 连接数据库
	db, err := database.NewDatabase(cfg)
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	log.Println("数据库连接成功")

	// 执行迁移
	if err := migratePipelineData(context.Background(), db, *envKey); err != nil {
		log.Fatalf("迁移失败: %v", err)
	}

	log.Println("========== 迁移完成 ==========")
}

func migratePipelineData(ctx context.Context, db *gorm.DB, targetEnvKey string) error {
	// 查找没有 environment_key 的 Pipeline 记录
	var pipelines []model.Pipeline
	if err := db.WithContext(ctx).
		Where("environment_key = ? OR environment_key IS NULL", "").
		Find(&pipelines).Error; err != nil {
		return err
	}

	if len(pipelines) == 0 {
		log.Println("没有需要迁移的 Pipeline 数据")
		return nil
	}

	log.Printf("找到 %d 条需要迁移的 Pipeline 记录\n", len(pipelines))

	// 更新每条记录
	for i, pl := range pipelines {
		log.Printf("[%d/%d] 迁移 Pipeline: %s -> %s/%s",
			i+1, len(pipelines),
			pl.PipelineKey,
			targetEnvKey, pl.PipelineKey)

		// 更新 environment_key
		if err := db.WithContext(ctx).
			Model(&model.Pipeline{}).
			Where("id = ?", pl.ID).
			Update("environment_key", targetEnvKey).Error; err != nil {
			log.Printf("  ❌ 失败: %v", err)
			return err
		}

		log.Printf("  ✅ 成功")
	}

	log.Printf("\n共迁移 %d 条 Pipeline 记录", len(pipelines))
	return nil
}
