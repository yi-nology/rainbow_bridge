package resource

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

// PipelineDAO wraps basic CRUD operations for pipeline entities.
type PipelineDAO struct{}

func NewPipelineDAO() *PipelineDAO { return &PipelineDAO{} }

// Create persists a new pipeline entry.
func (dao *PipelineDAO) Create(ctx context.Context, db *gorm.DB, entity *model.Pipeline) error {
	if entity == nil {
		return errors.New("pipeline must not be nil")
	}
	if entity.PipelineKey == "" {
		return errors.New("pipeline_key is required")
	}
	return db.WithContext(ctx).Create(entity).Error
}

// Update updates an existing pipeline identified by pipeline_key.
func (dao *PipelineDAO) Update(ctx context.Context, db *gorm.DB, entity *model.Pipeline) error {
	if entity == nil {
		return errors.New("pipeline must not be nil")
	}
	return db.WithContext(ctx).
		Model(&model.Pipeline{}).
		Where("pipeline_key = ?", entity.PipelineKey).
		Updates(entity).
		Error
}

// Delete performs a soft delete by pipeline_key.
func (dao *PipelineDAO) Delete(ctx context.Context, db *gorm.DB, pipelineKey string) error {
	return db.WithContext(ctx).
		Where("pipeline_key = ?", pipelineKey).
		Delete(&model.Pipeline{}).Error
}

// GetByKey fetches a single pipeline by pipeline_key.
func (dao *PipelineDAO) GetByKey(ctx context.Context, db *gorm.DB, pipelineKey string) (*model.Pipeline, error) {
	var entity model.Pipeline
	if err := db.WithContext(ctx).
		Where("pipeline_key = ?", pipelineKey).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// List returns all pipelines with optional active filter.
func (dao *PipelineDAO) List(ctx context.Context, db *gorm.DB, isActive *bool) ([]model.Pipeline, error) {
	tx := db.WithContext(ctx)
	if isActive != nil {
		tx = tx.Where("is_active = ?", *isActive)
	}

	var entities []model.Pipeline
	if err := tx.Order("sort_order ASC, created_at ASC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// ExistsByKey checks if a pipeline with the given key exists.
func (dao *PipelineDAO) ExistsByKey(ctx context.Context, db *gorm.DB, pipelineKey string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).
		Model(&model.Pipeline{}).
		Where("pipeline_key = ?", pipelineKey).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
