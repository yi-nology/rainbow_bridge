package config

import (
	"errors"
	"fmt"
	"os"
	"path"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config captures service level configuration loaded from config.yaml.
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Storage  StorageConfig  `yaml:"storage"`
	CORS     CORSConfig     `yaml:"cors"`
	Upload   UploadConfig   `yaml:"upload"`
}

// StorageConfig defines the storage backend configuration.
type StorageConfig struct {
	Type  string             `yaml:"type"` // "local" or "s3"
	Local LocalStorageConfig `yaml:"local"`
	S3    S3StorageConfig    `yaml:"s3"`
}

// LocalStorageConfig contains local filesystem storage settings.
type LocalStorageConfig struct {
	BasePath string `yaml:"base_path"` // Default: "data/uploads"
}

// S3StorageConfig contains S3-compatible storage settings.
type S3StorageConfig struct {
	Endpoint  string `yaml:"endpoint"`   // S3 endpoint URL (e.g., http://minio:9000)
	Region    string `yaml:"region"`     // AWS region
	Bucket    string `yaml:"bucket"`     // Bucket name
	AccessKey string `yaml:"access_key"` // Access key ID
	SecretKey string `yaml:"secret_key"` // Secret access key
	UseSSL    bool   `yaml:"use_ssl"`    // Use HTTPS
	PathStyle bool   `yaml:"path_style"` // Use path-style URLs (required for MinIO)
	URLMode   string `yaml:"url_mode"`   // "presigned" or "proxy"
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

// ServerConfig defines HTTP server options.
type ServerConfig struct {
	Address  string `yaml:"address"`
	BasePath string `yaml:"base_path"`
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
func Load(path string) (*Config, error) {
	cfg := defaultConfig()

	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer f.Close()

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
			Address:  ":8080",
			BasePath: "rainbow-bridge",
		},
		Database: DatabaseConfig{
			Driver: "sqlite",
			SQLite: SQLiteConfig{
				Path: "data/resource.db",
			},
		},
		Storage: StorageConfig{
			Type: "local",
			Local: LocalStorageConfig{
				BasePath: "data/uploads",
			},
			S3: S3StorageConfig{
				Region:  "us-east-1",
				URLMode: "presigned",
			},
		},
		CORS: CORSConfig{
			AllowOrigin:      "*",
			AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
			AllowHeaders:     "*",
			AllowCredentials: false,
		},
		Upload: UploadConfig{
			MaxSize: 10 * 1024 * 1024, // 10MB
			AllowedTypes: []string{
				"image/jpeg",
				"image/png",
				"image/gif",
				"image/webp",
				"application/json",
			},
		},
	}
}

func applyDefaults(cfg *Config) {
	if cfg.Server.Address == "" {
		cfg.Server.Address = ":8080"
	}
	cfg.Server.BasePath = NormalizeBasePath(cfg.Server.BasePath)
	if cfg.Database.Driver == "" {
		cfg.Database.Driver = "sqlite"
	}
	if cfg.Database.SQLite.Path == "" {
		cfg.Database.SQLite.Path = "data/resource.db"
	}
	// Storage defaults
	if cfg.Storage.Type == "" {
		cfg.Storage.Type = "local"
	}
	if cfg.Storage.Local.BasePath == "" {
		cfg.Storage.Local.BasePath = "data/uploads"
	}
	if cfg.Storage.S3.Region == "" {
		cfg.Storage.S3.Region = "us-east-1"
	}
	if cfg.Storage.S3.URLMode == "" {
		cfg.Storage.S3.URLMode = "presigned"
	}
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
