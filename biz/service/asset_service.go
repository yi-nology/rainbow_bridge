package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"
)

// --------------------- Asset operations ---------------------

func (s *Service) ListAssets(ctx context.Context, businessKey string) ([]*api.FileAsset, error) {
	key := strings.TrimSpace(businessKey)
	if key == "" {
		return nil, errors.New("business_key is required")
	}
	assets, err := s.logic.ListAssetsByBusinessKey(ctx, key)
	if err != nil {
		return nil, err
	}
	return s.decorateAssetList(assetSliceToPB(assets)), nil
}

func (s *Service) UploadAsset(ctx context.Context, input *FileUploadInput) (*api.FileAsset, string, error) {
	if input == nil {
		return nil, "", errors.New("input required")
	}
	if len(input.Data) == 0 {
		return nil, "", errors.New("file data is empty")
	}
	if input.BusinessKey == "" {
		return nil, "", errors.New("business_key is required")
	}

	fileID := uuid.NewString()
	fileName := input.FileName
	if fileName == "" {
		fileName = fileID
	}

	if err := ensureUploadDir(fileID); err != nil {
		return nil, "", err
	}

	relativePath := filepath.Join(uploadDirectory, fileID, fileName)
	fullPath := filepath.Join(dataDirectory, relativePath)
	if err := os.WriteFile(fullPath, input.Data, 0o644); err != nil {
		return nil, "", err
	}

	asset := &model.Asset{
		FileID:      fileID,
		BusinessKey: input.BusinessKey,
		FileName:    fileName,
		ContentType: detectContentType(input.ContentType, input.Data),
		FileSize:    int64(len(input.Data)),
		Path:        relativePath,
		URL:         generateFileURL(fileID),
		Remark:      input.Remark,
	}
	if err := s.logic.CreateAsset(ctx, asset); err != nil {
		_ = os.Remove(fullPath)
		return nil, "", err
	}

	reference := fmt.Sprintf("%s%s", assetScheme, fileID)
	return s.decorateAsset(assetModelToPB(asset)), reference, nil
}

func (s *Service) GetAssetFile(ctx context.Context, fileID string) (*model.Asset, string, error) {
	if fileID == "" {
		return nil, "", ErrAssetNotFound
	}
	asset, err := s.logic.GetAsset(ctx, fileID)
	if err != nil {
		return nil, "", err
	}
	fullPath := filepath.Join(dataDirectory, asset.Path)
	if _, err := os.Stat(fullPath); err != nil {
		return nil, "", err
	}
	return asset, fullPath, nil
}
