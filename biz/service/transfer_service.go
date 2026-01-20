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
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	"gorm.io/gorm"
)

// --------------------- Export/Import operations ---------------------

func (s *Service) ExportConfigs(ctx context.Context, environmentKey, pipelineKey string, includeSystemConfig, systemConfigOnly bool) ([]*common.ResourceConfig, error) {
	if environmentKey == "" || pipelineKey == "" {
		return nil, errors.New("environment_key and pipeline_key required")
	}

	var configs []model.Config
	var err error

	if systemConfigOnly {
		// 只导出系统配置（系统配置现在只与环境相关）
		sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
		if err != nil {
			return nil, err
		}
		// 将系统配置转换为 Config 类型
		for _, sc := range sysConfigs {
			configs = append(configs, model.Config{
				EnvironmentKey: sc.EnvironmentKey,
				PipelineKey:    pipelineKey, // 使用当前选择的 pipeline
				Alias:          sc.ConfigKey,
				Name:           sc.ConfigKey,
				Content:        sc.ConfigValue,
				Type:           sc.ConfigType,
				Remark:         sc.Remark,
			})
		}
	} else if includeSystemConfig {
		// 导出业务配置 + 系统配置
		bizConfigs, err := s.logic.ExportConfigs(ctx, environmentKey, pipelineKey)
		if err != nil {
			return nil, err
		}
		sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
		if err != nil {
			return nil, err
		}
		// 先添加业务配置
		configs = bizConfigs
		// 再添加系统配置
		for _, sc := range sysConfigs {
			configs = append(configs, model.Config{
				EnvironmentKey: sc.EnvironmentKey,
				PipelineKey:    pipelineKey, // 使用当前选择的 pipeline
				Alias:          sc.ConfigKey,
				Name:           sc.ConfigKey,
				Content:        sc.ConfigValue,
				Type:           sc.ConfigType,
				Remark:         sc.Remark,
			})
		}
	} else {
		// 仅导出业务配置
		configs, err = s.logic.ExportConfigs(ctx, environmentKey, pipelineKey)
	}

	if err != nil {
		return nil, err
	}
	return s.decorateConfigList(configSliceToPB(configs)), nil
}

func (s *Service) ImportConfigs(ctx context.Context, configs []*common.ResourceConfig, overwrite bool) error {
	if configs == nil {
		return errors.New("configs required")
	}
	modelConfigs := make([]model.Config, 0, len(configs))
	for _, cfg := range configs {
		modelConfigs = append(modelConfigs, *pbConfigToModel(cfg))
	}
	return s.logic.ImportConfigs(ctx, modelConfigs, overwrite)
}

func (s *Service) ExportConfigsArchive(ctx context.Context, environmentKey, pipelineKey string, includeSystemConfig, systemConfigOnly bool) ([]byte, string, error) {
	if environmentKey == "" || pipelineKey == "" {
		return nil, "", errors.New("environment_key and pipeline_key required")
	}

	var configs []model.Config
	var err error

	if systemConfigOnly {
		// 只导出系统配置（系统配置现在只与环境相关）
		sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
		if err != nil {
			return nil, "", err
		}
		for _, sc := range sysConfigs {
			configs = append(configs, model.Config{
				EnvironmentKey: sc.EnvironmentKey,
				PipelineKey:    pipelineKey, // 使用当前选择的 pipeline
				Alias:          sc.ConfigKey,
				Name:           sc.ConfigKey,
				Content:        sc.ConfigValue,
				Type:           sc.ConfigType,
				Remark:         sc.Remark,
			})
		}
	} else if includeSystemConfig {
		// 导出业务配置 + 系统配置
		bizConfigs, err := s.logic.ExportConfigs(ctx, environmentKey, pipelineKey)
		if err != nil {
			return nil, "", err
		}
		sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, environmentKey)
		if err != nil {
			return nil, "", err
		}
		configs = bizConfigs
		for _, sc := range sysConfigs {
			configs = append(configs, model.Config{
				EnvironmentKey: sc.EnvironmentKey,
				PipelineKey:    pipelineKey, // 使用当前选择的 pipeline
				Alias:          sc.ConfigKey,
				Name:           sc.ConfigKey,
				Content:        sc.ConfigValue,
				Type:           sc.ConfigType,
				Remark:         sc.Remark,
			})
		}
	} else {
		// 仅导出业务配置
		configs, err = s.logic.ExportConfigs(ctx, environmentKey, pipelineKey)
	}

	if err != nil {
		return nil, "", err
	}
	data, err := s.writeConfigArchive(ctx, configs)
	if err != nil {
		return nil, "", err
	}

	var name string
	if systemConfigOnly {
		name = fmt.Sprintf("%s_%s_system_config.zip", environmentKey, pipelineKey)
	} else {
		name = fmt.Sprintf("%s_%s_archive.zip", environmentKey, pipelineKey)
	}
	return data, name, nil
}

