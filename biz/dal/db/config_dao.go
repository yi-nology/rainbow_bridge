package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"

	"gorm.io/gorm"
)

// ConfigDAO wraps basic CRUD operations for configuration entities.
type ConfigDAO struct{}

func NewConfigDAO() *ConfigDAO { return &ConfigDAO{} }

// Create persists a new configuration entry. If no resource key is provided a UUID is assigned.
func (dao *ConfigDAO) Create(ctx context.Context, db *gorm.DB, entity *model.Config) error {
	if entity == nil {
		return errors.New("config must not be nil")
	}
	if entity.ResourceKey == "" {
		entity.ResourceKey = uuid.NewString()
	}
	return db.WithContext(ctx).Create(entity).Error
}

// UpdateByEnvironmentAndPipeline updates an existing configuration identified by environment_key + pipeline_key + resource_key.
func (dao *ConfigDAO) UpdateByEnvironmentAndPipeline(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey string, entity *model.Config) error {
	if entity == nil {
		return errors.New("config must not be nil")
	}
	return db.WithContext(ctx).
		Model(&model.Config{}).
		Where("environment_key = ? AND pipeline_key = ? AND resource_key = ?", environmentKey, pipelineKey, entity.ResourceKey).
		Updates(entity).
		Error
}

// ClearAll removes all configuration entries.
func (dao *ConfigDAO) ClearAll(ctx context.Context, db *gorm.DB) error {
	return db.WithContext(ctx).Where("1 = 1").Unscoped().Delete(&model.Config{}).Error
}

// DeleteByEnvironmentPipelineAndResourceKey performs a hard delete by composite key.
func (dao *ConfigDAO) DeleteByEnvironmentPipelineAndResourceKey(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey, resourceKey string) error {
	return db.WithContext(ctx).
		Unscoped().
		Where("environment_key = ? AND pipeline_key = ? AND resource_key = ?", environmentKey, pipelineKey, resourceKey).
		Delete(&model.Config{}).Error
}

// GetByResourceKey fetches a single config by environment + pipeline + resource key.
func (dao *ConfigDAO) GetByResourceKey(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey, resourceKey string) (*model.Config, error) {
	var entity model.Config
	if err := db.WithContext(ctx).
		Where("environment_key = ? AND pipeline_key = ? AND resource_key = ?", environmentKey, pipelineKey, resourceKey).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// GetByResourceKeyOnly fetches a config by resource key ignoring business key.
func (dao *ConfigDAO) GetByResourceKeyOnly(ctx context.Context, db *gorm.DB, resourceKey string) (*model.Config, error) {
	var entity model.Config
	if err := db.WithContext(ctx).
		Where("resource_key = ?", resourceKey).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// GetByAlias fetches the latest config by environment + pipeline + alias.
func (dao *ConfigDAO) GetByAlias(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey, alias string) (*model.Config, error) {
	var entity model.Config
	if err := db.WithContext(ctx).
		Where("environment_key = ? AND pipeline_key = ? AND alias = ?", environmentKey, pipelineKey, alias).
		Order("updated_at DESC").
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// ListByEnvironmentAndPipeline returns the most recently updated configs per alias.
func (dao *ConfigDAO) ListByEnvironmentAndPipeline(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey string, _ string) ([]model.Config, error) {
	var entities []model.Config
	if err := db.WithContext(ctx).
		Where("environment_key = ? AND pipeline_key = ?", environmentKey, pipelineKey).
		Order("updated_at DESC").
		Find(&entities).Error; err != nil {
		return nil, err
	}

	seen := make(map[string]struct{})
	var filtered []model.Config
	for _, cfg := range entities {
		if _, ok := seen[cfg.Alias]; ok {
			continue
		}
		seen[cfg.Alias] = struct{}{}
		filtered = append(filtered, cfg)
	}
	return filtered, nil
}

// ListByEnvironmentAndPipelineWithFilter retrieves configs optionally filtering by type.
func (dao *ConfigDAO) ListByEnvironmentAndPipelineWithFilter(ctx context.Context, db *gorm.DB, environmentKey, pipelineKey string, _ string, _ string, resourceType string) ([]model.Config, error) {
	tx := db.WithContext(ctx).Where("environment_key = ? AND pipeline_key = ?", environmentKey, pipelineKey)

	if resourceType != "" {
		tx = tx.Where("type = ?", resourceType)
	}

	var entities []model.Config
	if err := tx.Order("updated_at DESC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// ListAllBusinessKeys is deprecated, use environment/pipeline queries instead.
// Kept for backward compatibility during migration.
func (dao *ConfigDAO) ListAllBusinessKeys(ctx context.Context, db *gorm.DB) ([]string, error) {
	return []string{}, errors.New("business_key is deprecated, use environment_key and pipeline_key instead")
}
