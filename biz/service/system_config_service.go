package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/constants"
)

// GetSystemConfig retrieves a system config with fallback strategy.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) GetSystemConfig(ctx context.Context, environmentKey, configKey string) (*model.SystemConfig, error) {
	return s.logic.GetSystemConfig(ctx, environmentKey, configKey)
}

// GetSystemConfigValue retrieves a system config value with fallback strategy.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) GetSystemConfigValue(ctx context.Context, environmentKey, configKey string) (string, error) {
	return s.logic.GetSystemConfigValue(ctx, environmentKey, configKey)
}

// ListSystemConfigsByEnv returns all system configs for an environment.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) ListSystemConfigsByEnv(ctx context.Context, environmentKey string) ([]model.SystemConfig, error) {
	return s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
}

// UpdateSystemConfig updates a system config value.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) UpdateSystemConfig(ctx context.Context, environmentKey, configKey, configValue, configType, remark string) error {
	return s.logic.UpdateSystemConfig(ctx, environmentKey, configKey, configValue, configType, remark)
}

// CreateSystemConfig creates a new system config.
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) CreateSystemConfig(ctx context.Context, environmentKey, configKey, configValue, configType, remark string) error {
	if environmentKey == "" {
		return errors.New("environment_key is required")
	}
	if configKey == "" {
		return ErrSystemConfigKeyRequired
	}

	// Check if already exists
	exists, err := s.logic.systemConfigDAO.ExistsByKey(ctx, s.logic.db, environmentKey, configKey)
	if err != nil {
		return err
	}
	if exists {
		return ErrSystemConfigKeyExists
	}

	entity := &model.SystemConfig{
		EnvironmentKey: environmentKey,
		ConfigKey:      configKey,
		ConfigValue:    configValue,
		ConfigType:     configType,
		Remark:         remark,
	}
	return s.logic.systemConfigDAO.Create(ctx, s.logic.db, entity)
}

// DeleteSystemConfig deletes a system config (protected configs cannot be deleted).
// SystemConfig is environment-scoped only (no pipeline_key dependency).
func (s *Service) DeleteSystemConfig(ctx context.Context, environmentKey, configKey string) error {
	if environmentKey == "" {
		return errors.New("environment_key is required")
	}
	if configKey == "" {
		return ErrSystemConfigKeyRequired
	}

	// Check if protected
	if constants.IsProtectedSystemConfig(configKey) {
		return ErrProtectedSystemConfig
	}

	// Check if exists
	_, err := s.logic.GetSystemConfig(ctx, environmentKey, configKey)
	if err != nil {
		return ErrSystemConfigNotFound
	}

	return s.logic.systemConfigDAO.Delete(ctx, s.logic.db, environmentKey, configKey)
}
