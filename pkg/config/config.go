package config

import (
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config captures service level configuration loaded from config.yaml.
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	CORS     CORSConfig     `yaml:"cors"`
	Upload   UploadConfig   `yaml:"upload"`
	Intranet IntranetConfig `yaml:"intranet"`
	Redis    RedisConfig    `yaml:"redis"`
}

// RedisConfig defines Redis connection settings for distributed locking.
type RedisConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Address  string `yaml:"address"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

// CORSConfig defines CORS middleware settings.
type CORSConfig struct {
	AllowOrigin      string `yaml:"allow_origin"`
	AllowMethods     string `yaml:"allow_methods"`
	AllowHeaders     string `yaml:"allow_headers"`
	AllowCredentials bool   `yaml:"allow_credentials"`
}

// UploadConfig defines file upload constraints.
type UploadConfig struct {
	MaxSize      int64    `yaml:"max_size"`
	AllowedTypes []string `yaml:"allowed_types"`
}

// IntranetConfig defines intranet environment settings.
type IntranetConfig struct {
	Enabled bool `yaml:"enabled"`
}

// ServerConfig defines HTTP server options.
type ServerConfig struct {
	Address string `yaml:"address"`
	// BasePath removed - now injected at build time via ldflags
}

// DatabaseConfig defines the database backend configuration.
type DatabaseConfig struct {
	Driver   string         `yaml:"driver"`
	SQLite   SQLiteConfig   `yaml:"sqlite"`
	MySQL    MySQLConfig    `yaml:"mysql"`
	Postgres PostgresConfig `yaml:"postgres"`
}

// SQLiteConfig contains SQLite specific settings.
type SQLiteConfig struct {
	Path string `yaml:"path"`
}

// MySQLConfig contains MySQL specific connection details.
type MySQLConfig struct {
	DSN string `yaml:"dsn"`
}

// PostgresConfig contains PostgreSQL specific connection details.
type PostgresConfig struct {
	DSN string `yaml:"dsn"`
}

// Load reads a YAML configuration file from the provided path.
// It searches in the current working directory first, then next to the binary executable.
func Load(name string) (*Config, error) {
	cfg := defaultConfig()

	configPath := findConfigFile(name)
	if configPath == "" {
		log.Printf("Warning: config file %q not found, using defaults", name)
		return cfg, nil
	}

	log.Printf("Loading config from: %s", configPath)
	f, err := os.Open(configPath)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer func() { _ = f.Close() }()

	var parsed Config
	decoder := yaml.NewDecoder(f)
	decoder.KnownFields(true)
	if err := decoder.Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	applyDefaults(&parsed)
	return &parsed, nil
}

func defaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Address: ":8080",
			// BasePath removed - now injected at build time
		},
		Database: DatabaseConfig{
			Driver: "sqlite",
			SQLite: SQLiteConfig{
				Path: "data/resource.db",
			},
		},
		CORS: CORSConfig{
			AllowOrigin:      "*",
			AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
			AllowHeaders:     "*",
			AllowCredentials: false,
		},
		Intranet: IntranetConfig{
			Enabled: false,
		},
		Upload: UploadConfig{
			MaxSize: 10 * 1024 * 1024, // 10MB
			AllowedTypes: []string{
				// 常见图片格式
				"image/jpeg",               // .jpg, .jpeg
				"image/png",                // .png
				"image/gif",                // .gif
				"image/webp",               // .webp
				"image/svg+xml",            // .svg
				"image/bmp",                // .bmp
				"image/x-ms-bmp",           // .bmp (Windows)
				"image/tiff",               // .tif, .tiff
				"image/x-icon",             // .ico
				"image/vnd.microsoft.icon", // .ico
				"image/heic",               // .heic (iOS)
				"image/heif",               // .heif
				// 压缩包格式
				"application/zip",              // .zip
				"application/x-zip-compressed", // .zip
				"application/x-rar-compressed", // .rar
				"application/x-7z-compressed",  // .7z
				"application/x-tar",            // .tar
				"application/gzip",             // .gz
				"application/x-gzip",           // .gz
				"application/x-bzip2",          // .bz2
				// 字体文件格式
				"font/ttf",               // .ttf
				"font/otf",               // .otf
				"font/woff",              // .woff
				"font/woff2",             // .woff2
				"application/x-font-ttf", // .ttf
				"application/x-font-otf", // .otf
				"application/font-woff",  // .woff
				"application/font-woff2", // .woff2
				// 文档格式
				"application/pdf",    // .pdf
				"application/msword", // .doc
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
				"application/vnd.ms-excel", // .xls
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",         // .xlsx
				"application/vnd.ms-powerpoint",                                             // .ppt
				"application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
				// 文本格式
				"text/plain",       // .txt
				"text/csv",         // .csv
				"text/html",        // .html
				"text/css",         // .css
				"text/javascript",  // .js
				"application/json", // .json
				"application/xml",  // .xml
				"text/xml",         // .xml
				// 音视频格式
				"audio/mpeg",      // .mp3
				"audio/wav",       // .wav
				"audio/ogg",       // .ogg
				"video/mp4",       // .mp4
				"video/mpeg",      // .mpeg
				"video/webm",      // .webm
				"video/quicktime", // .mov
			},
		},
	}
}

func applyDefaults(cfg *Config) {
	if cfg.Server.Address == "" {
		cfg.Server.Address = ":8080"
	}
	// BasePath removed - now injected at build time
	if cfg.Database.Driver == "" {
		cfg.Database.Driver = "sqlite"
	}
	if cfg.Database.SQLite.Path == "" {
		cfg.Database.SQLite.Path = "data/resource.db"
	}
}

// findConfigFile searches for a config file in the current directory first,
// then next to the binary executable. Returns the full path or empty string.
func findConfigFile(name string) string {
	// 1. Current working directory
	if _, err := os.Stat(name); err == nil {
		abs, _ := filepath.Abs(name)
		return abs
	}

	// 2. Next to the binary executable
	exe, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exe)
		candidate := filepath.Join(exeDir, name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	return ""
}

// NormalizeBasePath cleans up user input and returns a URL path prefix suitable for routing.
// Examples:
//
//	"", "/", " ."        -> ""
//	"rainbow"            -> "/rainbow"
//	"/rainbow/"          -> "/rainbow"
//	"/nested/prefix/"    -> "/nested/prefix"
func NormalizeBasePath(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	cleaned := path.Clean("/" + strings.TrimPrefix(trimmed, "/"))
	if cleaned == "." || cleaned == "/" {
		return ""
	}
	return strings.TrimSuffix(cleaned, "/")
}
