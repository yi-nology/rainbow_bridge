package service

import (
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/db"
	"gorm.io/gorm"
)

var (
	ErrResourceNotFound  = errors.New("resource not found")
	ErrAssetNotFound     = errors.New("asset not found")
	ErrConfigAliasExists = errors.New("该环境和渠道下已存在相同别名的配置")
)

// Logic contains business rules on top of data persistence.
type Logic struct {
	db             *gorm.DB
	configDAO      *db.ConfigDAO
	assetDAO       *db.AssetDAO
	environmentDAO *db.EnvironmentDAO
	pipelineDAO    *db.PipelineDAO
}

func NewLogic(dbConn *gorm.DB) *Logic {
	return &Logic{
		db:             dbConn,
		configDAO:      db.NewConfigDAO(),
		assetDAO:       db.NewAssetDAO(),
		environmentDAO: db.NewEnvironmentDAO(),
		pipelineDAO:    db.NewPipelineDAO(),
	}
}
