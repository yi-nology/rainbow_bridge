package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	envpb "github.com/yi-nology/rainbow_bridge/biz/model/environment"
	"gorm.io/gorm"
)

var (
	ErrEnvironmentNotFound    = errors.New("environment not found")
	ErrEnvironmentKeyRequired = errors.New("environment_key is required")
	ErrEnvironmentKeyExists   = errors.New("environment_key already exists")
)

// AddEnvironment creates a new environment.
func (s *Service) AddEnvironment(ctx context.Context, env *envpb.Environment) error {
	if env == nil || env.GetEnvironmentKey() == "" {
		return ErrEnvironmentKeyRequired
	}

	exists, err := s.logic.environmentDAO.ExistsByKey(ctx, s.logic.db, env.GetEnvironmentKey())
	if err != nil {
		return err
	}
	if exists {
		return ErrEnvironmentKeyExists
	}

	entity := &model.Environment{
		EnvironmentKey:  env.GetEnvironmentKey(),
		EnvironmentName: env.GetEnvironmentName(),
		Description:     env.GetDescription(),
		SortOrder:       int(env.GetSortOrder()),
		IsActive:        env.GetIsActive(),
	}
	return s.logic.environmentDAO.Create(ctx, s.logic.db, entity)
}

// UpdateEnvironment updates an existing environment.
func (s *Service) UpdateEnvironment(ctx context.Context, env *envpb.Environment) error {
	if env == nil || env.GetEnvironmentKey() == "" {
		return ErrEnvironmentKeyRequired
	}

	_, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, env.GetEnvironmentKey())
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrEnvironmentNotFound
		}
		return err
	}

	entity := &model.Environment{
		EnvironmentKey:  env.GetEnvironmentKey(),
		EnvironmentName: env.GetEnvironmentName(),
		Description:     env.GetDescription(),
		SortOrder:       int(env.GetSortOrder()),
		IsActive:        env.GetIsActive(),
	}
	return s.logic.environmentDAO.Update(ctx, s.logic.db, entity)
}

// DeleteEnvironment deletes an environment by key.
func (s *Service) DeleteEnvironment(ctx context.Context, environmentKey string) error {
	if environmentKey == "" {
		return ErrEnvironmentKeyRequired
	}

	_, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, environmentKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrEnvironmentNotFound
		}
		return err
	}

	return s.logic.environmentDAO.Delete(ctx, s.logic.db, environmentKey)
}

// GetEnvironment returns an environment by key.
func (s *Service) GetEnvironment(ctx context.Context, environmentKey string) (*envpb.Environment, error) {
	if environmentKey == "" {
		return nil, ErrEnvironmentKeyRequired
	}

	entity, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, environmentKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrEnvironmentNotFound
		}
		return nil, err
	}

	return modelEnvironmentToPB(entity), nil
}

// ListEnvironments returns all environments with optional active filter.
func (s *Service) ListEnvironments(ctx context.Context, isActive *bool) ([]*envpb.Environment, error) {
	entities, err := s.logic.environmentDAO.List(ctx, s.logic.db, isActive)
	if err != nil {
		return nil, err
	}

	return environmentSliceToPB(entities), nil
}

func modelEnvironmentToPB(env *model.Environment) *envpb.Environment {
	if env == nil {
		return nil
	}
	return &envpb.Environment{
		EnvironmentKey:  env.EnvironmentKey,
		EnvironmentName: env.EnvironmentName,
		Description:     env.Description,
		SortOrder:       int32(env.SortOrder),
		IsActive:        env.IsActive,
	}
}

func environmentSliceToPB(envs []model.Environment) []*envpb.Environment {
	list := make([]*envpb.Environment, 0, len(envs))
	for i := range envs {
		list = append(list, modelEnvironmentToPB(&envs[i]))
	}
	return list
}
