package resource

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	resourcepb "github.com/yi-nology/rainbow_bridge/biz/model/api/resourcepb"
	resourcemodel "github.com/yi-nology/rainbow_bridge/biz/model/resource"
	"github.com/yi-nology/rainbow_bridge/pkg/common"

	"gorm.io/gorm"
)

const (
	dataDirectory   = "data"
	uploadDirectory = "uploads"
	assetScheme     = "asset://"
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
	logic *Logic
}

func NewService(db *gorm.DB) *Service {
	return &Service{logic: NewLogic(db)}
}

// --------------------- Config operations ---------------------

func (s *Service) AddConfig(ctx context.Context, req *resourcepb.CreateOrUpdateConfigRequest) (*resourcepb.ResourceConfig, error) {
	if req == nil || req.Config == nil {
		return nil, errors.New("config payload required")
	}
	model := pbConfigToModel(req.Config)
	if err := s.logic.AddConfig(ctx, model); err != nil {
		return nil, err
	}
	return modelConfigToPB(model), nil
}

func (s *Service) UpdateConfig(ctx context.Context, req *resourcepb.CreateOrUpdateConfigRequest) (*resourcepb.ResourceConfig, error) {
	if req == nil || req.Config == nil {
		return nil, errors.New("config payload required")
	}
	model := pbConfigToModel(req.Config)
	if err := s.logic.UpdateConfig(ctx, model); err != nil {
		return nil, err
	}
	updated, err := s.logic.GetConfig(ctx, model.BusinessKey, model.ResourceKey)
	if err != nil {
		return nil, err
	}
	return modelConfigToPB(updated), nil
}

func (s *Service) DeleteConfig(ctx context.Context, req *resourcepb.ResourceDeleteRequest) error {
	if req == nil {
		return errors.New("request required")
	}
	return s.logic.DeleteConfig(ctx, req.GetBusinessKey(), req.GetResourceKey())
}

func (s *Service) ListConfigs(ctx context.Context, req *resourcepb.ResourceQueryRequest) ([]*resourcepb.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	configs, err := s.logic.ListConfigs(ctx, req.GetBusinessKey(), req.GetMinVersion(), req.GetMaxVersion(), req.GetType(), req.GetIsLatest())
	if err != nil {
		return nil, err
	}
	return configSliceToPB(configs), nil
}

func (s *Service) GetConfigDetail(ctx context.Context, req *resourcepb.ResourceDetailRequest) (*resourcepb.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	cfg, err := s.logic.GetConfig(ctx, req.GetBusinessKey(), req.GetResourceKey())
	if err != nil {
		return nil, err
	}
	return modelConfigToPB(cfg), nil
}

func (s *Service) ListSystemConfigs(ctx context.Context) (map[string]string, string, error) {
	data, err := s.logic.ListSystemConfigs(ctx)
	if err != nil {
		return nil, "", err
	}
	result := make(map[string]string, len(data))
	keys := make([]string, 0, len(data))
	for alias, content := range data {
		if str, ok := content.(string); ok {
			result[alias] = str
			keys = append(keys, alias)
		}
	}
	sort.Strings(keys)
	var builder strings.Builder
	for _, key := range keys {
		builder.WriteString(key)
		builder.WriteString(":")
		builder.WriteString(result[key])
		builder.WriteString(";")
	}
	return result, common.GetMD5Hash(builder.String()), nil
}

// GetRealtimeStaticConfig returns a config payload shaped like static/config.json
// containing the latest system configs and the configs of the business selected
// via system.business_select.
func (s *Service) GetRealtimeStaticConfig(ctx context.Context) (map[string]any, error) {
	systemConfigs, err := s.logic.ExportConfigs(ctx, "system", false)
	if err != nil {
		return nil, err
	}

	selectedKey := extractBusinessSelectKey(systemConfigs)
	trimmedSelected := strings.TrimSpace(selectedKey)

	configs := make([]resourcemodel.Config, 0, len(systemConfigs)+4)
	configs = append(configs, systemConfigs...)

	targetKeys := []string{"system"}
	if trimmedSelected != "" && trimmedSelected != "system" {
		businessConfigs, err := s.logic.ExportConfigs(ctx, trimmedSelected, false)
		if err != nil {
			return nil, err
		}
		configs = append(configs, businessConfigs...)
		targetKeys = append(targetKeys, trimmedSelected)
	}

	targetKeys = sanitizeBusinessKeys(targetKeys)

	payload := buildStaticPayload(staticPayloadInput{
		Configs:       configs,
		BusinessKeys:  targetKeys,
		IncludeSystem: true,
		Replacements:  nil,
	})

	if val, ok := payload["business_select"].(string); !ok || strings.TrimSpace(val) == "" {
		payload["business_select"] = trimmedSelected
	}
	if _, ok := payload["business_keys"]; !ok {
		payload["business_keys"] = targetKeys
	}

	return payload, nil
}

