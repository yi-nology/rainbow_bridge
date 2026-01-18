package service

import (
	"context"
	"log"

	"github.com/yi-nology/rainbow_bridge/biz/dal/db"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/constants"
	"gorm.io/gorm"
)

const (
	DefaultEnvironmentKey  = "default"
	DefaultEnvironmentName = "默认环境"
	DefaultPipelineKey     = "default"
	DefaultPipelineName    = "默认流水线"
)

// InitDefaultEnvironment creates the default environment if it doesn't exist.
func (s *Service) InitDefaultEnvironment(ctx context.Context) error {
	exists, err := s.logic.environmentDAO.ExistsByKey(ctx, s.logic.db, DefaultEnvironmentKey)
	if err != nil {
		return err
	}
	if exists {
		log.Printf("[Init] Default environment already exists")
		return nil
	}

	env := &model.Environment{
		EnvironmentKey:  DefaultEnvironmentKey,
		EnvironmentName: DefaultEnvironmentName,
		Description:     "系统默认环境",
		SortOrder:       0,
		IsActive:        true,
	}
	if err := s.logic.environmentDAO.Create(ctx, s.logic.db, env); err != nil {
		return err
	}
	log.Printf("[Init] Created default environment: %s", DefaultEnvironmentKey)
	return nil
}

// InitDefaultPipeline creates the default pipeline if it doesn't exist.
func (s *Service) InitDefaultPipeline(ctx context.Context) error {
	exists, err := s.logic.pipelineDAO.ExistsByKey(ctx, s.logic.db, DefaultEnvironmentKey, DefaultPipelineKey)
	if err != nil {
		return err
	}
	if exists {
		log.Printf("[Init] Default pipeline already exists")
		return nil
	}

	pl := &model.Pipeline{
		EnvironmentKey: DefaultEnvironmentKey,
		PipelineKey:    DefaultPipelineKey,
		PipelineName:   DefaultPipelineName,
		Description:    "系统默认流水线",
		SortOrder:      0,
		IsActive:       true,
	}
	if err := s.logic.pipelineDAO.Create(ctx, s.logic.db, pl); err != nil {
		return err
	}
	log.Printf("[Init] Created default pipeline: %s", DefaultPipelineKey)
	return nil
}

// InitDefaults initializes default environment and pipeline.
func (s *Service) InitDefaults(ctx context.Context) error {
	if err := s.InitDefaultEnvironment(ctx); err != nil {
		return err
	}
	if err := s.InitDefaultPipeline(ctx); err != nil {
		return err
	}
	return nil
}

// MigrateConfigDefaults sets default environment_key and pipeline_key for existing configs.
func MigrateConfigDefaults(db *gorm.DB) error {
	result := db.Model(&model.Config{}).
		Where("environment_key = '' OR environment_key IS NULL").
		Update("environment_key", DefaultEnvironmentKey)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		log.Printf("[Migration] Updated %d configs with default environment_key", result.RowsAffected)
	}

	result = db.Model(&model.Config{}).
		Where("pipeline_key = '' OR pipeline_key IS NULL").
		Update("pipeline_key", DefaultPipelineKey)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		log.Printf("[Migration] Updated %d configs with default pipeline_key", result.RowsAffected)
	}

	return nil
}

// EnsureSystemDefaults initializes default environment, pipeline, and system configs at startup.
// This is a package-level function that can be called before Service is created.
func EnsureSystemDefaults(ctx context.Context, dbConn *gorm.DB) error {
	envDAO := db.NewEnvironmentDAO()
	plDAO := db.NewPipelineDAO()
	sysConfigDAO := db.NewSystemConfigDAO()

	// Create default environment
	envExists, err := envDAO.ExistsByKey(ctx, dbConn, DefaultEnvironmentKey)
	if err != nil {
		return err
	}
	if !envExists {
		env := &model.Environment{
			EnvironmentKey:  DefaultEnvironmentKey,
			EnvironmentName: DefaultEnvironmentName,
			Description:     "系统默认环境",
			SortOrder:       0,
			IsActive:        true,
		}
		if err := envDAO.Create(ctx, dbConn, env); err != nil {
			return err
		}
		log.Printf("[Init] Created default environment: %s", DefaultEnvironmentKey)
	}

	// Initialize system configs for default environment and pipeline if not exists
	sysConfigExists, err := sysConfigDAO.ExistsByKey(ctx, dbConn, DefaultEnvironmentKey, DefaultPipelineKey, constants.SysConfigSystemOptions)
	if err != nil {
		return err
	}
	if !sysConfigExists {
		configs := []model.SystemConfig{
			{
				EnvironmentKey: DefaultEnvironmentKey,
				PipelineKey:    DefaultPipelineKey,
				ConfigKey:      constants.SysConfigSystemOptions,
				ConfigValue:    constants.DefaultSystemOptions,
				ConfigType:     constants.DefaultSystemConfigType,
				Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigSystemOptions],
			},
		}
		if err := sysConfigDAO.BatchCreate(ctx, dbConn, configs); err != nil {
			return err
		}
		log.Printf("[Init] Created default system configs for environment: %s, pipeline: %s", DefaultEnvironmentKey, DefaultPipelineKey)
	}

	// Create default pipeline
	plExists, err := plDAO.ExistsByKey(ctx, dbConn, DefaultEnvironmentKey, DefaultPipelineKey)
	if err != nil {
		return err
	}
	if !plExists {
		pl := &model.Pipeline{
			EnvironmentKey: DefaultEnvironmentKey,
			PipelineKey:    DefaultPipelineKey,
			PipelineName:   DefaultPipelineName,
			Description:    "系统默认流水线",
			SortOrder:      0,
			IsActive:       true,
		}
		if err := plDAO.Create(ctx, dbConn, pl); err != nil {
			return err
		}
		log.Printf("[Init] Created default pipeline: %s", DefaultPipelineKey)
	}

	return nil
}
