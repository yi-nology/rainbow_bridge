package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"

	"gorm.io/gorm"
)

const (
	dataDirectory   = "data"
	uploadDirectory = "uploads"
	assetScheme     = "asset://"
	fileURLPrefix   = "/api/v1/files/"
)

var (
	assetRefRegexp        = regexp.MustCompile(`asset://([a-zA-Z0-9\-]+)`)
	fileURLRefRegexp      = regexp.MustCompile(`/api/v1/files/([a-zA-Z0-9\-]+)`)
	staticAssetPathRegexp = regexp.MustCompile(`static/assets/([a-zA-Z0-9\-]+)/[^"'\s]+`)
)

// FileUploadInput captures metadata and payload for asset uploads.
type FileUploadInput struct {
	BusinessKey string
	Remark      string
	FileName    string
	ContentType string
	Data        []byte
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

func pbConfigToModel(cfg *api.ResourceConfig) *model.Config {
	if cfg == nil {
		return &model.Config{}
	}
	return &model.Config{
		ResourceKey: cfg.GetResourceKey(),
		Alias:       cfg.GetAlias(),
		Name:        cfg.GetName(),
		BusinessKey: cfg.GetBusinessKey(),
		Content:     cfg.GetContent(),
		Type:        cfg.GetType(),
		Remark:      cfg.GetRemark(),
		IsPerm:      cfg.GetIsPerm(),
	}
}

func modelConfigToPB(cfg *model.Config) *api.ResourceConfig {
	if cfg == nil {
		return nil
	}
	return &api.ResourceConfig{
		ResourceKey: cfg.ResourceKey,
		Alias:       cfg.Alias,
		Name:        cfg.Name,
		BusinessKey: cfg.BusinessKey,
		Content:     cfg.Content,
		Type:        cfg.Type,
		Remark:      cfg.Remark,
		IsPerm:      cfg.IsPerm,
	}
}

func configSliceToPB(configs []model.Config) []*api.ResourceConfig {
	list := make([]*api.ResourceConfig, 0, len(configs))
	for i := range configs {
		list = append(list, modelConfigToPB(&configs[i]))
	}
	return list
}

func assetModelToPB(asset *model.Asset) *api.FileAsset {
	if asset == nil {
		return nil
	}
	return &api.FileAsset{
		FileId:      asset.FileID,
		BusinessKey: asset.BusinessKey,
		FileName:    asset.FileName,
		ContentType: asset.ContentType,
		FileSize:    asset.FileSize,
		Url:         asset.URL,
		Remark:      asset.Remark,
	}
}

func assetSliceToPB(assets []model.Asset) []*api.FileAsset {
	list := make([]*api.FileAsset, 0, len(assets))
	for i := range assets {
		list = append(list, assetModelToPB(&assets[i]))
	}
	return list
}

// --------------------- Service helpers ---------------------

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

func (s *Service) decorateConfig(cfg *api.ResourceConfig) *api.ResourceConfig {
	if cfg == nil || s == nil || s.basePath == "" {
		return cfg
	}
	cfg.Type = normalizeConfigTypeString(cfg.GetType())
	cfg.Content = s.expandConfigContent(cfg.GetContent(), cfg.Type)
	return cfg
}

func (s *Service) decorateConfigList(list []*api.ResourceConfig) []*api.ResourceConfig {
	if s == nil || s.basePath == "" {
		return list
	}
	for _, cfg := range list {
		s.decorateConfig(cfg)
	}
	return list
}

func (s *Service) decorateAsset(asset *api.FileAsset) *api.FileAsset {
	if asset == nil || s == nil || s.basePath == "" {
		return asset
	}
	asset.Url = s.applyFileURLPrefix(asset.GetUrl())
	return asset
}

func (s *Service) decorateAssetList(list []*api.FileAsset) []*api.FileAsset {
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

func generateFileURL(fileID string) string {
	return fmt.Sprintf("/api/v1/files/%s", fileID)
}

func normalizeConfigTypeString(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "image":
		return "image"
	case "text", "string", "copy", "文案":
		return "text"
	case "color", "colour", "color_tag", "color-tag", "色彩", "色彩标签":
		return "color"
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
