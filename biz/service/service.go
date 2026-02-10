package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"

	"gorm.io/gorm"
)

const (
	dataDirectory   = "data"
	uploadDirectory = "uploads"
	assetScheme     = "asset://"
	fileURLPrefix   = "/api/v1/asset/file/"
)

var (
	assetRefRegexp   = regexp.MustCompile(`asset://([a-zA-Z0-9\-]+)`)
	fileURLRefRegexp = regexp.MustCompile(`/api/v1/asset/file/([a-zA-Z0-9\-]+)`)
)

// FileUploadInput captures metadata and payload for asset uploads.
type FileUploadInput struct {
	EnvironmentKey string
	PipelineKey    string
	Remark         string
	FileName       string
	ContentType    string
	Data           []byte
}

// Service orchestrates config and asset operations using Logic.
type Service struct {
	logic    *Logic
	basePath string
}

func NewService(db *gorm.DB, basePath string) *Service {
	return &Service{
		logic:    NewLogic(db),
		basePath: sanitizeServiceBasePath(basePath),
	}
}

// --------------------- Model conversion helpers ---------------------

func pbConfigToModel(cfg *common.ResourceConfig) *model.Config {
	if cfg == nil {
		return &model.Config{}
	}
	return &model.Config{
		ResourceKey:    cfg.GetResourceKey(),
		Alias:          cfg.GetAlias(),
		Name:           cfg.GetName(),
		EnvironmentKey: cfg.GetEnvironmentKey(),
		PipelineKey:    cfg.GetPipelineKey(),
		Content:        cfg.GetContent(),
		Type:           cfg.GetType(),
		Remark:         cfg.GetRemark(),
		IsPerm:         cfg.GetIsPerm(),
	}
}

func modelConfigToPB(cfg *model.Config) *common.ResourceConfig {
	if cfg == nil {
		return nil
	}
	return &common.ResourceConfig{
		ResourceKey:    cfg.ResourceKey,
		Alias:          cfg.Alias,
		Name:           cfg.Name,
		EnvironmentKey: cfg.EnvironmentKey,
		PipelineKey:    cfg.PipelineKey,
		Content:        cfg.Content,
		Type:           cfg.Type,
		Remark:         cfg.Remark,
		IsPerm:         cfg.IsPerm,
	}
}

func configSliceToPB(configs []model.Config) []*common.ResourceConfig {
	list := make([]*common.ResourceConfig, 0, len(configs))
	for i := range configs {
		list = append(list, modelConfigToPB(&configs[i]))
	}
	return list
}

func assetModelToPB(asset *model.Asset) *common.FileAsset {
	if asset == nil {
		return nil
	}
	return &common.FileAsset{
		FileId:         asset.FileID,
		EnvironmentKey: asset.EnvironmentKey,
		PipelineKey:    asset.PipelineKey,
		FileName:       asset.FileName,
		ContentType:    asset.ContentType,
		FileSize:       asset.FileSize,
		Url:            asset.URL,
		Remark:         asset.Remark,
	}
}

func assetSliceToPB(assets []model.Asset) []*common.FileAsset {
	list := make([]*common.FileAsset, 0, len(assets))
	for i := range assets {
		list = append(list, assetModelToPB(&assets[i]))
	}
	return list
}

// --------------------- Service helpers ---------------------

