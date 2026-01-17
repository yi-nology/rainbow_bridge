package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	resourcemodel "github.com/yi-nology/rainbow_bridge/biz/dal/model"
	resourcedal "github.com/yi-nology/rainbow_bridge/biz/dal/resource"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
	"github.com/yi-nology/rainbow_bridge/pkg/constants"
	"github.com/yi-nology/rainbow_bridge/pkg/util"
	"github.com/yi-nology/rainbow_bridge/pkg/validator"

	"gorm.io/gorm"
)

var (
	ErrResourceNotFound      = errors.New("resource not found")
	ErrAssetNotFound         = errors.New("asset not found")
	ErrProtectedSystemConfig = errors.New("系统保留配置禁止删除")
	colorHexRegexp           = regexp.MustCompile(`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)
)

// Logic contains business rules on top of data persistence.
type Logic struct {
	db              *gorm.DB
	configDAO       *resourcedal.ConfigDAO
	assetDAO        *resourcedal.AssetDAO
	environmentDAO  *resourcedal.EnvironmentDAO
	pipelineDAO     *resourcedal.PipelineDAO
	systemConfigDAO *resourcedal.SystemConfigDAO
}

func NewLogic(db *gorm.DB) *Logic {
	return &Logic{
		db:              db,
		configDAO:       resourcedal.NewConfigDAO(),
		assetDAO:        resourcedal.NewAssetDAO(),
		environmentDAO:  resourcedal.NewEnvironmentDAO(),
		pipelineDAO:     resourcedal.NewPipelineDAO(),
		systemConfigDAO: resourcedal.NewSystemConfigDAO(),
	}
}

// --------------------- Config Operations ---------------------

func (l *Logic) AddConfig(ctx context.Context, cfg *resourcemodel.Config) error {
	if cfg == nil {
		return nil
	}
	normalizeConfigPayload(cfg)
	if err := validateConfigContent(cfg); err != nil {
		return err
	}
	return l.configDAO.Create(ctx, l.db, cfg)
}

func (l *Logic) UpdateConfig(ctx context.Context, cfg *resourcemodel.Config) error {
	if cfg == nil {
		return nil
	}
	normalizeConfigPayload(cfg)
	if err := validateConfigContent(cfg); err != nil {
		return err
	}
	if _, err := l.configDAO.GetByResourceKey(ctx, l.db, cfg.BusinessKey, cfg.ResourceKey); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	return l.configDAO.UpdateByBusinessKey(ctx, l.db, cfg.BusinessKey, cfg)
}

func (l *Logic) DeleteConfig(ctx context.Context, businessKey, resourceKey string) error {
	cfg, err := l.configDAO.GetByResourceKey(ctx, l.db, businessKey, resourceKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	if businessKey == constants.SystemBusinessKey && constants.IsProtectedSystemConfig(cfg.Alias) {
		return ErrProtectedSystemConfig
	}
	return l.configDAO.DeleteByBusinessKeyAndResourceKey(ctx, l.db, businessKey, resourceKey)
}

func (l *Logic) GetConfig(ctx context.Context, businessKey, resourceKey string) (*resourcemodel.Config, error) {
	cfg, err := l.configDAO.GetByResourceKey(ctx, l.db, businessKey, resourceKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrResourceNotFound
	}
	return cfg, err
}

func (l *Logic) GetConfigByKey(ctx context.Context, resourceKey string) (*resourcemodel.Config, error) {
	cfg, err := l.configDAO.GetByResourceKeyOnly(ctx, l.db, resourceKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrResourceNotFound
	}
	return cfg, err
}

func (l *Logic) ListConfigs(ctx context.Context, businessKey, minVersion, maxVersion, resourceType string, latestOnly bool) ([]resourcemodel.Config, error) {
	if latestOnly {
		version := common.GetClientVersion(ctx)
		return l.configDAO.ListByBusinessKeyAndVersion(ctx, l.db, businessKey, version)
	}
	return l.configDAO.ListByBusinessKey(ctx, l.db, businessKey, minVersion, maxVersion, resourceType)
}

func (l *Logic) ListSystemConfigs(ctx context.Context) (map[string]any, error) {
	aliasResource, err := l.configDAO.GetByAlias(ctx, l.db, constants.SystemBusinessKey, constants.SysConfigBusinessSelect)
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	targetBusiness := constants.SystemBusinessKey
	if aliasResource != nil && aliasResource.Content != "" {
		candidate := strings.TrimSpace(aliasResource.Content)
		// Validate the business key to prevent injection
		if validator.ValidateBusinessKey(candidate) {
			targetBusiness = candidate
		}
		// If invalid, fall back to system
	}

	data, err := l.configDAO.ListByBusinessKey(ctx, l.db, targetBusiness, "", "", "")
	if err != nil {
		return nil, err
	}

	userID, ok := common.GetUserID(ctx)
	if !ok || userID == 0 {
		filtered := make([]resourcemodel.Config, 0, len(data))
		for _, res := range data {
			if res.IsPerm {
				continue
			}
			filtered = append(filtered, res)
		}
		data = filtered
	}

	result := make(map[string]any, len(data))
	for _, res := range data {
		result[res.Alias] = res.Content
	}
	return result, nil
}

func (l *Logic) ExportConfigs(ctx context.Context, businessKey string, includeSystem bool) ([]resourcemodel.Config, error) {
	data, err := l.configDAO.ListByBusinessKeyAndVersion(ctx, l.db, businessKey, common.GetClientVersion(ctx))
	if err != nil {
		return nil, err
	}
	for i := range data {
		data[i].ResourceKey = ""
	}
	if !includeSystem {
		return data, nil
	}
	system, err := l.configDAO.ListByBusinessKeyAndVersion(ctx, l.db, "system", common.GetClientVersion(ctx))
	if err != nil {
		return nil, err
	}
	for i := range system {
		system[i].ResourceKey = ""
	}
	return append(data, system...), nil
}

func (l *Logic) ImportConfigs(ctx context.Context, configs []resourcemodel.Config, overwrite bool) error {
	if overwrite {
		if err := l.configDAO.ClearAll(ctx, l.db); err != nil {
			return err
		}
	}

	for idx := range configs {
		cfg := configs[idx]
		normalizeConfigPayload(&cfg)
		if err := validateConfigContent(&cfg); err != nil {
			return err
		}
		existing, err := l.configDAO.GetByResourceKey(ctx, l.db, cfg.BusinessKey, cfg.ResourceKey)
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if existing == nil && cfg.ResourceKey == "" && cfg.Alias != "" {
			existing, err = l.configDAO.GetByAlias(ctx, l.db, cfg.BusinessKey, cfg.Alias)
			if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}
		}
		if existing == nil {
			if err := l.configDAO.Create(ctx, l.db, &cfg); err != nil {
				return err
			}
			continue
		}
		cfg.ResourceKey = existing.ResourceKey
		if err := l.configDAO.UpdateByBusinessKey(ctx, l.db, cfg.BusinessKey, &cfg); err != nil {
			return err
		}
	}
	return nil
}

func normalizeConfigPayload(cfg *resourcemodel.Config) {
	if cfg == nil {
		return
	}
	cfg.BusinessKey = strings.TrimSpace(cfg.BusinessKey)
	cfg.Alias = strings.TrimSpace(cfg.Alias)
	cfg.Name = strings.TrimSpace(cfg.Name)
	cfg.Type = normalizeConfigType(cfg.Type)
	cfg.Content = strings.TrimSpace(cfg.Content)
	cfg.Remark = strings.TrimSpace(cfg.Remark)
}

func normalizeConfigType(t string) string {
	return util.NormalizeConfigType(t)
}

func validateConfigContent(cfg *resourcemodel.Config) error {
	if cfg == nil {
		return errors.New("config payload required")
	}
	switch cfg.Type {
	case "image":
		if cfg.Content == "" {
			return errors.New("图片类型内容不能为空")
		}
		if strings.HasPrefix(cfg.Content, "asset://") ||
			strings.HasPrefix(cfg.Content, "/api/v1/files/") ||
			strings.HasPrefix(strings.ToLower(cfg.Content), "http://") ||
			strings.HasPrefix(strings.ToLower(cfg.Content), "https://") {
			if strings.HasPrefix(cfg.Content, "asset://") {
				cfg.Content = "/api/v1/files/" + strings.TrimPrefix(cfg.Content, "asset://")
			}
			return nil
		}
		return errors.New("图片类型内容必须为有效的引用地址")
	case "text":
		if cfg.Content == "" {
			return errors.New("文案内容不能为空")
		}
		return nil
	case "color":
		colorValue, err := normalizeColorContent(cfg.Content)
		if err != nil {
			return err
		}
		cfg.Content = colorValue
		return nil
	default:
		if cfg.Content == "" {
			return errors.New("配置内容不能为空")
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(cfg.Content), &payload); err != nil {
			return fmt.Errorf("配置内容需为 JSON 对象: %w", err)
		}
		if payload == nil {
			return errors.New("配置内容不能为空对象")
		}
		canonical, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		cfg.Content = string(canonical)
		return nil
	}
}

func normalizeColorContent(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("色彩标签内容不能为空")
	}
	matches := colorHexRegexp.FindStringSubmatch(trimmed)
	if matches == nil {
		return "", errors.New("色彩标签内容需为 #RGB 或 #RRGGBB 格式")
	}
	hex := matches[1]
	if len(hex) == 3 {
		hex = fmt.Sprintf("%c%c%c%c%c%c", hex[0], hex[0], hex[1], hex[1], hex[2], hex[2])
	}
	return "#" + strings.ToUpper(hex), nil
}

func (l *Logic) ListBusinessKeys(ctx context.Context) ([]string, error) {
	return l.configDAO.ListAllBusinessKeys(ctx, l.db)
}

// --------------------- Asset Operations ---------------------

func (l *Logic) CreateAsset(ctx context.Context, asset *resourcemodel.Asset) error {
	return l.assetDAO.Create(ctx, l.db, asset)
}

func (l *Logic) UpdateAsset(ctx context.Context, asset *resourcemodel.Asset) error {
	if err := l.assetDAO.Update(ctx, l.db, asset); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAssetNotFound
		}
		return err
	}
	return nil
}

func (l *Logic) DeleteAsset(ctx context.Context, fileID string) error {
	return l.assetDAO.DeleteByFileID(ctx, l.db, fileID)
}

func (l *Logic) GetAsset(ctx context.Context, fileID string) (*resourcemodel.Asset, error) {
	asset, err := l.assetDAO.GetByFileID(ctx, l.db, fileID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAssetNotFound
	}
	return asset, err
}

func (l *Logic) ListAssetsByBusinessKey(ctx context.Context, businessKey string) ([]resourcemodel.Asset, error) {
	return l.assetDAO.ListByBusinessKey(ctx, l.db, businessKey)
}

// --------------------- SystemConfig Operations ---------------------

var (
	ErrSystemConfigNotFound    = errors.New("system config not found")
	ErrInvalidSystemConfigKey  = errors.New("invalid system config key")
	ErrSystemConfigKeyRequired = errors.New("config_key is required")
)

// GetSystemConfigValue retrieves a system config value with fallback strategy:
// 1. Query system_config table
// 2. Fallback to resource_config table (business_key='system', alias=config_key)
// 3. Return hardcoded default value
func (l *Logic) GetSystemConfigValue(ctx context.Context, environmentKey, configKey string) (string, error) {
	// Step 1: Try system_config table
	sysConfig, err := l.systemConfigDAO.GetByKey(ctx, l.db, environmentKey, configKey)
	if err == nil && sysConfig != nil {
		return sysConfig.ConfigValue, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}

	// Step 2: Fallback to resource_config table
	cfg, err := l.configDAO.GetByAlias(ctx, l.db, constants.SystemBusinessKey, configKey)
	if err == nil && cfg != nil {
		return cfg.Content, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}

	// Step 3: Return default value
	switch configKey {
	case constants.SysConfigBusinessSelect:
		return constants.DefaultBusinessSelect, nil
	case constants.SysConfigSystemKeys:
		return constants.DefaultSystemKeys, nil
	default:
		return "", ErrSystemConfigNotFound
	}
}

// GetSystemConfig retrieves a system config entity with fallback strategy.
func (l *Logic) GetSystemConfig(ctx context.Context, environmentKey, configKey string) (*resourcemodel.SystemConfig, error) {
	// Step 1: Try system_config table
	sysConfig, err := l.systemConfigDAO.GetByKey(ctx, l.db, environmentKey, configKey)
	if err == nil && sysConfig != nil {
		return sysConfig, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Step 2: Fallback to resource_config table
	cfg, err := l.configDAO.GetByAlias(ctx, l.db, constants.SystemBusinessKey, configKey)
	if err == nil && cfg != nil {
		return &resourcemodel.SystemConfig{
			EnvironmentKey: environmentKey,
			ConfigKey:      configKey,
			ConfigValue:    cfg.Content,
			Remark:         cfg.Remark,
		}, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Step 3: Return default value
	switch configKey {
	case constants.SysConfigBusinessSelect:
		return &resourcemodel.SystemConfig{
			EnvironmentKey: environmentKey,
			ConfigKey:      configKey,
			ConfigValue:    constants.DefaultBusinessSelect,
			Remark:         constants.DefaultSystemConfigRemark[configKey],
		}, nil
	case constants.SysConfigSystemKeys:
		return &resourcemodel.SystemConfig{
			EnvironmentKey: environmentKey,
			ConfigKey:      configKey,
			ConfigValue:    constants.DefaultSystemKeys,
			Remark:         constants.DefaultSystemConfigRemark[configKey],
		}, nil
	default:
		return nil, ErrSystemConfigNotFound
	}
}

// ListSystemConfigsByEnvironment returns all system configs for an environment.
func (l *Logic) ListSystemConfigsByEnvironment(ctx context.Context, environmentKey string) ([]resourcemodel.SystemConfig, error) {
	configs, err := l.systemConfigDAO.ListByEnvironment(ctx, l.db, environmentKey)
	if err != nil {
		return nil, err
	}

	// If no configs found, return defaults
	if len(configs) == 0 {
		return []resourcemodel.SystemConfig{
			{
				EnvironmentKey: environmentKey,
				ConfigKey:      constants.SysConfigBusinessSelect,
				ConfigValue:    constants.DefaultBusinessSelect,
				Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigBusinessSelect],
			},
			{
				EnvironmentKey: environmentKey,
				ConfigKey:      constants.SysConfigSystemKeys,
				ConfigValue:    constants.DefaultSystemKeys,
				Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigSystemKeys],
			},
		}, nil
	}

	return configs, nil
}

// UpdateSystemConfig updates a system config value.
// Only business_select and system_keys are allowed to be updated.
func (l *Logic) UpdateSystemConfig(ctx context.Context, environmentKey, configKey, configValue string) error {
	// Validate config key
	if !constants.IsProtectedSystemConfig(configKey) {
		return ErrInvalidSystemConfigKey
	}

	// Check if config exists
	exists, err := l.systemConfigDAO.ExistsByKey(ctx, l.db, environmentKey, configKey)
	if err != nil {
		return err
	}

	if exists {
		// Update existing config
		return l.systemConfigDAO.Update(ctx, l.db, environmentKey, configKey, configValue)
	}

	// Create new config if not exists
	return l.systemConfigDAO.Create(ctx, l.db, &resourcemodel.SystemConfig{
		EnvironmentKey: environmentKey,
		ConfigKey:      configKey,
		ConfigValue:    configValue,
		Remark:         constants.DefaultSystemConfigRemark[configKey],
	})
}

// InitSystemConfigsForEnvironment initializes default system configs for a new environment.
func (l *Logic) InitSystemConfigsForEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) error {
	configs := []resourcemodel.SystemConfig{
		{
			EnvironmentKey: environmentKey,
			ConfigKey:      constants.SysConfigBusinessSelect,
			ConfigValue:    constants.DefaultBusinessSelect,
			Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigBusinessSelect],
		},
		{
			EnvironmentKey: environmentKey,
			ConfigKey:      constants.SysConfigSystemKeys,
			ConfigValue:    constants.DefaultSystemKeys,
			Remark:         constants.DefaultSystemConfigRemark[constants.SysConfigSystemKeys],
		},
	}
	return l.systemConfigDAO.BatchCreate(ctx, db, configs)
}

// DeleteSystemConfigsByEnvironment removes all system configs for an environment (cascade delete).
func (l *Logic) DeleteSystemConfigsByEnvironment(ctx context.Context, db *gorm.DB, environmentKey string) error {
	return l.systemConfigDAO.DeleteByEnvironment(ctx, db, environmentKey)
}