func extractBusinessSelectKey(configs []resourcemodel.Config) string {
	for _, cfg := range configs {
		if !strings.EqualFold(strings.TrimSpace(cfg.Alias), "business_select") {
			continue
		}
		content := strings.TrimSpace(cfg.Content)
		if content == "" {
			continue
		}
		if strings.HasPrefix(content, "{") {
			var parsed map[string]any
			if err := json.Unmarshal([]byte(content), &parsed); err == nil {
				candidates := []string{"business_key", "businessKey", "selected", "key"}
				for _, key := range candidates {
					if value, ok := parsed[key]; ok {
						str := strings.TrimSpace(formatContentString(value))
						if str != "" {
							return str
						}
					}
				}
			}
		}
		return strings.Trim(content, "\"")
	}
	return ""
}

func (s *Service) ExportConfigs(ctx context.Context, req *resourcepb.ResourceExportRequest) ([]*resourcepb.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	return s.ExportConfigsBatch(ctx, []string{req.GetBusinessKey()}, req.GetIncludeSystem())
}

func (s *Service) ImportConfigs(ctx context.Context, req *resourcepb.ResourceImportRequest) error {
	if req == nil {
		return errors.New("request required")
	}
	configs := make([]resourcemodel.Config, 0, len(req.Configs))
	for _, cfg := range req.Configs {
		configs = append(configs, *pbConfigToModel(cfg))
	}
	return s.logic.ImportConfigs(ctx, configs, req.GetOverwrite())
}

func (s *Service) ListBusinessKeys(ctx context.Context) ([]string, error) {
	return s.logic.ListBusinessKeys(ctx)
}

// --------------------- Asset operations ---------------------

func (s *Service) ListAssets(ctx context.Context, businessKey string) ([]*resourcepb.FileAsset, error) {
	key := strings.TrimSpace(businessKey)
	if key == "" {
		return nil, errors.New("business_key is required")
	}
	assets, err := s.logic.ListAssetsByBusinessKey(ctx, key)
	if err != nil {
		return nil, err
	}
	return assetSliceToPB(assets), nil
}

func sanitizeBusinessKeys(keys []string) []string {
	seen := make(map[string]struct{}, len(keys))
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result
}

func sanitizeFileComponent(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "configs"
	}
	name = strings.ReplaceAll(name, " ", "_")
	re := regexp.MustCompile(`[^a-zA-Z0-9\-_]+`)
	name = re.ReplaceAllString(name, "_")
	if name == "" {
		return "configs"
	}
	return name
}

func bundleBaseName(keys []string) string {
	if len(keys) == 0 {
		return "configs"
	}
	if len(keys) == 1 {
		return sanitizeFileComponent(keys[0])
	}
	return fmt.Sprintf("%s_and_%d_more", sanitizeFileComponent(keys[0]), len(keys)-1)
}

func (s *Service) collectExportConfigs(ctx context.Context, businessKeys []string, includeSystem bool) ([]resourcemodel.Config, []string, error) {
	keys := sanitizeBusinessKeys(businessKeys)
	result := make([]resourcemodel.Config, 0)
	systemPending := includeSystem
	systemIncluded := false

	for _, key := range keys {
		if key == "system" {
			if systemIncluded {
				continue
			}
			configs, err := s.logic.ExportConfigs(ctx, "system", false)
			if err != nil {
				return nil, nil, err
			}
			result = append(result, configs...)
			systemIncluded = true
			systemPending = false
			continue
		}

		include := false
		if systemPending {
			include = true
			systemPending = false
		}
		configs, err := s.logic.ExportConfigs(ctx, key, include)
		if err != nil {
			return nil, nil, err
		}
		if include {
			systemIncluded = true
		}
		result = append(result, configs...)
	}

	if systemPending && !systemIncluded {
		configs, err := s.logic.ExportConfigs(ctx, "system", false)
		if err != nil {
			return nil, nil, err
		}
		if len(configs) > 0 {
			keys = append(keys, "system")
		}
		result = append(result, configs...)
		systemIncluded = true
	}

	return result, keys, nil
}

