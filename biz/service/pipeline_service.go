package service

import (
	"context"
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	plpb "github.com/yi-nology/rainbow_bridge/biz/model/pipeline"
	"gorm.io/gorm"
)

var (
	ErrPipelineNotFound    = errors.New("pipeline not found")
	ErrPipelineKeyRequired = errors.New("pipeline_key is required")
	ErrPipelineKeyExists   = errors.New("pipeline_key already exists")
)

// AddPipeline creates a new pipeline.
func (s *Service) AddPipeline(ctx context.Context, environmentKey string, pl *plpb.Pipeline) error {
	if pl == nil || pl.GetPipelineKey() == "" {
		return ErrPipelineKeyRequired
	}
	if environmentKey == "" {
		return errors.New("environment_key is required")
	}

	exists, err := s.logic.pipelineDAO.ExistsByKey(ctx, s.logic.db, environmentKey, pl.GetPipelineKey())
	if err != nil {
		return err
	}
	if exists {
		return ErrPipelineKeyExists
	}

	entity := &model.Pipeline{
		EnvironmentKey: environmentKey,
		PipelineKey:    pl.GetPipelineKey(),
		PipelineName:   pl.GetPipelineName(),
		Description:    pl.GetDescription(),
		SortOrder:      int(pl.GetSortOrder()),
		IsActive:       pl.GetIsActive(),
	}
	return s.logic.pipelineDAO.Create(ctx, s.logic.db, entity)
}

// UpdatePipeline updates an existing pipeline.
func (s *Service) UpdatePipeline(ctx context.Context, environmentKey string, pl *plpb.Pipeline) error {
	if pl == nil || pl.GetPipelineKey() == "" {
		return ErrPipelineKeyRequired
	}
	if environmentKey == "" {
		return errors.New("environment_key is required")
	}

	_, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, environmentKey, pl.GetPipelineKey())
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPipelineNotFound
		}
		return err
	}

	entity := &model.Pipeline{
		EnvironmentKey: environmentKey,
		PipelineKey:    pl.GetPipelineKey(),
		PipelineName:   pl.GetPipelineName(),
		Description:    pl.GetDescription(),
		SortOrder:      int(pl.GetSortOrder()),
		IsActive:       pl.GetIsActive(),
	}
	return s.logic.pipelineDAO.Update(ctx, s.logic.db, entity)
}

// DeletePipeline deletes a pipeline by key.
func (s *Service) DeletePipeline(ctx context.Context, environmentKey, pipelineKey string) error {
	if pipelineKey == "" {
		return ErrPipelineKeyRequired
	}
	if environmentKey == "" {
		return errors.New("environment_key is required")
	}

	_, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, environmentKey, pipelineKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPipelineNotFound
		}
		return err
	}

	return s.logic.pipelineDAO.Delete(ctx, s.logic.db, environmentKey, pipelineKey)
}

// GetPipeline returns a pipeline by key.
func (s *Service) GetPipeline(ctx context.Context, environmentKey, pipelineKey string) (*plpb.Pipeline, error) {
	if pipelineKey == "" {
		return nil, ErrPipelineKeyRequired
	}
	if environmentKey == "" {
		return nil, errors.New("environment_key is required")
	}

	entity, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, environmentKey, pipelineKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPipelineNotFound
		}
		return nil, err
	}

	return modelPipelineToPB(entity), nil
}

// ListPipelines returns all pipelines with optional active filter.
func (s *Service) ListPipelines(ctx context.Context, environmentKey string, isActive *bool) ([]*plpb.Pipeline, error) {
	if environmentKey == "" {
		return nil, errors.New("environment_key is required")
	}

	entities, err := s.logic.pipelineDAO.List(ctx, s.logic.db, environmentKey, isActive)
	if err != nil {
		return nil, err
	}

	return pipelineSliceToPB(entities), nil
}

func modelPipelineToPB(pl *model.Pipeline) *plpb.Pipeline {
	if pl == nil {
		return nil
	}
	return &plpb.Pipeline{
		EnvironmentKey: pl.EnvironmentKey,
		PipelineKey:    pl.PipelineKey,
		PipelineName:   pl.PipelineName,
		Description:    pl.Description,
		SortOrder:      int32(pl.SortOrder),
		IsActive:       pl.IsActive,
	}
}

func pipelineSliceToPB(pls []model.Pipeline) []*plpb.Pipeline {
	list := make([]*plpb.Pipeline, 0, len(pls))
	for i := range pls {
		list = append(list, modelPipelineToPB(&pls[i]))
	}
	return list
}
