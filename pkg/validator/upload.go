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
	// 常见图片格式
	"image/jpeg":               true, // .jpg, .jpeg
	"image/png":                true, // .png
	"image/gif":                true, // .gif
	"image/webp":               true, // .webp
	"image/svg+xml":            true, // .svg
	"image/bmp":                true, // .bmp
	"image/x-ms-bmp":           true, // .bmp (Windows)
	"image/tiff":               true, // .tif, .tiff
	"image/x-icon":             true, // .ico
	"image/vnd.microsoft.icon": true, // .ico
	"image/heic":               true, // .heic (iOS)
	"image/heif":               true, // .heif

	// 压缩包格式
	"application/zip":              true, // .zip
	"application/x-zip-compressed": true, // .zip
	"application/x-rar-compressed": true, // .rar
	"application/x-7z-compressed":  true, // .7z
	"application/x-tar":            true, // .tar
	"application/gzip":             true, // .gz
	"application/x-gzip":           true, // .gz
	"application/x-bzip2":          true, // .bz2

	// 字体文件格式
	"font/ttf":               true, // .ttf
	"font/otf":               true, // .otf
	"font/woff":              true, // .woff
	"font/woff2":             true, // .woff2
	"application/x-font-ttf": true, // .ttf
	"application/x-font-otf": true, // .otf
	"application/font-woff":  true, // .woff
	"application/font-woff2": true, // .woff2

	// 文档格式
	"application/pdf":    true, // .pdf
	"application/msword": true, // .doc
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true, // .docx
	"application/vnd.ms-excel": true, // .xls
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true, // .xlsx
	"application/vnd.ms-powerpoint":                                             true, // .ppt
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true, // .pptx

	// 文本格式
	"text/plain":       true, // .txt
	"text/csv":         true, // .csv
	"text/html":        true, // .html
	"text/css":         true, // .css
	"text/javascript":  true, // .js
	"application/json": true, // .json
	"application/xml":  true, // .xml
	"text/xml":         true, // .xml

	// 音视频格式
	"audio/mpeg":      true, // .mp3
	"audio/wav":       true, // .wav
	"audio/ogg":       true, // .ogg
	"video/mp4":       true, // .mp4
	"video/mpeg":      true, // .mpeg
	"video/webm":      true, // .webm
	"video/quicktime": true, // .mov
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
