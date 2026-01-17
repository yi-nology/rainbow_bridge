package model

import (
	"time"

	"gorm.io/gorm"
)

// Environment represents an environment entity for configuration isolation.
type Environment struct {
	ID              uint           `gorm:"primaryKey" json:"id,omitempty"`
	CreatedAt       time.Time      `json:"created_at,omitempty"`
	UpdatedAt       time.Time      `json:"updated_at,omitempty"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
	EnvironmentKey  string         `gorm:"column:environment_key;uniqueIndex:uk_environment_key" json:"environment_key,omitempty"`
	EnvironmentName string         `gorm:"column:environment_name" json:"environment_name,omitempty"`
	Description     string         `gorm:"column:description;type:varchar(512)" json:"description,omitempty"`
	SortOrder       int            `gorm:"column:sort_order;default:0" json:"sort_order,omitempty"`
	IsActive        bool           `gorm:"column:is_active;default:true" json:"is_active,omitempty"`
}

// TableName overrides gorm to use environment table.
func (Environment) TableName() string {
	return "environment"
}
