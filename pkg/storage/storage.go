package storage

// Package storage defines the storage abstraction layer for asset management.
// It provides a unified interface for different storage backends including
// local filesystem and S3-compatible object storage (AWS S3, Aliyun OSS, MinIO).

import (
	"context"
	"io"
)

// Storage defines the interface for object storage operations.
// All storage backends (local, S3, OSS, MinIO) must implement this interface.
type Storage interface {
	// PutObject uploads a file to storage.
	// key: object key in format "{fileID}/{fileName}"
	// data: file content reader
	// contentType: MIME type of the file
	// size: file size in bytes
	PutObject(ctx context.Context, key string, data io.Reader, contentType string, size int64) error

	// GetObject retrieves a file from storage.
	// Returns a ReadCloser that must be closed by the caller.
	GetObject(ctx context.Context, key string) (io.ReadCloser, error)

	// DeleteObject removes a file from storage.
	DeleteObject(ctx context.Context, key string) error

	// ObjectExists checks if an object exists in storage.
	ObjectExists(ctx context.Context, key string) (bool, error)

	// GenerateURL creates an access URL for the object.
	// For local storage: returns API path like /api/v1/asset/file/{fileID}/{fileName}
	// For S3 with presigned mode: returns a presigned URL
	// For S3 with proxy mode: returns API path
	GenerateURL(ctx context.Context, key string, fileName string) (string, error)

	// Type returns the storage type identifier ("local" or "s3").
	Type() string
}
