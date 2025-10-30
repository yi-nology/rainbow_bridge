package resource

import (
	"time"

	"gorm.io/gorm"
)

// Config represents a configuration resource persisted in storage.
type Config struct {
	ID          uint           `gorm:"primaryKey" json:"id,omitempty"`
	CreatedAt   time.Time      `json:"created_at,omitempty"`
	UpdatedAt   time.Time      `json:"updated_at,omitempty"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	ResourceKey string         `gorm:"column:resource_key;uniqueIndex:uk_config_resource" json:"resource_key,omitempty"`
	Alias       string         `gorm:"column:alias;index:idx_config_alias" json:"alias,omitempty"`
	Name        string         `gorm:"column:name" json:"name,omitempty"`
	BusinessKey string         `gorm:"column:business_key;index:idx_config_business" json:"business_key,omitempty"`
	Content     string         `gorm:"column:content;type:text" json:"content,omitempty"`
	Type        string         `gorm:"column:type" json:"type,omitempty"`
	Remark      string         `gorm:"column:remark;type:varchar(512)" json:"remark,omitempty"`
	IsPerm      bool           `gorm:"column:is_perm" json:"is_perm,omitempty"`
}

// TableName overrides gorm to use resource_config table.
func (Config) TableName() string {
	return "resource_config"
}
