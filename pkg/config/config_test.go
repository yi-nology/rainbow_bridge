package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultsWhenMissing(t *testing.T) {
	cfg, err := Load("non-existent-config.yaml")
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	assertDefaultConfig(t, cfg)
}

func TestLoadWithPartialConfigAppliesDefaults(t *testing.T) {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	content := `
server:
  address: ":9090"
database:
  driver: ""
  sqlite: {}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write temp config: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.Server.Address != ":9090" {
		t.Fatalf("expected server address :9090, got %s", cfg.Server.Address)
	}
	if cfg.Database.Driver != "sqlite" {
		t.Fatalf("expected database driver sqlite, got %s", cfg.Database.Driver)
	}
	if cfg.Database.SQLite.Path != "data/resource.db" {
		t.Fatalf("expected sqlite path data/resource.db, got %s", cfg.Database.SQLite.Path)
	}
}

func assertDefaultConfig(t *testing.T, cfg *Config) {
	t.Helper()
	if cfg == nil {
		t.Fatalf("config is nil")
	}
	if cfg.Server.Address != ":8080" {
		t.Fatalf("expected default address :8080, got %s", cfg.Server.Address)
	}
	if cfg.Database.Driver != "sqlite" {
		t.Fatalf("expected default driver sqlite, got %s", cfg.Database.Driver)
	}
	if cfg.Database.SQLite.Path != "data/resource.db" {
		t.Fatalf("expected default sqlite path data/resource.db, got %s", cfg.Database.SQLite.Path)
	}
}
