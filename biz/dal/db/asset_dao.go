package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"

	"gorm.io/gorm"
)

// AssetDAO handles CRUD operations for file assets.
type AssetDAO struct{}

func NewAssetDAO() *AssetDAO { return &AssetDAO{} }

func (dao *AssetDAO) Create(ctx context.Context, db *gorm.DB, asset *model.Asset) error {
	if asset == nil {
		return nil
	}
	if asset.FileID == "" {
		asset.FileID = uuid.NewString()
	}
	return db.WithContext(ctx).Create(asset).Error
}

func (dao *AssetDAO) Update(ctx context.Context, db *gorm.DB, asset *model.Asset) error {
	if asset == nil {
		return nil
	}
	result := db.WithContext(ctx).
		Model(&model.Asset{}).
		Where("file_id = ?", asset.FileID).
		Updates(asset)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (dao *AssetDAO) DeleteByFileID(ctx context.Context, db *gorm.DB, fileID string) error {
	return db.WithContext(ctx).Unscoped().Where("file_id = ?", fileID).Delete(&model.Asset{}).Error
}

func (dao *AssetDAO) GetByFileID(ctx context.Context, db *gorm.DB, fileID string) (*model.Asset, error) {
	var asset model.Asset
	if err := db.WithContext(ctx).Where("file_id = ?", fileID).First(&asset).Error; err != nil {
		return nil, err
	}
	return &asset, nil
}

func (dao *AssetDAO) ListByEnvironmentAndPipeline(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey string) ([]model.Asset, error) {
	var assets []model.Asset
	if err := db.WithContext(ctx).
		Where("environment_key = ? AND pipeline_key = ?", environmentKey, pipelineKey).
		Order("created_at DESC").
		Find(&assets).Error; err != nil {
		return nil, err
	}
	return assets, nil
}
