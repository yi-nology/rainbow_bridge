package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
)

// --------------------- Asset operations ---------------------

func (s *Service) ListAssets(ctx context.Context, environmentKey, pipelineKey string) ([]*common.FileAsset, error) {
	envKey := strings.TrimSpace(environmentKey)
	pipeKey := strings.TrimSpace(pipelineKey)
	if envKey == "" || pipeKey == "" {
		return nil, errors.New("environment_key and pipeline_key are required")
	}
	assets, err := s.logic.ListAssetsByEnvironmentAndPipeline(ctx, envKey, pipeKey)
	if err != nil {
		return nil, err
	}
	return s.decorateAssetList(assetSliceToPB(assets)), nil
}

func (s *Service) UploadAsset(ctx context.Context, input *FileUploadInput) (*common.FileAsset, string, error) {
	if input == nil {
		return nil, "", errors.New("input required")
	}
	if len(input.Data) == 0 {
		return nil, "", errors.New("file data is empty")
	}
	if input.EnvironmentKey == "" || input.PipelineKey == "" {
		return nil, "", errors.New("environment_key and pipeline_key are required")
	}

	fileID := uuid.NewString()
	fileName := input.FileName
	if fileName == "" {
		fileName = fileID
	}

	// Build storage key
	key := fmt.Sprintf("%s/%s", fileID, fileName)
	contentType := detectContentType(input.ContentType, input.Data)

	// Upload to storage
	if err := s.storage.PutObject(ctx, key, bytes.NewReader(input.Data), contentType, int64(len(input.Data))); err != nil {
		return nil, "", fmt.Errorf("upload file: %w", err)
	}

	// Generate URL
	url, err := s.storage.GenerateURL(ctx, key, fileName)
	if err != nil {
		// Rollback: delete uploaded file
		_ = s.storage.DeleteObject(ctx, key)
		return nil, "", fmt.Errorf("generate url: %w", err)
	}

	asset := &model.Asset{
		FileID:         fileID,
		EnvironmentKey: input.EnvironmentKey,
		PipelineKey:    input.PipelineKey,
		FileName:       fileName,
		ContentType:    contentType,
		FileSize:       int64(len(input.Data)),
		Path:           key,
		URL:            url,
		Remark:         input.Remark,
	}

	if err := s.logic.CreateAsset(ctx, asset); err != nil {
		// Rollback: delete uploaded file
		_ = s.storage.DeleteObject(ctx, key)
		return nil, "", err
	}

	reference := fmt.Sprintf("%s%s", assetScheme, fileID)
	return s.decorateAsset(assetModelToPB(asset)), reference, nil
}

func (s *Service) GetAssetFile(ctx context.Context, fileID string) (*model.Asset, io.ReadCloser, error) {
	if fileID == "" {
		return nil, nil, ErrAssetNotFound
	}
	asset, err := s.logic.GetAsset(ctx, fileID)
	if err != nil {
		return nil, nil, err
	}

	// Get file from storage
	reader, err := s.storage.GetObject(ctx, asset.Path)
	if err != nil {
		return nil, nil, fmt.Errorf("get file: %w", err)
	}

	return asset, reader, nil
}
