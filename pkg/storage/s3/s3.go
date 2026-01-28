// Package s3 implements the S3-compatible object storage adapter.
// It supports AWS S3, Aliyun OSS, MinIO and other S3-compatible services.
package s3

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	// URLModePresigned generates presigned URLs for direct access
	URLModePresigned = "presigned"
	// URLModeProxy returns API paths for proxy access
	URLModeProxy = "proxy"

	// DefaultPresignExpiry is the default expiry time for presigned URLs
	DefaultPresignExpiry = 7 * 24 * time.Hour
)

// Config holds S3 storage configuration.
type Config struct {
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
	PathStyle bool // Use path-style URLs (required for MinIO)
	URLMode   string
}

// Storage implements the storage.Storage interface using S3-compatible storage.
type Storage struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucket        string
	urlMode       string
}

// New creates a new S3 storage adapter.
func New(cfg Config) (*Storage, error) {
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("bucket name is required")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("access key and secret key are required")
	}
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}
	if cfg.URLMode == "" {
		cfg.URLMode = URLModePresigned
	}

	// Build custom endpoint resolver if endpoint is specified
	var optFns []func(*config.LoadOptions) error

	optFns = append(optFns, config.WithRegion(cfg.Region))
	optFns = append(optFns, config.WithCredentialsProvider(
		credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
	))

	awsCfg, err := config.LoadDefaultConfig(context.Background(), optFns...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	// Build S3 client options
	var s3OptFns []func(*s3.Options)

	if cfg.Endpoint != "" {
		s3OptFns = append(s3OptFns, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		})
	}

	if cfg.PathStyle {
		s3OptFns = append(s3OptFns, func(o *s3.Options) {
			o.UsePathStyle = true
		})
	}

	client := s3.NewFromConfig(awsCfg, s3OptFns...)
	presignClient := s3.NewPresignClient(client)

	return &Storage{
		client:        client,
		presignClient: presignClient,
		bucket:        cfg.Bucket,
		urlMode:       cfg.URLMode,
	}, nil
}

// PutObject uploads a file to S3.
func (s *Storage) PutObject(ctx context.Context, key string, data io.Reader, contentType string, size int64) error {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        data,
		ContentType: aws.String(contentType),
	}

	if size > 0 {
		input.ContentLength = aws.Int64(size)
	}

	_, err := s.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("put object: %w", err)
	}

	return nil
}

// GetObject retrieves a file from S3.
func (s *Storage) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}

	return output.Body, nil
}

// DeleteObject removes a file from S3.
func (s *Storage) DeleteObject(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}

	return nil
}

// ObjectExists checks if an object exists in S3.
func (s *Storage) ObjectExists(ctx context.Context, key string) (bool, error) {
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		// Check if it's a "not found" error
		if strings.Contains(err.Error(), "NotFound") || strings.Contains(err.Error(), "404") {
			return false, nil
		}
		return false, fmt.Errorf("head object: %w", err)
	}

	return true, nil
}

// GenerateURL creates an access URL for the object.
func (s *Storage) GenerateURL(ctx context.Context, key string, fileName string) (string, error) {
	if s.urlMode == URLModeProxy {
		// Return API path for proxy mode
		parts := strings.SplitN(key, "/", 2)
		fileID := parts[0]
		return fmt.Sprintf("/api/v1/asset/file/%s/%s", fileID, fileName), nil
	}

	// Generate presigned URL
	presignResult, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = DefaultPresignExpiry
	})
	if err != nil {
		return "", fmt.Errorf("presign url: %w", err)
	}

	return presignResult.URL, nil
}

// Type returns "s3" as the storage type identifier.
func (s *Storage) Type() string {
	return "s3"
}