func (s *Service) ExportConfigsBatch(ctx context.Context, businessKeys []string, includeSystem bool) ([]*resourcepb.ResourceConfig, error) {
	configs, _, err := s.collectExportConfigs(ctx, businessKeys, includeSystem)
	if err != nil {
		return nil, err
	}
	return configSliceToPB(configs), nil
}

func (s *Service) UploadAsset(ctx context.Context, input *FileUploadInput) (*resourcepb.FileAsset, string, error) {
	if input == nil {
		return nil, "", errors.New("input required")
	}
	if len(input.Data) == 0 {
		return nil, "", errors.New("file data is empty")
	}
	if input.BusinessKey == "" {
		return nil, "", errors.New("business_key is required")
	}

	fileID := uuid.NewString()
	fileName := input.FileName
	if fileName == "" {
		fileName = fileID
	}

	if err := ensureUploadDir(fileID); err != nil {
		return nil, "", err
	}

	relativePath := filepath.Join(uploadDirectory, fileID, fileName)
	fullPath := filepath.Join(dataDirectory, relativePath)
	if err := os.WriteFile(fullPath, input.Data, 0o644); err != nil {
		return nil, "", err
	}

	asset := &resourcemodel.Asset{
		FileID:      fileID,
		BusinessKey: input.BusinessKey,
		FileName:    fileName,
		ContentType: detectContentType(input.ContentType, input.Data),
		FileSize:    int64(len(input.Data)),
		Path:        relativePath,
		URL:         generateFileURL(fileID),
		Remark:      input.Remark,
	}
	if err := s.logic.CreateAsset(ctx, asset); err != nil {
		_ = os.Remove(fullPath)
		return nil, "", err
	}

	reference := fmt.Sprintf("%s%s", assetScheme, fileID)
	return assetModelToPB(asset), reference, nil
}

func (s *Service) GetAssetFile(ctx context.Context, fileID string) (*resourcemodel.Asset, string, error) {
	if fileID == "" {
		return nil, "", ErrAssetNotFound
	}
	asset, err := s.logic.GetAsset(ctx, fileID)
	if err != nil {
		return nil, "", err
	}
	fullPath := filepath.Join(dataDirectory, asset.Path)
	if _, err := os.Stat(fullPath); err != nil {
		return nil, "", err
	}
	return asset, fullPath, nil
}

// ExportConfigsArchive exports configs and referenced assets into a zip archive.
func (s *Service) ExportConfigsArchive(ctx context.Context, req *resourcepb.ResourceExportRequest) ([]byte, string, error) {
	if req == nil {
		return nil, "", errors.New("request required")
	}
	return s.ExportConfigsArchiveBatch(ctx, []string{req.GetBusinessKey()}, req.GetIncludeSystem())
}

// ExportConfigsArchiveBatch exports multiple businesses into a single archive.
func (s *Service) ExportConfigsArchiveBatch(ctx context.Context, businessKeys []string, includeSystem bool) ([]byte, string, error) {
	configs, keys, err := s.collectExportConfigs(ctx, businessKeys, includeSystem)
	if err != nil {
		return nil, "", err
	}
	data, err := s.writeConfigArchive(ctx, configs)
	if err != nil {
		return nil, "", err
	}
	name := bundleBaseName(keys)
	return data, fmt.Sprintf("%s_archive.zip", name), nil
}

// ExportStaticBundle exports configs and assets into a static-friendly zip bundle.
func (s *Service) ExportStaticBundle(ctx context.Context, req *resourcepb.ResourceExportRequest) ([]byte, string, error) {
	if req == nil {
		return nil, "", errors.New("request required")
	}
	return s.ExportStaticBundleBatch(ctx, []string{req.GetBusinessKey()}, req.GetIncludeSystem())
}

