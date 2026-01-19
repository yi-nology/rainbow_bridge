package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/constants"
	"gorm.io/gorm"
)

//  --------------------- SystemConfig Operations ---------------------
// SystemConfig is environment-scoped only (no pipeline_key dependency).

var (
	ErrSystemConfigNotFound    = errors.New("system config not found")
	ErrInvalidSystemConfigKey  = errors.New("invalid system config key")
	ErrSystemConfigKeyRequired = errors.New("config_key is required")
	ErrSystemConfigKeyExists   = errors.New("config_key already exists")
)

// GetSystemConfigValue retrieves a system config value with fallback strategy:
// 1. Query system_config table (environment-scoped)
// 2. Return hardcoded default value
// Note: Fallback to resource_config is removed since system_config is now environment-scoped.
func (l *Logic) GetSystemConfigValue(ctx context.Context, environmentKey, configKey string) (string, error) {
	// Step 1: Try system_config table
	sysConfig, err := l.systemConfigDAO.GetByKey(ctx, l.db, environmentKey, configKey)
	if err == nil && sysConfig != nil {
		return sysConfig.ConfigValue, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}

	// Step 2: Return default value
	switch configKey {
	case constants.SysConfigSystemOptions:
		return constants.DefaultSystemOptions, nil
	default:
		return "", ErrSystemConfigNotFound
	}
}

// GetSystemConfig retrieves a system config entity with fallback strategy.
// SystemConfig is environment-scoped only.
func (l *Logic) GetSystemConfig(ctx context.Context, environmentKey, configKey string) (*model.SystemConfig, error) {
	// Step 1: Try system_config table
	sysConfig, err := l.systemConfigDAO.GetByKey(ctx, l.db, environmentKey, configKey)
	if err == nil && sysConfig != nil {
		return sysConfig, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Step 2: Return default value
	switch configKey {
	case constants.SysConfigSystemOptions:
		return &model.SystemConfig{
			EnvironmentKey: environmentKey,
			ConfigKey:      configKey,
			ConfigValue:    constants.DefaultSystemOptions,
			Remark:         constants.DefaultSystemConfigRemark[configKey],
		}, nil
	default:
		return nil, ErrSystemConfigNotFound
	}
}

// ListSystemConfigsByEnvironment returns all system configs for an environment.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (l *Logic) ListSystemConfigsByEnvironment(ctx context.Context, environmentKey string) ([]model.SystemConfig, error) {
	configs, err := l.systemConfigDAO.ListByEnvironment(ctx, l.db, environmentKey)
	if err != nil {
		return nil, err
	}

	// If no configs found, return defaults
	if len(configs) == 0 {
		return []model.SystemConfig{
			{
				EnvironmentKey: environmentKey,
				ConfigKey:      constants.SysConfigSystemOptions,
				ConfigValue:    constants.DefaultSystemOptions,
				Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigSystemOptions],
			},
		}, nil
	}

	return configs, nil
}

// UpdateSystemConfig updates a system config value.
// Only system_options is allowed to be updated.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (l *Logic) UpdateSystemConfig(ctx context.Context, environmentKey, configKey, configValue, configType, remark string) error {
	// Validate config key
	if !constants.IsProtectedSystemConfig(configKey) {
		return ErrInvalidSystemConfigKey
	}

	// Check if config exists
	exists, err := l.systemConfigDAO.ExistsByKey(ctx, l.db, environmentKey, configKey)
	if err != nil {
		return err
	}

	if exists {
		// Update existing config
		return l.systemConfigDAO.UpdateFull(ctx, l.db, environmentKey, configKey, configValue, configType, remark)
	}

	// Create new config if not exists
	return l.systemConfigDAO.Create(ctx, l.db, &model.SystemConfig{
		EnvironmentKey: environmentKey,
		ConfigKey:      configKey,
		ConfigValue:    configValue,
		ConfigType:     configType,
		Remark:         remark,
	})
}

// InitSystemConfigsForEnvironment initializes default system configs for a new environment.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (l *Logic) InitSystemConfigsForEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) error {
	configs := []model.SystemConfig{
		{
			EnvironmentKey: environmentKey,
			ConfigKey:      constants.SysConfigSystemOptions,
			ConfigValue:    constants.DefaultSystemOptions,
			ConfigType:     "kv", // system_options 是键值对类型
			Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigSystemOptions],
		},
	}
	return l.systemConfigDAO.BatchCreate(ctx, db, configs)
}

// DeleteSystemConfigsByEnvironment removes all system configs for an environment (cascade delete).
func (l *Logic) DeleteSystemConfigsByEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) error {
	return l.systemConfigDAO.DeleteByEnvironment(ctx, db, environmentKey)
}