func (s *Service) ExportConfigsArchiveAll(ctx context.Context, includeSystemConfig bool) ([]byte, string, error) {
	// Get all environments
	environments, err := s.logic.ListEnvironments(ctx)
	if err != nil {
		return nil, "", err
	}

	// Collect all configs from all environment+pipeline combinations
	allConfigs := make([]model.Config, 0)

	for _, env := range environments {
		// Get pipelines for this environment
		pipelines, err := s.ListPipelines(ctx, env.EnvironmentKey, nil)
		if err != nil {
			continue // Skip this environment if error
		}
		for _, pipe := range pipelines {
			// Export business configs
			bizConfigs, err := s.logic.ExportConfigs(ctx, env.EnvironmentKey, pipe.PipelineKey)
			if err != nil {
				continue // Skip if error
			}
			allConfigs = append(allConfigs, bizConfigs...)

			// Export system configs if requested (system configs are now environment-scoped only)
			if includeSystemConfig {
				sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, env.EnvironmentKey)
				if err != nil {
					continue // Skip if error
				}
				for _, sc := range sysConfigs {
					allConfigs = append(allConfigs, model.Config{
						EnvironmentKey: sc.EnvironmentKey,
						PipelineKey:    pipe.PipelineKey, // Use current pipeline
						Alias:          sc.ConfigKey,
						Name:           sc.ConfigKey,
						Content:        sc.ConfigValue,
						Type:           sc.ConfigType,
						Remark:         sc.Remark,
					})
				}
			}
		}
	}

	if len(allConfigs) == 0 {
		return nil, "", errors.New("no configs found")
	}

	data, err := s.writeConfigArchive(ctx, allConfigs)
	if err != nil {
		return nil, "", err
	}

	name := "all_environments_archive.zip"
	return data, name, nil
}

