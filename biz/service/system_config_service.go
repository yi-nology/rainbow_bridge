package service

import (
	"context"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
)

// GetSystemConfig retrieves a system config with fallback strategy.
func (s *Service) GetSystemConfig(ctx context.Context, environmentKey, configKey string) (*model.SystemConfig, error) {
	return s.logic.GetSystemConfig(ctx, environmentKey, configKey)
}

// GetSystemConfigValue retrieves a system config value with fallback strategy.
func (s *Service) GetSystemConfigValue(ctx context.Context, environmentKey, configKey string) (string, error) {
	return s.logic.GetSystemConfigValue(ctx, environmentKey, configKey)
}

// ListSystemConfigsByEnv returns all system configs for an environment.
func (s *Service) ListSystemConfigsByEnv(ctx context.Context, environmentKey string) ([]model.SystemConfig, error) {
	return s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
}

// UpdateSystemConfig updates a system config value.
func (s *Service) UpdateSystemConfig(ctx context.Context, environmentKey, configKey, configValue string) error {
	return s.logic.UpdateSystemConfig(ctx, environmentKey, configKey, configValue)
}
