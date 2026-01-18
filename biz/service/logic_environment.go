package service

import (
	"context"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
)

// --------------------- Environment Operations ---------------------

func (l *Logic) ListEnvironments(ctx context.Context) ([]model.Environment, error) {
	return l.environmentDAO.List(ctx, l.db, nil)
}

func (l *Logic) ListPipelines(ctx context.Context) ([]model.Pipeline, error) {
	return l.pipelineDAO.List(ctx, l.db, nil)
}
