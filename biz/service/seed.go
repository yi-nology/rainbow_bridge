package service

import (
	"context"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	resourcedal "github.com/yi-nology/rainbow_bridge/biz/dal/resource"
	"gorm.io/gorm"
)

var defaultSystemConfigs = []model.Config{
	{
		Name:        "系统选择",
		BusinessKey: "system",
		Alias:       "business_select",
		Type:        "config",
		Content:     "default",
	},
	{
		Name:        "系统选项",
		BusinessKey: "system",
		Alias:       "system_keys",
		Type:        "config",
		Content:     `{"logo":"logo"}`,
	},
}

// EnsureSystemDefaults seeds essential system configs if they are missing.
func EnsureSystemDefaults(ctx context.Context, db *gorm.DB) error {
	dao := resourcedal.NewConfigDAO()
	for i := range defaultSystemConfigs {
		cfg := defaultSystemConfigs[i]
		existing, err := dao.GetByAlias(ctx, db, cfg.BusinessKey, cfg.Alias)
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if existing != nil {
			continue
		}
		if err := dao.Create(ctx, db, &cfg); err != nil {
			return err
		}
	}
	return nil
}
