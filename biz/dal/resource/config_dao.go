package resource

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

// UpdateByBusinessKey updates an existing configuration identified by business_key + resource_key.
func (dao *ConfigDAO) UpdateByBusinessKey(ctx context.Context, db *gorm.DB, businessKey string, entity *model.Config) error {
	if entity == nil {
		return errors.New("config must not be nil")
	}
	return db.WithContext(ctx).
		Model(&model.Config{}).
		Where("business_key = ? AND resource_key = ?", businessKey, entity.ResourceKey).
		Updates(entity).
		Error
}

// ClearAll removes all configuration entries.
func (dao *ConfigDAO) ClearAll(ctx context.Context, db *gorm.DB) error {
	return db.WithContext(ctx).Where("1 = 1").Unscoped().Delete(&model.Config{}).Error
}

// DeleteByBusinessKeyAndResourceKey performs a hard delete by composite key.
func (dao *ConfigDAO) DeleteByBusinessKeyAndResourceKey(ctx context.Context, db *gorm.DB, businessKey string, resourceKey string) error {
	return db.WithContext(ctx).
		Unscoped().
		Where("business_key = ? AND resource_key = ?", businessKey, resourceKey).
		Delete(&model.Config{}).Error
}

// GetByResourceKey fetches a single config by business key + resource key.
func (dao *ConfigDAO) GetByResourceKey(ctx context.Context, db *gorm.DB, businessKey string, resourceKey string) (*model.Config, error) {
	var entity model.Config
	if err := db.WithContext(ctx).
		Where("business_key = ? AND resource_key = ?", businessKey, resourceKey).
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

// GetByAlias fetches the latest config by alias.
func (dao *ConfigDAO) GetByAlias(ctx context.Context, db *gorm.DB, businessKey string, alias string) (*model.Config, error) {
	var entity model.Config
	if err := db.WithContext(ctx).
		Where("business_key = ? AND alias = ?", businessKey, alias).
		Order("updated_at DESC").
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// ListByBusinessKeyAndVersion returns the most recently updated configs per alias.
func (dao *ConfigDAO) ListByBusinessKeyAndVersion(ctx context.Context, db *gorm.DB, businessKey string, _ string) ([]model.Config, error) {
	var entities []model.Config
	if err := db.WithContext(ctx).
		Where("business_key = ?", businessKey).
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

// ListByBusinessKey retrieves configs optionally filtering by type.
func (dao *ConfigDAO) ListByBusinessKey(ctx context.Context, db *gorm.DB, businessKey string, _ string, _ string, resourceType string) ([]model.Config, error) {
	tx := db.WithContext(ctx).Where("business_key = ?", businessKey)

	if resourceType != "" {
		tx = tx.Where("type = ?", resourceType)
	}

	var entities []model.Config
	if err := tx.Order("updated_at DESC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// ListAllBusinessKeys returns all distinct business keys.
func (dao *ConfigDAO) ListAllBusinessKeys(ctx context.Context, db *gorm.DB) ([]string, error) {
	var businessKeys []string
	if err := db.WithContext(ctx).
		Model(&model.Config{}).
		Distinct().
		Pluck("business_key", &businessKeys).Error; err != nil {
		return nil, err
	}
	return businessKeys, nil
}
