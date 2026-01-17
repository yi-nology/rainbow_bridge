package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/model/api"
)

// --------------------- Config operations ---------------------

func (s *Service) AddConfig(ctx context.Context, req *api.CreateOrUpdateConfigRequest) (*api.ResourceConfig, error) {
	if req == nil || req.Config == nil {
		return nil, errors.New("config payload required")
	}
	model := pbConfigToModel(req.Config)
	if err := s.logic.AddConfig(ctx, model); err != nil {
		return nil, err
	}
	return s.decorateConfig(modelConfigToPB(model)), nil
}

func (s *Service) UpdateConfig(ctx context.Context, req *api.CreateOrUpdateConfigRequest) (*api.ResourceConfig, error) {
	if req == nil || req.Config == nil {
		return nil, errors.New("config payload required")
	}
	model := pbConfigToModel(req.Config)
	if err := s.logic.UpdateConfig(ctx, model); err != nil {
		return nil, err
	}
	updated, err := s.logic.GetConfig(ctx, model.BusinessKey, model.ResourceKey)
	if err != nil {
		return nil, err
	}
	return s.decorateConfig(modelConfigToPB(updated)), nil
}

func (s *Service) DeleteConfig(ctx context.Context, req *api.ResourceDeleteRequest) error {
	if req == nil {
		return errors.New("request required")
	}
	return s.logic.DeleteConfig(ctx, req.GetBusinessKey(), req.GetResourceKey())
}

func (s *Service) ListConfigs(ctx context.Context, req *api.ResourceQueryRequest) ([]*api.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	configs, err := s.logic.ListConfigs(ctx, req.GetBusinessKey(), req.GetMinVersion(), req.GetMaxVersion(), req.GetType(), req.GetIsLatest())
	if err != nil {
		return nil, err
	}
	return s.decorateConfigList(configSliceToPB(configs)), nil
}

func (s *Service) GetConfigDetail(ctx context.Context, req *api.ResourceDetailRequest) (*api.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	cfg, err := s.logic.GetConfig(ctx, req.GetBusinessKey(), req.GetResourceKey())
	if err != nil {
		return nil, err
	}
	return s.decorateConfig(modelConfigToPB(cfg)), nil
}
