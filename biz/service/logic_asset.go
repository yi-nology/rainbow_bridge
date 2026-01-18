package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

// --------------------- Asset Operations ---------------------

func (l *Logic) CreateAsset(ctx context.Context, asset *model.Asset) error {
	return l.assetDAO.Create(ctx, l.db, asset)
}

func (l *Logic) UpdateAsset(ctx context.Context, asset *model.Asset) error {
	if err := l.assetDAO.Update(ctx, l.db, asset); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAssetNotFound
		}
		return err
	}
	return nil
}

func (l *Logic) DeleteAsset(ctx context.Context, fileID string) error {
	return l.assetDAO.DeleteByFileID(ctx, l.db, fileID)
}

func (l *Logic) GetAsset(ctx context.Context, fileID string) (*model.Asset, error) {
	asset, err := l.assetDAO.GetByFileID(ctx, l.db, fileID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAssetNotFound
	}
	return asset, err
}

func (l *Logic) ListAssetsByEnvironmentAndPipeline(ctx context.Context, environmentKey, pipelineKey string) ([]model.Asset, error) {
	return l.assetDAO.ListByEnvironmentAndPipeline(ctx, l.db, environmentKey, pipelineKey)
}
