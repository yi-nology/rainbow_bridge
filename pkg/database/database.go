package database

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yi-nology/rainbow_bridge/pkg/config"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open initialises a gorm.DB according to the supplied configuration.
func Open(cfg config.DatabaseConfig) (*gorm.DB, error) {
	driver := strings.ToLower(cfg.Driver)
	var (
		dialector gorm.Dialector
		err       error
	)

	switch driver {
	case "sqlite", "sqlite3":
		if cfg.SQLite.Path == "" {
			return nil, fmt.Errorf("sqlite path must be configured")
		}
		if err := ensureDir(filepath.Dir(cfg.SQLite.Path)); err != nil {
			return nil, err
		}
		dialector = sqlite.Open(cfg.SQLite.Path)
	case "mysql":
		if cfg.MySQL.DSN == "" {
			return nil, fmt.Errorf("mysql dsn must be configured")
		}
		dialector = mysql.Open(cfg.MySQL.DSN)
	case "postgres", "postgresql":
		if cfg.Postgres.DSN == "" {
			return nil, fmt.Errorf("postgres dsn must be configured")
		}
		dialector = postgres.Open(cfg.Postgres.DSN)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.Driver)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}

func ensureDir(dir string) error {
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
