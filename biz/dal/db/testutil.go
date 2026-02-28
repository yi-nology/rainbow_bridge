package db

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// SetupTestDB creates an in-memory SQLite database for testing
func SetupTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent), // Reduce log noise in tests
	})
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	// Auto migrate all tables
	if err := db.AutoMigrate(
		&model.Environment{},
		&model.Pipeline{},
		&model.Config{},
		&model.Asset{},
	); err != nil {
		t.Fatalf("Failed to migrate tables: %v", err)
	}

	return db
}

// CleanupTestDB closes the database connection
func CleanupTestDB(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	if err != nil {
		t.Logf("Warning: Failed to get underlying DB: %v", err)
		return
	}
	if err := sqlDB.Close(); err != nil {
		t.Logf("Warning: Failed to close DB: %v", err)
	}
}

// CreateTestEnvironment creates a test environment with default values
func CreateTestEnvironment(t *testing.T, db *gorm.DB, key string) *model.Environment {
	t.Helper()
	dao := NewEnvironmentDAO()
	env := &model.Environment{
		EnvironmentKey:  key,
		EnvironmentName: "Test " + key,
		Description:     "Test environment",
		SortOrder:       0,
		IsActive:        true,
	}
	if err := dao.Create(context.Background(), db, env); err != nil {
		t.Fatalf("Failed to create test environment: %v", err)
	}
	return env
}

// CreateTestPipeline creates a test pipeline with default values
func CreateTestPipeline(t *testing.T, db *gorm.DB, envKey, pipeKey string) *model.Pipeline {
	t.Helper()
	dao := NewPipelineDAO()
	pipe := &model.Pipeline{
		EnvironmentKey: envKey,
		PipelineKey:    pipeKey,
		PipelineName:   "Test " + pipeKey,
		Description:    "Test pipeline",
		SortOrder:      0,
		IsActive:       true,
	}
	if err := dao.Create(context.Background(), db, pipe); err != nil {
		t.Fatalf("Failed to create test pipeline: %v", err)
	}
	return pipe
}

// CreateTestConfig creates a test config with default values
func CreateTestConfig(t *testing.T, db *gorm.DB, envKey, pipeKey, resourceKey string) *model.Config {
	t.Helper()
	dao := NewConfigDAO()
	cfg := &model.Config{
		ResourceKey:    resourceKey,
		EnvironmentKey: envKey,
		PipelineKey:    pipeKey,
		Name:           "test_config",
		Alias:          "Test Config",
		Type:           "text",
		Content:        "test value",
	}
	if err := dao.Create(context.Background(), db, cfg); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}
	return cfg
}
