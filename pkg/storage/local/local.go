// Package local implements the local filesystem storage adapter.
package local

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Storage implements the storage.Storage interface using local filesystem.
type Storage struct {
	basePath string
}

// New creates a new local storage adapter.
// basePath is the root directory for storing files (e.g., "data/uploads").
func New(basePath string) (*Storage, error) {
	if basePath == "" {
		basePath = "data/uploads"
	}

	// Ensure base directory exists
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("create storage directory: %w", err)
	}

	return &Storage{basePath: basePath}, nil
}

// PutObject writes a file to the local filesystem.
func (s *Storage) PutObject(ctx context.Context, key string, data io.Reader, contentType string, size int64) error {
	fullPath := s.keyToPath(key)

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}

	// Create file
	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	// Write data
	if _, err := io.Copy(f, data); err != nil {
		os.Remove(fullPath)
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

// GetObject reads a file from the local filesystem.
func (s *Storage) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	fullPath := s.keyToPath(key)

	f, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("object not found: %s", key)
		}
		return nil, fmt.Errorf("open file: %w", err)
	}

	return f, nil
}

// DeleteObject removes a file from the local filesystem.
func (s *Storage) DeleteObject(ctx context.Context, key string) error {
	fullPath := s.keyToPath(key)

	if err := os.Remove(fullPath); err != nil {
		if os.IsNotExist(err) {
			return nil // Already deleted
		}
		return fmt.Errorf("delete file: %w", err)
	}

	// Try to remove parent directory if empty
	dir := filepath.Dir(fullPath)
	os.Remove(dir) // Ignore error if directory is not empty

	return nil
}

// ObjectExists checks if a file exists in the local filesystem.
func (s *Storage) ObjectExists(ctx context.Context, key string) (bool, error) {
	fullPath := s.keyToPath(key)

	_, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("stat file: %w", err)
	}

	return true, nil
}

// GenerateURL returns the API path for accessing the file.
func (s *Storage) GenerateURL(ctx context.Context, key string, fileName string) (string, error) {
	// Extract fileID from key (format: {fileID}/{fileName})
	parts := strings.SplitN(key, "/", 2)
	fileID := parts[0]

	return fmt.Sprintf("/api/v1/asset/file/%s/%s", fileID, fileName), nil
}

// Type returns "local" as the storage type identifier.
func (s *Storage) Type() string {
	return "local"
}

// keyToPath converts an object key to a full filesystem path.
func (s *Storage) keyToPath(key string) string {
	return filepath.Join(s.basePath, key)
}

// BasePath returns the base path of the storage.
func (s *Storage) BasePath() string {
	return s.basePath
}
