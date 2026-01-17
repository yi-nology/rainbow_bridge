package validator

import (
	"errors"
	"net/http"
	"strings"
)

// Default upload constraints
const (
	DefaultMaxUploadSize = 10 * 1024 * 1024 // 10MB
)

// DefaultAllowedMimeTypes contains the default whitelist of allowed MIME types for uploads.
var DefaultAllowedMimeTypes = map[string]bool{
	"image/jpeg":       true,
	"image/png":        true,
	"image/gif":        true,
	"image/webp":       true,
	"image/svg+xml":    true,
	"application/json": true,
	"text/plain":       true,
	"application/pdf":  true,
}

// UploadConfig defines constraints for file uploads.
type UploadConfig struct {
	MaxFileSize      int64
	AllowedMimeTypes map[string]bool
}

// DefaultUploadConfig returns the default upload configuration.
func DefaultUploadConfig() *UploadConfig {
	return &UploadConfig{
		MaxFileSize:      DefaultMaxUploadSize,
		AllowedMimeTypes: DefaultAllowedMimeTypes,
	}
}

// ValidateFileSize checks if the file size is within the allowed limit.
func (c *UploadConfig) ValidateFileSize(size int64) error {
	if size <= 0 {
		return errors.New("file is empty")
	}
	if size > c.MaxFileSize {
		return errors.New("file too large")
	}
	return nil
}

// ValidateMimeType checks if the MIME type is in the allowed whitelist.
func (c *UploadConfig) ValidateMimeType(mimeType string) error {
	normalized := strings.ToLower(strings.TrimSpace(mimeType))
	if normalized == "" {
		return errors.New("missing content type")
	}
	// Handle MIME types with parameters (e.g., "text/plain; charset=utf-8")
	if idx := strings.Index(normalized, ";"); idx > 0 {
		normalized = strings.TrimSpace(normalized[:idx])
	}
	if !c.AllowedMimeTypes[normalized] {
		return errors.New("unsupported file type")
	}
	return nil
}

// DetectAndValidateMimeType detects the MIME type from file content and validates it.
func (c *UploadConfig) DetectAndValidateMimeType(data []byte, declaredType string) (string, error) {
	// Detect actual MIME type from content
	detectedType := http.DetectContentType(data)

	// Normalize detected type
	if idx := strings.Index(detectedType, ";"); idx > 0 {
		detectedType = strings.TrimSpace(detectedType[:idx])
	}

	// Check if detected type is allowed
	if err := c.ValidateMimeType(detectedType); err != nil {
		return detectedType, err
	}

	return detectedType, nil
}

// Validate performs full validation on an upload.
func (c *UploadConfig) Validate(size int64, mimeType string, data []byte) error {
	if err := c.ValidateFileSize(size); err != nil {
		return err
	}
	if _, err := c.DetectAndValidateMimeType(data, mimeType); err != nil {
		return err
	}
	return nil
}
