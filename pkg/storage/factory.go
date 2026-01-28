package storage

import (
	"fmt"

	"github.com/yi-nology/rainbow_bridge/pkg/storage/local"
	"github.com/yi-nology/rainbow_bridge/pkg/storage/s3"
)

// Config holds storage configuration.
type Config struct {
	Type  string      `yaml:"type"`
	Local LocalConfig `yaml:"local"`
	S3    S3Config    `yaml:"s3"`
}

// LocalConfig holds local storage configuration.
type LocalConfig struct {
	BasePath string `yaml:"base_path"`
}

// S3Config holds S3-compatible storage configuration.
type S3Config struct {
	Endpoint  string `yaml:"endpoint"`
	Region    string `yaml:"region"`
	Bucket    string `yaml:"bucket"`
	AccessKey string `yaml:"access_key"`
	SecretKey string `yaml:"secret_key"`
	UseSSL    bool   `yaml:"use_ssl"`
	PathStyle bool   `yaml:"path_style"`
	URLMode   string `yaml:"url_mode"`
}

// New creates a storage adapter based on configuration.
func New(cfg Config) (Storage, error) {
	switch cfg.Type {
	case "", "local":
		basePath := cfg.Local.BasePath
		if basePath == "" {
			basePath = "data/uploads"
		}
		return local.New(basePath)

	case "s3":
		return s3.New(s3.Config{
			Endpoint:  cfg.S3.Endpoint,
			Region:    cfg.S3.Region,
			Bucket:    cfg.S3.Bucket,
			AccessKey: cfg.S3.AccessKey,
			SecretKey: cfg.S3.SecretKey,
			UseSSL:    cfg.S3.UseSSL,
			PathStyle: cfg.S3.PathStyle,
			URLMode:   cfg.S3.URLMode,
		})

	default:
		return nil, fmt.Errorf("unsupported storage type: %s", cfg.Type)
	}
}

// DefaultConfig returns the default storage configuration (local storage).
func DefaultConfig() Config {
	return Config{
		Type: "local",
		Local: LocalConfig{
			BasePath: "data/uploads",
		},
		S3: S3Config{
			Region:  "us-east-1",
			URLMode: "presigned",
		},
	}
}
