package db

import (
	"context"
	"errors"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// TestConfigAliasConflictClassifiedOnSQLite 钉住 issue #36:SQLite 是默认库,
// 别名唯一冲突必须被映射成 ErrConfigAliasExists(400),而不是裸 SQL 错误回显(500)。
// 历史漏改:索引列换成 (scope_id, alias) 后,SQLite 分支仍按旧列三元组匹配,
// 该分支永不命中。本测试走真实索引(PrepareConfigAliasConstraint),不依赖
// 人工构造的错误消息。
func TestConfigAliasConflictClassifiedOnSQLite(t *testing.T) {
	conn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := conn.DB()
	if err != nil {
		t.Fatal(err)
	}
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = raw.Close() })
	if err := conn.AutoMigrate(&model.Config{}); err != nil {
		t.Fatal(err)
	}
	if err := database.PrepareConfigAliasConstraint(context.Background(), conn); err != nil {
		t.Fatalf("prepare alias constraint: %v", err)
	}

	dao := NewConfigDAO()
	ctx := context.Background()
	first := &model.Config{ScopeID: "scope-dev", EnvironmentKey: "dev", PipelineKey: "main", Alias: "dup", ResourceKey: "one"}
	if err := dao.Create(ctx, conn, first); err != nil {
		t.Fatalf("first create: %v", err)
	}
	second := &model.Config{ScopeID: "scope-dev", EnvironmentKey: "dev", PipelineKey: "main", Alias: "dup", ResourceKey: "two"}
	err = dao.Create(ctx, conn, second)
	if !errors.Is(err, ErrConfigAliasExists) {
		t.Fatalf("alias conflict misclassified (raw error leaks to client as 500): %v", err)
	}
}
