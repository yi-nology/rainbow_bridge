package db

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

// EnvironmentDAO wraps basic CRUD operations for environment entities.
type EnvironmentDAO struct{}

func NewEnvironmentDAO() *EnvironmentDAO { return &EnvironmentDAO{} }

// Create persists a new environment entry.
func (dao *EnvironmentDAO) Create(ctx context.Context, db *gorm.DB, entity *model.Environment) error {
	if entity == nil {
		return errors.New("environment must not be nil")
	}
	if entity.EnvironmentKey == "" {
		return errors.New("environment_key is required")
	}
	return db.WithContext(ctx).Create(entity).Error
}

// Update updates an existing environment identified by environment_key.
func (dao *EnvironmentDAO) Update(ctx context.Context, db *gorm.DB, entity *model.Environment) error {
	if entity == nil {
		return errors.New("environment must not be nil")
	}
	return db.WithContext(ctx).
		Model(&model.Environment{}).
		Where("environment_key = ?", entity.EnvironmentKey).
		Updates(entity).
		Error
}

// Delete performs a soft delete by environment_key.
func (dao *EnvironmentDAO) Delete(ctx context.Context, db *gorm.DB, environmentKey string) error {
	return db.WithContext(ctx).
		Where("environment_key = ?", environmentKey).
		Delete(&model.Environment{}).Error
}

// GetByKey fetches a single environment by environment_key.
func (dao *EnvironmentDAO) GetByKey(ctx context.Context, db *gorm.DB, environmentKey string) (*model.Environment, error) {
	var entity model.Environment
	if err := db.WithContext(ctx).
		Where("environment_key = ?", environmentKey).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// List returns all environments with optional active filter.
func (dao *EnvironmentDAO) List(ctx context.Context, db *gorm.DB, isActive *bool) ([]model.Environment, error) {
	tx := db.WithContext(ctx)
	if isActive != nil {
		tx = tx.Where("is_active = ?", *isActive)
	}

	var entities []model.Environment
	if err := tx.Order("sort_order ASC, created_at ASC").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// ExistsByKey checks if an environment with the given key exists.
func (dao *EnvironmentDAO) ExistsByKey(ctx context.Context, db *gorm.DB, environmentKey string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).
		Model(&model.Environment{}).
		Where("environment_key = ?", environmentKey).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
