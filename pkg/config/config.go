package config

import (
	"errors"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config captures service level configuration loaded from config.yaml.
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
}

// ServerConfig defines HTTP server options.
type ServerConfig struct {
	Address string `yaml:"address"`
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
			Address: ":8080",
		},
		Database: DatabaseConfig{
			Driver: "sqlite",
			SQLite: SQLiteConfig{
				Path: "data/resource.db",
			},
		},
	}
}

func applyDefaults(cfg *Config) {
	if cfg.Server.Address == "" {
		cfg.Server.Address = ":8080"
	}
	if cfg.Database.Driver == "" {
		cfg.Database.Driver = "sqlite"
	}
	if cfg.Database.SQLite.Path == "" {
		cfg.Database.SQLite.Path = "data/resource.db"
	}
}