func (s *Service) writeConfigArchive(ctx context.Context, configs []model.Config) ([]byte, error) {
	buf := &bytes.Buffer{}
	zipWriter := zip.NewWriter(buf)

	// 收集环境和渠道信息
	envSet := make(map[string]bool)
	pipelineSet := make(map[string]map[string]bool) // environment_key -> pipeline_key -> true
	systemConfigMap := make(map[string][]model.SystemConfig)

	for _, cfg := range configs {
		if cfg.EnvironmentKey != "" {
			envSet[cfg.EnvironmentKey] = true
			if cfg.PipelineKey != "" {
				if _, exists := pipelineSet[cfg.EnvironmentKey]; !exists {
					pipelineSet[cfg.EnvironmentKey] = make(map[string]bool)
				}
				pipelineSet[cfg.EnvironmentKey][cfg.PipelineKey] = true
			}
		}
	}

	// 获取环境详细信息
	envList := make([]model.Environment, 0)
	allEnvs, err := s.logic.ListEnvironments(ctx)
	if err == nil {
		for _, env := range allEnvs {
			if envSet[env.EnvironmentKey] {
				envList = append(envList, env)
			}
		}
	}

	// 获取渠道详细信息
	pipelineList := make([]model.Pipeline, 0)
	for envKey := range pipelineSet {
		envPipelines, err := s.ListPipelines(ctx, envKey, nil)
		if err == nil {
			for _, pl := range envPipelines {
				if pipelineSet[envKey][pl.GetPipelineKey()] {
					pipelineList = append(pipelineList, model.Pipeline{
						EnvironmentKey: envKey,
						PipelineKey:    pl.GetPipelineKey(),
						PipelineName:   pl.GetPipelineName(),
						Description:    pl.GetDescription(),
						IsActive:       pl.GetIsActive(),
					})
				}
			}
		}
	}

	// 收集系统配置信息（系统配置现在只与环境相关）
	for envKey := range envSet {
		sysConfigs, err := s.logic.ListSystemConfigsByEnvironment(ctx, envKey)
		if err == nil && len(sysConfigs) > 0 {
			systemConfigMap[envKey] = sysConfigs
		}
	}

	// 构建完整的数据结构
	archiveData := map[string]any{
		"environments":     envList,
		"pipelines":        pipelineList,
		"system_configs":   systemConfigMap,
		"business_configs": configSliceToPB(configs),
	}

	configData, err := json.MarshalIndent(archiveData, "", "  ")
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

func (s *Service) ImportConfigsArchive(ctx context.Context, data []byte, overwrite bool) ([]*common.ResourceConfig, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}

	var configs []*common.ResourceConfig
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

			// 解析新格式（包含 environments, pipelines, system_configs, business_configs）
			var archiveData map[string]any
			if err := json.Unmarshal(payload, &archiveData); err != nil {
				return nil, errors.New("invalid configs.json format")
			}

			businessConfigs, ok := archiveData["business_configs"]
			if !ok {
				return nil, errors.New("business_configs field not found in configs.json")
			}

			// 解析 business_configs 字段
			configBytes, _ := json.Marshal(businessConfigs)
			if err := json.Unmarshal(configBytes, &configs); err != nil {
				return nil, err
			}

			// 导入 environments
			if envs, ok := archiveData["environments"]; ok {
				if err := s.importEnvironments(ctx, envs); err != nil {
					// 记录错误但继续导入
					fmt.Printf("Warning: failed to import environments: %v\n", err)
				}
			}

			// 导入 pipelines
			if pipes, ok := archiveData["pipelines"]; ok {
				if err := s.importPipelines(ctx, pipes); err != nil {
					// 记录错误但继续导入
					fmt.Printf("Warning: failed to import pipelines: %v\n", err)
				}
			}

			// 导入 system_configs
			if sysConfigs, ok := archiveData["system_configs"]; ok {
				if err := s.importSystemConfigs(ctx, sysConfigs); err != nil {
					// 记录错误但继续导入
					fmt.Printf("Warning: failed to import system configs: %v\n", err)
				}
			}
			continue
		}
		if strings.HasPrefix(cleanName, "files/") {
			assetFiles[cleanName] = f
		}
	}

	if configs == nil {
		return nil, errors.New("config content not found in archive")
	}

	// Import configs
	configModels := make([]model.Config, 0, len(configs))
	// 构建 fileID 到 环境/渠道 的映射
	assetEnvPipeMap := make(map[string]struct {
		EnvironmentKey string
		PipelineKey    string
	})

	for _, cfg := range configs {
		configModels = append(configModels, *pbConfigToModel(cfg))

		// 提取配置中引用的图片资源 ID
		for _, rx := range []*regexp.Regexp{assetRefRegexp, fileURLRefRegexp} {
			matches := rx.FindAllStringSubmatch(cfg.GetContent(), -1)
			for _, match := range matches {
				if len(match) < 2 {
					continue
				}
				fileID := match[1]
				if _, exists := assetEnvPipeMap[fileID]; !exists {
					assetEnvPipeMap[fileID] = struct {
						EnvironmentKey string
						PipelineKey    string
					}{
						EnvironmentKey: cfg.GetEnvironmentKey(),
						PipelineKey:    cfg.GetPipelineKey(),
					}
				}
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

		// 从映射中获取环境和渠道信息
		envKey := ""
		pipeKey := ""
		if info, exists := assetEnvPipeMap[fileID]; exists {
			envKey = info.EnvironmentKey
			pipeKey = info.PipelineKey
		}

		asset := &model.Asset{
			FileID:         fileID,
			EnvironmentKey: envKey,
			PipelineKey:    pipeKey,
			FileName:       fileName,
			FileSize:       int64(len(data)),
			ContentType:    http.DetectContentType(data),
			Path:           relativePath,
		}
		asset.URL = s.generateFileURL(asset)
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

// importEnvironments 导入环境信息
func (s *Service) importEnvironments(ctx context.Context, data any) error {
	// 将 data 转换为 JSON 再解析
	envBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	var environments []model.Environment
	if err := json.Unmarshal(envBytes, &environments); err != nil {
		return err
	}

	for _, env := range environments {
		// 检查环境是否已存在
		existing, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, env.EnvironmentKey)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		if existing != nil {
			// 更新已存在的环境
			env.ID = existing.ID
			env.CreatedAt = existing.CreatedAt
			if err := s.logic.environmentDAO.Update(ctx, s.logic.db, &env); err != nil {
				return err
			}
		} else {
			// 创建新环境
			if err := s.logic.environmentDAO.Create(ctx, s.logic.db, &env); err != nil {
				return err
			}
		}
	}

	return nil
}

// importPipelines 导入渠道信息
func (s *Service) importPipelines(ctx context.Context, data any) error {
	// 将 data 转换为 JSON 再解析
	pipeBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	var pipelines []model.Pipeline
	if err := json.Unmarshal(pipeBytes, &pipelines); err != nil {
		return err
	}

	for _, pipe := range pipelines {
		// 检查渠道是否已存在
		existing, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, pipe.EnvironmentKey, pipe.PipelineKey)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		if existing != nil {
			// 更新已存在的渠道
			pipe.ID = existing.ID
			pipe.CreatedAt = existing.CreatedAt
			if err := s.logic.pipelineDAO.Update(ctx, s.logic.db, &pipe); err != nil {
				return err
			}
		} else {
			// 创建新渠道
			if err := s.logic.pipelineDAO.Create(ctx, s.logic.db, &pipe); err != nil {
				return err
			}
		}
	}

	return nil
}

// importSystemConfigs 导入系统配置
// SystemConfig is now environment-scoped only (no pipeline_key dependency)
func (s *Service) importSystemConfigs(ctx context.Context, data any) error {
	// system_configs 是一个 map，key 是 environment_key，value 是系统配置数组
	sysConfigMap, ok := data.(map[string]any)
	if !ok {
		return errors.New("invalid system_configs format")
	}

	for envKey, value := range sysConfigMap {
		envKey = strings.TrimSpace(envKey)
		if envKey == "" {
			continue
		}

		// 解析系统配置数组
		configBytes, err := json.Marshal(value)
		if err != nil {
			continue
		}

		var sysConfigs []model.SystemConfig
		if err := json.Unmarshal(configBytes, &sysConfigs); err != nil {
			continue
		}

		// 导入每个系统配置
		for _, sc := range sysConfigs {
			sc.EnvironmentKey = envKey

			// 检查是否已存在
			existing, err := s.logic.systemConfigDAO.GetByKey(ctx, s.logic.db, envKey, sc.ConfigKey)
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}

			if existing != nil {
				// 更新已存在的系统配置
				if err := s.logic.systemConfigDAO.UpdateFull(ctx, s.logic.db, envKey, sc.ConfigKey, sc.ConfigValue, sc.ConfigType, sc.Remark); err != nil {
					continue
				}
			} else {
				// 创建新系统配置
				if err := s.logic.systemConfigDAO.Create(ctx, s.logic.db, &sc); err != nil {
					continue
				}
			}
		}
	}

	return nil
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
			for _, rx := range []*regexp.Regexp{assetRefRegexp, fileURLRefRegexp} {
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
