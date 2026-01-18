package service

import (
	"errors"

	"github.com/yi-nology/rainbow_bridge/biz/dal/db"
	"gorm.io/gorm"
)

var (
	ErrResourceNotFound      = errors.New("resource not found")
	ErrAssetNotFound         = errors.New("asset not found")
	ErrProtectedSystemConfig = errors.New("系统保留配置禁止删除")
)

// Logic contains business rules on top of data persistence.
type Logic struct {
	db              *gorm.DB
	configDAO       *db.ConfigDAO
	assetDAO        *db.AssetDAO
	environmentDAO  *db.EnvironmentDAO
	pipelineDAO     *db.PipelineDAO
	systemConfigDAO *db.SystemConfigDAO
}

func NewLogic(dbConn *gorm.DB) *Logic {
	return &Logic{
		db:              dbConn,
		configDAO:       db.NewConfigDAO(),
		assetDAO:        db.NewAssetDAO(),
		environmentDAO:  db.NewEnvironmentDAO(),
		pipelineDAO:     db.NewPipelineDAO(),
		systemConfigDAO: db.NewSystemConfigDAO(),
	}
}
