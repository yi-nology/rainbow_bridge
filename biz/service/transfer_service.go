package service

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
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"
)

// --------------------- Export/Import operations ---------------------

func (s *Service) ExportConfigs(ctx context.Context, req *api.ResourceExportRequest) ([]*api.ResourceConfig, error) {
	if req == nil {
		return nil, errors.New("request required")
	}
	configs, err := s.logic.ExportConfigs(ctx, req.GetEnvironmentKey(), req.GetPipelineKey())
	if err != nil {
		return nil, err
	}
	return s.decorateConfigList(configSliceToPB(configs)), nil
}

func (s *Service) ImportConfigs(ctx context.Context, req *api.ResourceImportRequest) error {
	if req == nil {
		return errors.New("request required")
	}
	configs := make([]model.Config, 0, len(req.Configs))
	for _, cfg := range req.Configs {
		configs = append(configs, *pbConfigToModel(cfg))
	}
	return s.logic.ImportConfigs(ctx, configs, req.GetOverwrite())
}

// TODO: Deprecated - These batch export methods need to be refactored for environment_key + pipeline_key architecture
// collectExportConfigs, ExportConfigsBatch, ExportConfigsArchiveBatch, ExportStaticBundleBatch,
// ExportSystemSelectedStaticBundle, ExportStaticBundleAll are temporarily disabled

func (s *Service) collectExportConfigs(ctx context.Context, environmentKeys, pipelineKeys []string) ([]model.Config, error) {
	// TODO: Implement new batch export logic
	return nil, errors.New("batch export not yet implemented for environment+pipeline architecture")
}

func (s *Service) ExportConfigsBatch(ctx context.Context, environmentKeys, pipelineKeys []string) ([]*api.ResourceConfig, error) {
	return nil, errors.New("batch export not yet implemented")
}

func (s *Service) ExportConfigsArchiveBatch(ctx context.Context, environmentKeys, pipelineKeys []string) ([]byte, string, error) {
	return nil, "", errors.New("batch archive export not yet implemented")
}

func (s *Service) ExportStaticBundleBatch(ctx context.Context, environmentKeys, pipelineKeys []string) ([]byte, string, error) {
	return nil, "", errors.New("batch static bundle export not yet implemented")
}

func (s *Service) ExportSystemSelectedStaticBundle(ctx context.Context) ([]byte, string, error) {
	return nil, "", errors.New("system selected bundle export not yet implemented")
}

func (s *Service) ExportStaticBundleAll(ctx context.Context) ([]byte, string, error) {
	// Get all environments
	environments, err := s.logic.ListEnvironments(ctx)
	if err != nil {
		return nil, "", err
	}

	// Collect all configs from all environment+pipeline combinations
	allConfigs := make([]model.Config, 0)
	businessKeys := make([]string, 0)

	for _, env := range environments {
		// Get pipelines for this environment
		pipelines, err := s.ListPipelines(ctx, env.EnvironmentKey, nil)
		if err != nil {
			continue // Skip this environment if error
		}
		for _, pipe := range pipelines {
			configs, err := s.logic.ExportConfigs(ctx, env.EnvironmentKey, pipe.PipelineKey)
			if err != nil {
				continue // Skip if error
			}
			allConfigs = append(allConfigs, configs...)
			businessKeys = append(businessKeys, fmt.Sprintf("%s/%s", env.EnvironmentKey, pipe.PipelineKey))
		}
	}

	if len(allConfigs) == 0 {
		return nil, "", errors.New("no configs found")
	}

	data, err := s.writeStaticBundle(ctx, allConfigs, businessKeys, true)
	if err != nil {
		return nil, "", err
	}

	name := "all_static_bundle.zip"
	return data, name, nil
}

func (s *Service) ExportConfigsArchive(ctx context.Context, req *api.ResourceExportRequest) ([]byte, string, error) {
	if req == nil {
		return nil, "", errors.New("request required")
	}
	configs, err := s.logic.ExportConfigs(ctx, req.GetEnvironmentKey(), req.GetPipelineKey())
	if err != nil {
		return nil, "", err
	}
	data, err := s.writeConfigArchive(ctx, configs)
	if err != nil {
		return nil, "", err
	}
	name := fmt.Sprintf("%s_%s_archive.zip", req.GetEnvironmentKey(), req.GetPipelineKey())
	return data, name, nil
}

func (s *Service) ExportStaticBundle(ctx context.Context, req *api.ResourceExportRequest) ([]byte, string, error) {
	if req == nil {
		return nil, "", errors.New("request required")
	}
	configs, err := s.logic.ExportConfigs(ctx, req.GetEnvironmentKey(), req.GetPipelineKey())
	if err != nil {
		return nil, "", err
	}

	// Build business keys for this environment+pipeline combination
	businessKeys := []string{
		fmt.Sprintf("%s/%s", req.GetEnvironmentKey(), req.GetPipelineKey()),
	}

	data, err := s.writeStaticBundle(ctx, configs, businessKeys, false)
	if err != nil {
		return nil, "", err
	}

	name := fmt.Sprintf("%s_%s_static_bundle.zip", req.GetEnvironmentKey(), req.GetPipelineKey())
	return data, name, nil
}