// ExportStaticBundleBatch exports multiple businesses into a single static bundle.
func (s *Service) ExportStaticBundleBatch(ctx context.Context, businessKeys []string, includeSystem bool) ([]byte, string, error) {
	configs, keys, err := s.collectExportConfigs(ctx, businessKeys, includeSystem)
	if err != nil {
		return nil, "", err
	}
	data, err := s.writeStaticBundle(ctx, configs, keys, includeSystem)
	if err != nil {
		return nil, "", err
	}
	name := bundleBaseName(keys)
	return data, fmt.Sprintf("%s_static_bundle.zip", name), nil
}

func (s *Service) writeConfigArchive(ctx context.Context, configs []resourcemodel.Config) ([]byte, error) {
	buf := &bytes.Buffer{}
	zipWriter := zip.NewWriter(buf)

	configData, err := json.MarshalIndent(configSliceToPB(configs), "", "  ")
	if err != nil {
		return nil, err
	}
	metaWriter, err := zipWriter.Create("configs.json")
	if err != nil {
		return nil, err
	}
	if _, err := metaWriter.Write(configData); err != nil {
		return nil, err
	}

	assetIDs := extractAssetIDs(configs)
	visited := make(map[string]struct{}, len(assetIDs))
	for _, assetID := range assetIDs {
		if _, ok := visited[assetID]; ok {
			continue
		}
		visited[assetID] = struct{}{}
		asset, err := s.logic.GetAsset(ctx, assetID)
		if err != nil {
			return nil, err
		}
		fullPath := filepath.Join(dataDirectory, asset.Path)
		file, err := os.Open(fullPath)
		if err != nil {
			return nil, err
		}
		zipPath := filepath.Join("files", asset.FileID, asset.FileName)
		writer, err := zipWriter.CreateHeader(&zip.FileHeader{Name: zipPath, Method: zip.Deflate})
		if err != nil {
			file.Close()
			return nil, err
		}
		if _, err := io.Copy(writer, file); err != nil {
			file.Close()
			return nil, err
		}
		file.Close()
	}

	if err := zipWriter.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func (s *Service) writeStaticBundle(ctx context.Context, configs []resourcemodel.Config, businessKeys []string, includeSystem bool) ([]byte, error) {
	buf := &bytes.Buffer{}
	zipWriter := zip.NewWriter(buf)

	assetIDs := extractAssetIDs(configs)
	replacements := make(map[string]string, len(assetIDs))

	for _, assetID := range assetIDs {
		if _, ok := replacements[assetID]; ok {
			continue
		}
		asset, err := s.logic.GetAsset(ctx, assetID)
		if err != nil {
			return nil, err
		}
		staticPath := filepath.ToSlash(filepath.Join("static", "assets", asset.FileID, asset.FileName))
		replacements[assetID] = staticPath

		fullPath := filepath.Join(dataDirectory, asset.Path)
		file, err := os.Open(fullPath)
		if err != nil {
			return nil, err
		}
		writer, err := zipWriter.CreateHeader(&zip.FileHeader{Name: staticPath, Method: zip.Deflate})
		if err != nil {
			file.Close()
			return nil, err
		}
		if _, err := io.Copy(writer, file); err != nil {
			file.Close()
			return nil, err
		}
		file.Close()
	}

	payload := buildStaticPayload(staticPayloadInput{
		Configs:       configs,
		BusinessKeys:  businessKeys,
		IncludeSystem: includeSystem,
		Replacements:  replacements,
	})

	configPayload, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, err
	}
	configWriter, err := zipWriter.Create("static/config.json")
	if err != nil {
		return nil, err
	}
	if _, err := configWriter.Write(configPayload); err != nil {
		return nil, err
	}

	if err := zipWriter.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

type staticPayloadInput struct {
	Configs       []resourcemodel.Config
	BusinessKeys  []string
	IncludeSystem bool
	Replacements  map[string]string
}

func buildStaticPayload(input staticPayloadInput) map[string]any {
	grouped := make(map[string]map[string]any)
	businessSelect := ""

	for _, cfg := range input.Configs {
		businessKey := strings.TrimSpace(cfg.BusinessKey)
		if businessKey == "" {
			businessKey = "system"
		}
		content := cfg.Content
		for assetID, staticPath := range input.Replacements {
			content = strings.ReplaceAll(content, fmt.Sprintf("%s%s", assetScheme, assetID), staticPath)
			content = strings.ReplaceAll(content, fmt.Sprintf("/api/v1/files/%s", assetID), staticPath)
		}

		if _, ok := grouped[businessKey]; !ok {
			grouped[businessKey] = make(map[string]any)
		}

		alias := strings.TrimSpace(cfg.Alias)
		key := alias
		if key == "" {
			key = strings.TrimSpace(cfg.Name)
		}
		if key == "" {
			key = cfg.ResourceKey
		}
		if key == "" {
			key = fmt.Sprintf("config_%d", len(grouped[businessKey])+1)
		}
		entry := map[string]any{
			"resource_key": cfg.ResourceKey,
			"name":         cfg.Name,
			"type":         normalizeConfigTypeString(cfg.Type),
			"remark":       cfg.Remark,
			"is_perm":      cfg.IsPerm,
		}

		if strings.EqualFold(strings.TrimSpace(cfg.Type), "config") {
			var parsed any
			if err := json.Unmarshal([]byte(content), &parsed); err == nil {
				entry["content"] = parsed
			} else {
				entry["content"] = content
			}
		} else {
			entry["content"] = content
		}

		grouped[businessKey][key] = entry

		if businessKey == "system" && alias == "business_select" {
			if str, ok := entry["content"].(string); ok {
				businessSelect = str
			}
		}
	}

	payload := map[string]any{
		"business_keys":   input.BusinessKeys,
		"include_system":  input.IncludeSystem,
		"business_select": businessSelect,
	}

	systemData, ok := grouped["system"]
	if !ok {
		systemData = make(map[string]any)
	}
	payload["system"] = systemData

	for _, key := range input.BusinessKeys {
		if key == "system" {
			continue
		}
		businessData, ok := grouped[key]
		if !ok {
			businessData = make(map[string]any)
		}
		payload[key] = businessData
	}

	for key, data := range grouped {
		if key == "system" || containsString(input.BusinessKeys, key) {
			continue
		}
		payload[key] = data
	}

	return payload
}

func (s *Service) ImportConfigsArchive(ctx context.Context, data []byte, overwrite bool) ([]*resourcepb.ResourceConfig, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}

	var configs []*resourcepb.ResourceConfig
	assetFiles := make(map[string]*zip.File)

	for _, f := range reader.File {
		cleanName := filepath.Clean(f.Name)
		if cleanName == "configs.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			payload, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return nil, err
			}
			if err := json.Unmarshal(payload, &configs); err != nil {
				return nil, err
			}
			continue
		}
		if cleanName == "static/config.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			payload, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return nil, err
			}
			staticConfigs, err := parseStaticBundle(payload)
			if err != nil {
				return nil, err
			}
			configs = staticConfigs
			continue
		}
		if strings.HasPrefix(cleanName, "files/") || strings.HasPrefix(cleanName, "static/assets/") {
			assetFiles[cleanName] = f
		}
	}

	if configs == nil {
		return nil, errors.New("config content not found in archive")
	}

	// Import configs
	configModels := make([]resourcemodel.Config, 0, len(configs))
	assetBusiness := make(map[string]string)
	for _, cfg := range configs {
		configModels = append(configModels, *pbConfigToModel(cfg))
		matches := assetRefRegexp.FindAllStringSubmatch(cfg.GetContent(), -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			businessKey := strings.TrimSpace(cfg.GetBusinessKey())
			if businessKey == "" {
				continue
			}
			if _, ok := assetBusiness[match[1]]; !ok {
				assetBusiness[match[1]] = businessKey
			}
		}
		staticMatches := staticAssetPathRegexp.FindAllStringSubmatch(cfg.GetContent(), -1)
		for _, match := range staticMatches {
			if len(match) < 2 {
				continue
			}
			businessKey := strings.TrimSpace(cfg.GetBusinessKey())
			if businessKey == "" {
				continue
			}
			if _, ok := assetBusiness[match[1]]; !ok {
				assetBusiness[match[1]] = businessKey
			}
		}
	}
	if err := s.logic.ImportConfigs(ctx, configModels, overwrite); err != nil {
		return nil, err
	}

	// Restore assets present in archive
	for path, f := range assetFiles {
		fileID := filepath.Base(filepath.Dir(path))
		fileName := filepath.Base(path)
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}

		if err := ensureUploadDir(fileID); err != nil {
			return nil, err
		}
		relativePath := filepath.Join(uploadDirectory, fileID, fileName)
		fullPath := filepath.Join(dataDirectory, relativePath)
		if err := os.WriteFile(fullPath, data, 0o644); err != nil {
			return nil, err
		}
		asset := &resourcemodel.Asset{
			FileID:      fileID,
			FileName:    fileName,
			FileSize:    int64(len(data)),
			ContentType: http.DetectContentType(data),
			Path:        relativePath,
			URL:         generateFileURL(fileID),
		}
		asset.BusinessKey = inferAssetBusinessKey(fileID, assetBusiness, configModels)
		if err := s.logic.UpdateAsset(ctx, asset); err != nil {
			if !errors.Is(err, ErrAssetNotFound) {
				return nil, err
			}
			if err := s.logic.CreateAsset(ctx, asset); err != nil {
				return nil, err
			}
		}
	}

	return configs, nil
}

