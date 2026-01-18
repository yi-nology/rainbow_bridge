package model

import (
	"time"

	"gorm.io/gorm"
)

// SystemConfig represents a system configuration in the database.
type SystemConfig struct {
	ID             uint           `gorm:"primaryKey" json:"id,omitempty"`
	CreatedAt      time.Time      `json:"created_at,omitempty"`
	UpdatedAt      time.Time      `json:"updated_at,omitempty"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	EnvironmentKey string         `gorm:"column:environment_key;uniqueIndex:uk_system_config,priority:1;index:idx_sys_cfg_env" json:"environment_key,omitempty"`
	PipelineKey    string         `gorm:"column:pipeline_key;uniqueIndex:uk_system_config,priority:2;index:idx_sys_cfg_pipeline" json:"pipeline_key,omitempty"`
	ConfigKey      string         `gorm:"column:config_key;uniqueIndex:uk_system_config,priority:3" json:"config_key,omitempty"`
	ConfigValue    string         `gorm:"column:config_value;type:text" json:"config_value,omitempty"`
	ConfigType     string         `gorm:"column:config_type;type:varchar(20);default:'text'" json:"config_type,omitempty"` // 数据类型: config, text, image, color, keyvalue
	Remark         string         `gorm:"column:remark;type:varchar(512)" json:"remark,omitempty"`
}

// TableName overrides gorm to use system_config table.
func (SystemConfig) TableName() string {
	return "system_config"
}