func (s *Service) writeConfigArchive(ctx context.Context, configs []model.Config) ([]byte, error) {
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

func (s *Service) writeStaticBundle(ctx context.Context, configs []model.Config, businessKeys []string, includeSystem bool) ([]byte, error) {
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
	Configs       []model.Config
	BusinessKeys  []string
	IncludeSystem bool
	Replacements  map[string]string
}

func buildStaticPayload(input staticPayloadInput) map[string]any {
	grouped := make(map[string]map[string]any)
	businessSelect := ""

	for _, cfg := range input.Configs {
		envKey := strings.TrimSpace(cfg.EnvironmentKey)
		pipeKey := strings.TrimSpace(cfg.PipelineKey)
		if envKey == "" {
			envKey = "default"
		}
		if pipeKey == "" {
			pipeKey = "default"
		}
		content := cfg.Content
		for assetID, staticPath := range input.Replacements {
			content = strings.ReplaceAll(content, fmt.Sprintf("%s%s", assetScheme, assetID), staticPath)
			content = strings.ReplaceAll(content, fmt.Sprintf("/api/v1/files/%s", assetID), staticPath)
		}

		groupKey := envKey + "/" + pipeKey
		if _, ok := grouped[groupKey]; !ok {
			grouped[groupKey] = make(map[string]any)
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
			key = fmt.Sprintf("config_%d", len(grouped[groupKey])+1)
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

		grouped[groupKey][key] = entry
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

func (s *Service) ImportConfigsArchive(ctx context.Context, data []byte, overwrite bool) ([]*api.ResourceConfig, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}

	var configs []*api.ResourceConfig
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
	configModels := make([]model.Config, 0, len(configs))
	assetBusiness := make(map[string]string)
	for _, cfg := range configs {
		configModels = append(configModels, *pbConfigToModel(cfg))
		matches := assetRefRegexp.FindAllStringSubmatch(cfg.GetContent(), -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			envKey := strings.TrimSpace(cfg.GetEnvironmentKey())
			pipeKey := strings.TrimSpace(cfg.GetPipelineKey())
			if envKey == "" || pipeKey == "" {
				continue
			}
			if _, ok := assetBusiness[match[1]]; !ok {
				assetBusiness[match[1]] = envKey + "/" + pipeKey
			}
		}
		staticMatches := staticAssetPathRegexp.FindAllStringSubmatch(cfg.GetContent(), -1)
		for _, match := range staticMatches {
			if len(match) < 2 {
				continue
			}
			envKey := strings.TrimSpace(cfg.GetEnvironmentKey())
			pipeKey := strings.TrimSpace(cfg.GetPipelineKey())
			if envKey == "" || pipeKey == "" {
				continue
			}
			if _, ok := assetBusiness[match[1]]; !ok {
				assetBusiness[match[1]] = envKey + "/" + pipeKey
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
		asset := &model.Asset{
			FileID:         fileID,
			EnvironmentKey: "imported",
			PipelineKey:    "default",
			FileName:       fileName,
			FileSize:       int64(len(data)),
			ContentType:    http.DetectContentType(data),
			Path:           relativePath,
			URL:            generateFileURL(fileID),
		}
		// asset.BusinessKey = inferAssetBusinessKey(fileID, assetBusiness, configModels) // Deprecated
		if err := s.logic.UpdateAsset(ctx, asset); err != nil {
			if !errors.Is(err, ErrAssetNotFound) {
				return nil, err
			}
			if err := s.logic.CreateAsset(ctx, asset); err != nil {
				return nil, err
			}
		}
	}

	return s.decorateConfigList(configs), nil
}

// --------------------- Transfer helpers ---------------------

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

func extractAssetIDs(configs []model.Config) []string {
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

func inferAssetBusinessKey(fileID string, explicit map[string]string, configs []model.Config) string {
	// Deprecated: business_key no longer used
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

func parseStaticBundle(payload []byte) ([]*api.ResourceConfig, error) {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, err
	}

	if legacy, ok := raw["configs"]; ok {
		return parseLegacyStaticBundle(raw, legacy)
	}

	configs := make([]*api.ResourceConfig, 0)
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

func parseLegacyStaticBundle(raw map[string]any, legacy any) ([]*api.ResourceConfig, error) {
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
	result := make([]*api.ResourceConfig, 0, len(configsRaw))
	for _, item := range configsRaw {
		businessKey := strings.TrimSpace(item.BusinessKey)
		if businessKey == "" {
			businessKey = defaultKey
		}
		cfg := &api.ResourceConfig{
			ResourceKey:    item.ResourceKey,
			EnvironmentKey: "legacy",
			PipelineKey:    "default",
			Alias:          item.Alias,
			Name:           item.Name,
			Type:           normalizeConfigTypeString(item.Type),
			Remark:         item.Remark,
			IsPerm:         item.IsPerm,
		}
		cfg.Content = restoreStaticContent(item.Content)
		result = append(result, cfg)
	}
	return result, nil
}

func convertStaticEntry(alias, businessKey string, entryVal any) *api.ResourceConfig {
	cfg := &api.ResourceConfig{
		Alias:          alias,
		EnvironmentKey: "imported",
		PipelineKey:    "default",
		Type:           "config",
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
