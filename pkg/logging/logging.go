package logging

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"gopkg.in/natefinch/lumberjack.v2"
)

// Initialize initializes the logger with the provided configuration
func Initialize(cfg *config.LogConfig) error {
	// Ensure log directory exists if output is file
	if cfg.Output == "file" {
		dir := filepath.Dir(cfg.File)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("create log directory: %w", err)
		}
	}

	// Set log level
	switch strings.ToLower(cfg.Level) {
	case "debug":
		hlog.SetLevel(hlog.LevelDebug)
	case "info":
		hlog.SetLevel(hlog.LevelInfo)
	case "warn", "warning":
		hlog.SetLevel(hlog.LevelWarn)
	case "error":
		hlog.SetLevel(hlog.LevelError)
	default:
		hlog.SetLevel(hlog.LevelInfo)
	}

	// Set log output
	if cfg.Output == "file" {
		// Use lumberjack for log rotation
		hlog.SetOutput(&lumberjack.Logger{
			Filename:   cfg.File,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   cfg.Compress,
		})
	} else {
		// Use stdout
		hlog.SetOutput(os.Stdout)
	}

	// Log format is set by default, JSON format not supported in this version

	return nil
}