// MigrateToFullAssetPaths ensures all asset URLs and config contents use the full path with filename.
func (s *Service) MigrateToFullAssetPaths(ctx context.Context) error {
	// 1. Update all assets URL to include filename
	var assets []model.Asset
	if err := s.logic.db.Find(&assets).Error; err != nil {
		return err
	}
	for i := range assets {
		newURL := s.generateFileURL(&assets[i])
		if assets[i].URL != newURL {
			if err := s.logic.db.Model(&assets[i]).Update("url", newURL).Error; err != nil {
				return err
			}
		}
	}

	// 2. Update all image type configs to use full path
	var configs []model.Config
	if err := s.logic.db.Where("type = ?", "image").Find(&configs).Error; err != nil {
		return err
	}

	assetMap := make(map[string]*model.Asset)
	for i := range assets {
		assetMap[assets[i].FileID] = &assets[i]
	}

	for i := range configs {
		content := configs[i].Content
		// Matches /api/v1/asset/file/{uuid} or /api/v1/asset/file/{uuid}/oldname
		re := regexp.MustCompile(`/api/v1/asset/file/([a-zA-Z0-9\-]+)(/[^"'\s]*)?`)
		newContent := re.ReplaceAllStringFunc(content, func(match string) string {
			sub := re.FindStringSubmatch(match)
			if len(sub) < 2 {
				return match
			}
			fileID := sub[1]
			if asset, ok := assetMap[fileID]; ok {
				return s.generateFileURL(asset)
			}
			return match
		})

		if configs[i].Content != newContent {
			if err := s.logic.db.Model(&configs[i]).Update("content", newContent).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

func sanitizeServiceBasePath(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || trimmed == "/" {
		return ""
	}
	if !strings.HasPrefix(trimmed, "/") {
		trimmed = "/" + trimmed
	}
	return strings.TrimSuffix(trimmed, "/")
}

func (s *Service) applyFileURLPrefix(value string) string {
	if s == nil || s.basePath == "" {
		return value
	}
	if strings.HasPrefix(value, fileURLPrefix) {
		return s.basePath + value
	}
	return value
}

func (s *Service) expandConfigContent(content string, typ string) string {
	if s == nil || s.basePath == "" || content == "" {
		return content
	}
	normalizedType := normalizeConfigTypeString(typ)
	// 只有 object 和 keyvalue 类型需要展开嵌套的文件URL
	if normalizedType != "object" && normalizedType != "keyvalue" {
		return s.applyFileURLPrefix(content)
	}
	var payload any
	if err := json.Unmarshal([]byte(content), &payload); err != nil {
		return s.applyFileURLPrefix(content)
	}
	expanded := s.expandNestedValue(payload)
	data, err := json.Marshal(expanded)
	if err != nil {
		return s.applyFileURLPrefix(content)
	}
	return string(data)
}

func (s *Service) expandNestedValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		for key, val := range v {
			v[key] = s.expandNestedValue(val)
		}
		return v
	case []any:
		for i, val := range v {
			v[i] = s.expandNestedValue(val)
		}
		return v
	case string:
		return s.applyFileURLPrefix(v)
	default:
		return value
	}
}

func (s *Service) decorateConfig(cfg *common.ResourceConfig) *common.ResourceConfig {
	if cfg == nil || s == nil || s.basePath == "" {
		return cfg
	}
	cfg.Type = normalizeConfigTypeString(cfg.GetType())
	cfg.Content = s.expandConfigContent(cfg.GetContent(), cfg.Type)
	return cfg
}

func (s *Service) decorateConfigList(list []*common.ResourceConfig) []*common.ResourceConfig {
	if s == nil || s.basePath == "" {
		return list
	}
	for _, cfg := range list {
		s.decorateConfig(cfg)
	}
	return list
}

func (s *Service) decorateAsset(asset *common.FileAsset) *common.FileAsset {
	if asset == nil || s == nil || s.basePath == "" {
		return asset
	}
	asset.Url = s.applyFileURLPrefix(asset.GetUrl())
	return asset
}

func (s *Service) decorateAssetList(list []*common.FileAsset) []*common.FileAsset {
	if s == nil || s.basePath == "" {
		return list
	}
	for _, asset := range list {
		s.decorateAsset(asset)
	}
	return list
}

func ensureUploadDir(fileID string) error {
	relative := filepath.Join(uploadDirectory, fileID)
	return os.MkdirAll(filepath.Join(dataDirectory, relative), 0o755)
}

func detectContentType(provided string, data []byte) string {
	if provided != "" {
		return provided
	}
	return http.DetectContentType(data)
}

func (s *Service) generateFileURL(asset *model.Asset) string {
	if asset == nil {
		return ""
	}
	return fmt.Sprintf("/api/v1/asset/file/%s/%s", asset.FileID, asset.FileName)
}

func normalizeConfigTypeString(t string) string {
	normalized := strings.ToLower(strings.TrimSpace(t))
	switch normalized {
	// 直接支持的类型
	case "text", "textarea", "richtext":
		return normalized
	case "number", "decimal":
		return normalized
	case "boolean":
		return normalized
	case "keyvalue":
		return normalized
	case "object":
		return normalized
	case "color":
		return normalized
	case "file":
		return normalized
	case "image":
		return normalized

	// 兼容旧的中文别名
	case "string", "copy", "文案":
		return "text"
	case "colour", "color_tag", "color-tag", "色彩", "色彩标签":
		return "color"
	case "kv", "key-value", "键值对":
		return "keyvalue"
	case "json", "config":
		return "object"

	// 默认返回原值(直接透传)
	default:
		return t
	}
}
