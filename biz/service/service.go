package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	"github.com/yi-nology/rainbow_bridge/pkg/storage"

	"gorm.io/gorm"
)

const (
	dataDirectory   = "data"
	uploadDirectory = "uploads"
	assetScheme     = "asset://"
	fileURLPrefix   = "/api/v1/asset/file/"
)

var (
	assetRefRegexp        = regexp.MustCompile(`asset://([a-zA-Z0-9\-]+)`)
	fileURLRefRegexp      = regexp.MustCompile(`/api/v1/asset/file/([a-zA-Z0-9\-]+)`)
	staticAssetPathRegexp = regexp.MustCompile(`static/assets/([a-zA-Z0-9\-]+)/[^"'\s]+`)
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
	storage  storage.Storage
	basePath string
}

func NewService(db *gorm.DB, store storage.Storage, basePath string) *Service {
	return &Service{
		logic:    NewLogic(db),
		storage:  store,
		basePath: sanitizeServiceBasePath(basePath),
	}
}

// Storage returns the storage adapter.
func (s *Service) Storage() storage.Storage {
	return s.storage
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
	if normalizeConfigTypeString(typ) != "config" {
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

func (s *Service) decorateRealtimePayload(payload map[string]any) map[string]any {
	if s == nil || s.basePath == "" || payload == nil {
		return payload
	}
	for key, value := range payload {
		payload[key] = s.expandNestedValue(value)
	}
	return payload
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
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "image":
		return "image"
	case "text", "string", "copy", "文案":
		return "text"
	case "color", "colour", "color_tag", "color-tag", "色彩", "色彩标签":
		return "color"
	case "kv", "key-value", "键值对":
		return "kv"

	default:
		return "config"
	}
}

func getString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 64)
	case int, int8, int16, int32, int64:
		return fmt.Sprintf("%d", v)
	case uint, uint8, uint16, uint32, uint64:
		return fmt.Sprintf("%d", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

func getBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		lower := strings.ToLower(strings.TrimSpace(v))
		return lower == "true" || lower == "1"
	case float64:
		return v != 0
	case json.Number:
		f, _ := v.Float64()
		return f != 0
	default:
		return false
	}
}

func formatContentString(value any) string {
	if str, ok := value.(string); ok {
		return str
	}
	return fmt.Sprintf("%v", value)
}
