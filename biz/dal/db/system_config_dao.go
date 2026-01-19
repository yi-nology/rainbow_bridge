package db

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

// SystemConfigDAO wraps basic CRUD operations for system config entities.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
type SystemConfigDAO struct{}

func NewSystemConfigDAO() *SystemConfigDAO { return &SystemConfigDAO{} }

// Create persists a new system config entry.
func (dao *SystemConfigDAO) Create(ctx context.Context, db *gorm.DB, entity *model.SystemConfig) error {
	if entity == nil {
		return errors.New("system_config must not be nil")
	}
	if entity.EnvironmentKey == "" {
		return errors.New("environment_key is required")
	}
	if entity.ConfigKey == "" {
		return errors.New("config_key is required")
	}
	return db.WithContext(ctx).Create(entity).Error
}

// Update updates the config value for an existing system config.
func (dao *SystemConfigDAO) Update(ctx context.Context, db *gorm.DB, environmentKey, configKey, configValue string) error {
	return db.WithContext(ctx).
		Model(&model.SystemConfig{}).
		Where("environment_key = ? AND config_key = ?", environmentKey, configKey).
		Update("config_value", configValue).
		Error
}

// UpdateFull updates the config value, type, and remark for an existing system config.
func (dao *SystemConfigDAO) UpdateFull(ctx context.Context, db *gorm.DB, environmentKey, configKey, configValue, configType, remark string) error {
	return db.WithContext(ctx).
		Model(&model.SystemConfig{}).
		Where("environment_key = ? AND config_key = ?", environmentKey, configKey).
		Updates(map[string]interface{}{
			"config_value": configValue,
			"config_type":  configType,
			"remark":       remark,
		}).
		Error
}

// GetByKey fetches a single system config by environment_key and config_key.
func (dao *SystemConfigDAO) GetByKey(ctx context.Context, db *gorm.DB, environmentKey, configKey string) (*model.SystemConfig, error) {
	var entity model.SystemConfig
	if err := db.WithContext(ctx).
		Where("environment_key = ? AND config_key = ?", environmentKey, configKey).
		First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// ListByEnvironment returns all system configs for a given environment.
func (dao *SystemConfigDAO) ListByEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) ([]model.SystemConfig, error) {
	var entities []model.SystemConfig
	if err := db.WithContext(ctx).
		Where("environment_key = ?", environmentKey).
		Order("config_key ASC").
		Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

// DeleteByEnvironment removes all system configs for a given environment (cascade delete).
func (dao *SystemConfigDAO) DeleteByEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) error {
	return db.WithContext(ctx).
		Unscoped().
		Where("environment_key = ?", environmentKey).
		Delete(&model.SystemConfig{}).Error
}

// Delete removes a single system config by environment_key and config_key.
func (dao *SystemConfigDAO) Delete(ctx context.Context, db *gorm.DB, environmentKey, configKey string) error {
	return db.WithContext(ctx).
		Where("environment_key = ? AND config_key = ?", environmentKey, configKey).
		Delete(&model.SystemConfig{}).Error
}

// BatchCreate creates multiple system configs in a single transaction.
func (dao *SystemConfigDAO) BatchCreate(ctx context.Context, db *gorm.DB, entities []model.SystemConfig) error {
	if len(entities) == 0 {
		return nil
	}
	return db.WithContext(ctx).Create(&entities).Error
}

// ExistsByKey checks if a system config with the given keys exists.
func (dao *SystemConfigDAO) ExistsByKey(ctx context.Context, db *gorm.DB, environmentKey, configKey string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).
		Model(&model.SystemConfig{}).
		Where("environment_key = ? AND config_key = ?", environmentKey, configKey).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
