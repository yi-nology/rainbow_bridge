package model

import (
	"time"

	"gorm.io/gorm"
)

// Pipeline represents a pipeline entity for configuration isolation.
type Pipeline struct {
	ID             uint           `gorm:"primaryKey" json:"id,omitempty"`
	CreatedAt      time.Time      `json:"created_at,omitempty"`
	UpdatedAt      time.Time      `json:"updated_at,omitempty"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	EnvironmentKey string         `gorm:"column:environment_key;uniqueIndex:uk_env_pipeline,priority:1;index:idx_pipeline_env" json:"environment_key,omitempty"`
	PipelineKey    string         `gorm:"column:pipeline_key;uniqueIndex:uk_env_pipeline,priority:2" json:"pipeline_key,omitempty"`
	PipelineName   string         `gorm:"column:pipeline_name" json:"pipeline_name,omitempty"`
	Description    string         `gorm:"column:description;type:varchar(512)" json:"description,omitempty"`
	SortOrder      int            `gorm:"column:sort_order;default:0" json:"sort_order,omitempty"`
	IsActive       bool           `gorm:"column:is_active;default:true" json:"is_active,omitempty"`
}

// TableName overrides gorm to use pipeline table.
func (Pipeline) TableName() string {
	return "pipeline"
}