// --------------------- Helpers ---------------------

func pbConfigToModel(cfg *resourcepb.ResourceConfig) *resourcemodel.Config {
	if cfg == nil {
		return &resourcemodel.Config{}
	}
	return &resourcemodel.Config{
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

func modelConfigToPB(cfg *resourcemodel.Config) *resourcepb.ResourceConfig {
	if cfg == nil {
		return nil
	}
	return &resourcepb.ResourceConfig{
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

func configSliceToPB(configs []resourcemodel.Config) []*resourcepb.ResourceConfig {
	list := make([]*resourcepb.ResourceConfig, 0, len(configs))
	for i := range configs {
		list = append(list, modelConfigToPB(&configs[i]))
	}
	return list
}

func assetModelToPB(asset *resourcemodel.Asset) *resourcepb.FileAsset {
	if asset == nil {
		return nil
	}
	return &resourcepb.FileAsset{
		FileId:      asset.FileID,
		BusinessKey: asset.BusinessKey,
		FileName:    asset.FileName,
		ContentType: asset.ContentType,
		FileSize:    asset.FileSize,
		Url:         asset.URL,
		Remark:      asset.Remark,
	}
}

func assetSliceToPB(assets []resourcemodel.Asset) []*resourcepb.FileAsset {
	list := make([]*resourcepb.FileAsset, 0, len(assets))
	for i := range assets {
		list = append(list, assetModelToPB(&assets[i]))
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

func generateFileURL(fileID string) string {
	return fmt.Sprintf("/api/v1/files/%s", fileID)
}

func extractAssetIDs(configs []resourcemodel.Config) []string {
	ids := make([]string, 0)
	seen := make(map[string]struct{})
	for _, cfg := range configs {
		extract := func(content string) {
			for _, rx := range []*regexp.Regexp{assetRefRegexp, fileURLRefRegexp, staticAssetPathRegexp} {
				matches := rx.FindAllStringSubmatch(content, -1)
				for _, match := range matches {
					if len(match) < 2 {
						continue
					}
					id := match[1]
					if _, ok := seen[id]; ok {
						continue
					}
					seen[id] = struct{}{}
					ids = append(ids, id)
				}
			}
		}
		extract(cfg.Content)
	}
	return ids
}

func inferAssetBusinessKey(fileID string, explicit map[string]string, configs []resourcemodel.Config) string {
	if key := strings.TrimSpace(explicit[fileID]); key != "" {
		return key
	}
	reference := fmt.Sprintf("%s%s", assetScheme, fileID)
	fileReference := fmt.Sprintf("/api/v1/files/%s", fileID)
	staticReference := fmt.Sprintf("static/assets/%s", fileID)
	for _, cfg := range configs {
		content := cfg.Content
		if strings.Contains(content, reference) || strings.Contains(content, fileReference) || strings.Contains(content, staticReference) {
			if bk := strings.TrimSpace(cfg.BusinessKey); bk != "" {
				return bk
			}
		}
	}
	if len(configs) == 1 {
		if bk := strings.TrimSpace(configs[0].BusinessKey); bk != "" {
			return bk
		}
	}
	return ""
}

func containsString(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}

func normalizeConfigTypeString(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "image":
		return "image"
	case "text", "string", "copy", "文案":
		return "text"
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

func formatContentForType(content any, typ string) string {
	normalized := normalizeConfigTypeString(typ)
	if normalized == "config" {
		switch v := content.(type) {
		case string:
			return restoreStaticContent(v)
		default:
			bytes, err := json.Marshal(v)
			if err != nil {
				return restoreStaticContent(formatContentString(v))
			}
			return restoreStaticContent(string(bytes))
		}
	}
	return restoreStaticContent(formatContentString(content))
}

func parseStaticBundle(payload []byte) ([]*resourcepb.ResourceConfig, error) {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, err
	}

	if legacy, ok := raw["configs"]; ok {
		return parseLegacyStaticBundle(raw, legacy)
	}

	configs := make([]*resourcepb.ResourceConfig, 0)
	for key, value := range raw {
		switch key {
		case "business_select", "business_keys", "include_system":
			continue
		default:
		}
		businessKey := key
		if strings.TrimSpace(businessKey) == "" {
			businessKey = "system"
		}
		entries, ok := value.(map[string]any)
		if !ok {
			continue
		}
		for alias, entryVal := range entries {
			cfg := convertStaticEntry(alias, businessKey, entryVal)
			configs = append(configs, cfg)
		}
	}

	return configs, nil
}

type legacyStaticConfig struct {
	ResourceKey string `json:"resource_key"`
	BusinessKey string `json:"business_key"`
	Alias       string `json:"alias"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Content     string `json:"content"`
	Remark      string `json:"remark"`
	IsPerm      bool   `json:"is_perm"`
}

func parseLegacyStaticBundle(raw map[string]any, legacy any) ([]*resourcepb.ResourceConfig, error) {
	data, err := json.Marshal(legacy)
	if err != nil {
		return nil, err
	}
	var configsRaw []legacyStaticConfig
	if err := json.Unmarshal(data, &configsRaw); err != nil {
		return nil, err
	}
	defaultKey := ""
	if v, ok := raw["business_key"].(string); ok {
		defaultKey = strings.TrimSpace(v)
	}
	if defaultKey == "" {
		if arr, ok := raw["business_keys"].([]any); ok && len(arr) == 1 {
			if str, ok := arr[0].(string); ok {
				defaultKey = strings.TrimSpace(str)
			}
		}
	}
	result := make([]*resourcepb.ResourceConfig, 0, len(configsRaw))
	for _, item := range configsRaw {
		businessKey := strings.TrimSpace(item.BusinessKey)
		if businessKey == "" {
			businessKey = defaultKey
		}
		cfg := &resourcepb.ResourceConfig{
			ResourceKey: item.ResourceKey,
			BusinessKey: businessKey,
			Alias:       item.Alias,
			Name:        item.Name,
			Type:        normalizeConfigTypeString(item.Type),
			Remark:      item.Remark,
			IsPerm:      item.IsPerm,
		}
		cfg.Content = restoreStaticContent(item.Content)
		result = append(result, cfg)
	}
	return result, nil
}

func convertStaticEntry(alias, businessKey string, entryVal any) *resourcepb.ResourceConfig {
	cfg := &resourcepb.ResourceConfig{
		Alias:       alias,
		BusinessKey: businessKey,
		Type:        "config",
	}

	entryMap, ok := entryVal.(map[string]any)
	if !ok {
		cfg.Type = "text"
		cfg.Content = restoreStaticContent(formatContentString(entryVal))
		return cfg
	}

	cfg.ResourceKey = getString(entryMap["resource_key"])
	cfg.Name = getString(entryMap["name"])
	cfg.Type = normalizeConfigTypeString(getString(entryMap["type"]))
	cfg.Remark = getString(entryMap["remark"])
	cfg.IsPerm = getBool(entryMap["is_perm"])

	content := entryMap["content"]
	cfg.Content = formatContentForType(content, cfg.Type)
	return cfg
}

func restoreStaticContent(content string) string {
	if content == "" {
		return ""
	}
	return staticAssetPathRegexp.ReplaceAllStringFunc(content, func(match string) string {
		sub := staticAssetPathRegexp.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}
		return fmt.Sprintf("%s%s", assetScheme, sub[1])
	})
}
