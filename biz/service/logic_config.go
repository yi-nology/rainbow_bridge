package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
	"github.com/yi-nology/rainbow_bridge/pkg/constants"
	"github.com/yi-nology/rainbow_bridge/pkg/util"

	"gorm.io/gorm"
)

var (
	colorHexRegexp = regexp.MustCompile(`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)
)

// --------------------- Config Operations ---------------------

func (l *Logic) AddConfig(ctx context.Context, cfg *model.Config) error {
	if cfg == nil {
		return nil
	}
	normalizeConfigPayload(cfg)
	if err := l.validateConfigContent(ctx, cfg); err != nil {
		return err
	}

	// Check if alias already exists in the same environment and pipeline
	if cfg.Alias != "" {
		existing, err := l.configDAO.GetByAlias(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, cfg.Alias)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if existing != nil {
			return ErrConfigAliasExists
		}
	}

	return l.configDAO.Create(ctx, l.db, cfg)
}

func (l *Logic) UpdateConfig(ctx context.Context, cfg *model.Config) error {
	if cfg == nil {
		return nil
	}
	normalizeConfigPayload(cfg)
	if err := l.validateConfigContent(ctx, cfg); err != nil {
		return err
	}
	if _, err := l.configDAO.GetByResourceKey(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, cfg.ResourceKey); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	return l.configDAO.UpdateByEnvironmentAndPipeline(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, cfg)
}

func (l *Logic) DeleteConfig(ctx context.Context, environmentKey, pipelineKey, resourceKey string) error {
	cfg, err := l.configDAO.GetByResourceKey(ctx, l.db, environmentKey, pipelineKey, resourceKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	// Remove business key check as it's no longer relevant
	if constants.IsProtectedSystemConfig(cfg.Alias) {
		return ErrProtectedSystemConfig
	}
	return l.configDAO.DeleteByEnvironmentPipelineAndResourceKey(ctx, l.db, environmentKey, pipelineKey, resourceKey)
}

func (l *Logic) GetConfig(ctx context.Context, environmentKey, pipelineKey, resourceKey string) (*model.Config, error) {
	cfg, err := l.configDAO.GetByResourceKey(ctx, l.db, environmentKey, pipelineKey, resourceKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrResourceNotFound
	}
	return cfg, err
}

func (l *Logic) GetConfigByKey(ctx context.Context, resourceKey string) (*model.Config, error) {
	cfg, err := l.configDAO.GetByResourceKeyOnly(ctx, l.db, resourceKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrResourceNotFound
	}
	return cfg, err
}

func (l *Logic) ListConfigs(ctx context.Context, environmentKey, pipelineKey, minVersion, maxVersion, resourceType string, latestOnly bool) ([]model.Config, error) {
	if latestOnly {
		version := common.GetClientVersion(ctx)
		return l.configDAO.ListByEnvironmentAndPipeline(ctx, l.db, environmentKey, pipelineKey, version)
	}
	return l.configDAO.ListByEnvironmentAndPipelineWithFilter(ctx, l.db, environmentKey, pipelineKey, minVersion, maxVersion, resourceType)
}

func (l *Logic) ListSystemConfigs(ctx context.Context, environmentKey, pipelineKey string) (map[string]any, error) {
	// No longer using targetBusiness, just use provided environment/pipeline
	data, err := l.configDAO.ListByEnvironmentAndPipelineWithFilter(ctx, l.db, environmentKey, pipelineKey, "", "", "")
	if err != nil {
		return nil, err
	}

	userID, ok := common.GetUserID(ctx)
	if !ok || userID == 0 {
		filtered := make([]model.Config, 0, len(data))
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

func (l *Logic) ExportConfigs(ctx context.Context, environmentKey, pipelineKey string) ([]model.Config, error) {
	data, err := l.configDAO.ListByEnvironmentAndPipeline(ctx, l.db, environmentKey, pipelineKey, common.GetClientVersion(ctx))
	if err != nil {
		return nil, err
	}
	for i := range data {
		data[i].ResourceKey = ""
	}
	return data, nil
}

func (l *Logic) ImportConfigs(ctx context.Context, configs []model.Config, overwrite bool) error {
	if overwrite {
		if err := l.configDAO.ClearAll(ctx, l.db); err != nil {
			return err
		}
	}

	// 用于跟踪已导入的 alias，避免重复
	importedAliases := make(map[string]bool)

	for idx := range configs {
		cfg := configs[idx]
		normalizeConfigPayload(&cfg)
		if err := l.validateConfigContent(ctx, &cfg); err != nil {
			return err
		}

		// 检查是否已经导入过相同的 alias
		aliasKey := fmt.Sprintf("%s/%s/%s", cfg.EnvironmentKey, cfg.PipelineKey, cfg.Alias)
		if cfg.Alias != "" && importedAliases[aliasKey] {
			// 跳过重复的 alias
			continue
		}

		existing, err := l.configDAO.GetByResourceKey(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, cfg.ResourceKey)
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if existing == nil && cfg.ResourceKey == "" && cfg.Alias != "" {
			existing, err = l.configDAO.GetByAlias(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, cfg.Alias)
			if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}
		}
		if existing == nil {
			if err := l.configDAO.Create(ctx, l.db, &cfg); err != nil {
				return err
			}
			// 记录已导入的 alias
			if cfg.Alias != "" {
				importedAliases[aliasKey] = true
			}
			continue
		}
		cfg.ResourceKey = existing.ResourceKey
		if err := l.configDAO.UpdateByEnvironmentAndPipeline(ctx, l.db, cfg.EnvironmentKey, cfg.PipelineKey, &cfg); err != nil {
			return err
		}
		// 记录已导入的 alias
		if cfg.Alias != "" {
			importedAliases[aliasKey] = true
		}
	}
	return nil
}

func (l *Logic) ListBusinessKeys(ctx context.Context) ([]string, error) {
	// Deprecated: business_key is replaced by environment_key + pipeline_key
	return []string{}, errors.New("business_key is deprecated")
}

// --------------------- Config Validation & Normalization ---------------------

func normalizeConfigPayload(cfg *model.Config) {
	if cfg == nil {
		return
	}
	cfg.EnvironmentKey = strings.TrimSpace(cfg.EnvironmentKey)
	cfg.PipelineKey = strings.TrimSpace(cfg.PipelineKey)
	cfg.Alias = strings.TrimSpace(cfg.Alias)
	cfg.Name = strings.TrimSpace(cfg.Name)
	cfg.Type = normalizeConfigType(cfg.Type)
	cfg.Content = strings.TrimSpace(cfg.Content)
	cfg.Remark = strings.TrimSpace(cfg.Remark)
}

func normalizeConfigType(t string) string {
	return util.NormalizeConfigType(t)
}

func (l *Logic) validateConfigContent(ctx context.Context, cfg *model.Config) error {
	if cfg == nil {
		return errors.New("config payload required")
	}
	switch cfg.Type {
	case "image":
		if cfg.Content == "" {
			return errors.New("图片类型内容不能为空")
		}
		if strings.HasPrefix(cfg.Content, "asset://") ||
			strings.HasPrefix(cfg.Content, "/api/v1/asset/file/") ||
			strings.HasPrefix(strings.ToLower(cfg.Content), "http://") ||
			strings.HasPrefix(strings.ToLower(cfg.Content), "https://") {
			if strings.HasPrefix(cfg.Content, "asset://") {
				fileID := strings.TrimPrefix(cfg.Content, "asset://")
				asset, err := l.assetDAO.GetByFileID(ctx, l.db, fileID)
				if err == nil && asset != nil {
					cfg.Content = fmt.Sprintf("/api/v1/asset/file/%s/%s", asset.FileID, asset.FileName)
				} else {
					// Fallback if asset not found in DB
					cfg.Content = "/api/v1/asset/file/" + fileID
				}
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
