package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	"github.com/yi-nology/rainbow_bridge/biz/model/runtime"
	"gorm.io/gorm"
)

// --------------------- Runtime operations ---------------------

// GetRuntimeOverview returns all environments and their pipelines.
func (s *Service) GetRuntimeOverview(ctx context.Context) (*runtime.RuntimeOverviewResponse, error) {
	isActive := true
	envs, err := s.logic.environmentDAO.List(ctx, s.logic.db, &isActive)
	if err != nil {
		return nil, err
	}

	var envOverviews []*runtime.EnvironmentOverview
	for _, env := range envs {
		pipelines, err := s.logic.pipelineDAO.List(ctx, s.logic.db, env.EnvironmentKey, &isActive)
		if err != nil {
			return nil, err
		}

		var pipelineOverviews []*runtime.PipelineOverview
		for _, pl := range pipelines {
			pipelineOverviews = append(pipelineOverviews, &runtime.PipelineOverview{
				PipelineKey:  pl.PipelineKey,
				PipelineName: pl.PipelineName,
			})
		}

		envOverviews = append(envOverviews, &runtime.EnvironmentOverview{
			EnvironmentKey:  env.EnvironmentKey,
			EnvironmentName: env.EnvironmentName,
			Pipelines:       pipelineOverviews,
		})
	}

	return &runtime.RuntimeOverviewResponse{
		Code: 200,
		Msg:  "OK",
		Data: &runtime.RuntimeOverviewData{
			Total: int32(len(envOverviews)),
			List:  envOverviews,
		},
	}, nil
}

// GetRuntimeConfig returns runtime configuration with environment info.
func (s *Service) GetRuntimeConfig(ctx context.Context, environmentKey, pipelineKey string) (*runtime.RuntimeConfigResponse, error) {
	if environmentKey == "" {
		return nil, errors.New("x-environment header is required")
	}
	if pipelineKey == "" {
		return nil, errors.New("x-pipeline header is required")
	}

	// 验证环境是否存在
	env, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, environmentKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("environment not found: %s", environmentKey)
		}
		return nil, err
	}

	// 验证渠道是否存在
	pipeline, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, environmentKey, pipelineKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("pipeline not found: %s/%s", environmentKey, pipelineKey)
		}
		return nil, err
	}

	// 查询业务配置
	configs, err := s.logic.ListConfigs(ctx, environmentKey, pipelineKey, "", "", "", false)
	if err != nil {
		return nil, err
	}

	// 装饰配置列表（处理资源引用）
	decoratedConfigs := s.decorateConfigList(configSliceToPB(configs))

	// 组装响应
	return &runtime.RuntimeConfigResponse{
		Code: 200,
		Msg:  "OK",
		Data: &runtime.RuntimeConfigData{
			Configs: decoratedConfigs,
			Environment: &runtime.EnvironmentInfo{
				EnvironmentKey:  env.EnvironmentKey,
				EnvironmentName: env.EnvironmentName,
				PipelineKey:     pipeline.PipelineKey,
				PipelineName:    pipeline.PipelineName,
			},
		},
	}, nil
}

// writeRuntimeConfigArchive creates a zip archive with config.json and asset files.
// The config.json structure matches the RuntimeConfigResponse format.
func (s *Service) ExportStaticPackage(ctx context.Context, environmentKey, pipelineKey string) ([]byte, string, error) {
	if environmentKey == "" {
		return nil, "", errors.New("environment_key is required")
	}
	if pipelineKey == "" {
		return nil, "", errors.New("pipeline_key is required")
	}

	// 验证环境是否存在
	env, err := s.logic.environmentDAO.GetByKey(ctx, s.logic.db, environmentKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", fmt.Errorf("environment not found: %s", environmentKey)
		}
		return nil, "", err
	}

	// 验证渠道是否存在
	pipeline, err := s.logic.pipelineDAO.GetByKey(ctx, s.logic.db, environmentKey, pipelineKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", fmt.Errorf("pipeline not found: %s/%s", environmentKey, pipelineKey)
		}
		return nil, "", err
	}

	// 查询业务配置
	configs, err := s.logic.ListConfigs(ctx, environmentKey, pipelineKey, "", "", "", false)
	if err != nil {
		return nil, "", err
	}

	// 装饰配置列表（处理资源引用，添加 basePath 前缀）
	decoratedConfigs := s.decorateConfigList(configSliceToPB(configs))

	// 构建与 RuntimeConfigResponse 一致的数据结构
	runtimeData := &runtime.RuntimeConfigData{
		Configs: decoratedConfigs,
		Environment: &runtime.EnvironmentInfo{
			EnvironmentKey:  env.EnvironmentKey,
			EnvironmentName: env.EnvironmentName,
			PipelineKey:     pipeline.PipelineKey,
			PipelineName:    pipeline.PipelineName,
		},
	}

	// 生成 zip 包
	data, err := s.writeRuntimeConfigArchive(ctx, runtimeData)
	if err != nil {
		return nil, "", err
	}

	// 构建文件名
	filename := fmt.Sprintf("%s_%s_static.zip", environmentKey, pipelineKey)
	return data, filename, nil
}

// writeRuntimeConfigArchive creates a zip archive with config.json and asset files.
// The config.json structure matches RuntimeConfigData format.
func (s *Service) writeRuntimeConfigArchive(ctx context.Context, runtimeData *runtime.RuntimeConfigData) ([]byte, error) {
	buf := &bytes.Buffer{}
	zipWriter := zip.NewWriter(buf)

	// 将 RuntimeConfigData 写入 config.json (包装为统一响应格式)
	responseData := &runtime.RuntimeConfigResponse{
		Code: 200,
		Msg:  "OK",
		Data: runtimeData,
	}
	configData, err := json.MarshalIndent(responseData, "", "  ")
	if err != nil {
		return nil, err
	}
	metaWriter, err := zipWriter.Create("config.json")
	if err != nil {
		return nil, err
	}
	if _, err := metaWriter.Write(configData); err != nil {
		return nil, err
	}

	// 提取配置中引用的资源文件 ID
	assetIDs := extractAssetIDsFromCommonConfigs(runtimeData.Configs)
	visited := make(map[string]struct{}, len(assetIDs))

	// 构建 files 目录前缀：<base_path>/api/v1/asset/file/
	filesPrefix := buildFilesPrefix(s.basePath)

	// 将资源文件打包到 zip 中
	for _, assetID := range assetIDs {
		if _, ok := visited[assetID]; ok {
			continue
		}
		visited[assetID] = struct{}{}

		asset, err := s.logic.GetAsset(ctx, assetID)
		if err != nil {
			// 如果资源不存在，跳过
			continue
		}

		fullPath := filepath.Join(dataDirectory, asset.Path)
		file, err := os.Open(fullPath)
		if err != nil {
			// 如果文件不存在，跳过
			continue
		}

		// 使用新的路径结构：<base_path>/api/v1/asset/file/<file_id>/<filename>
		zipPath := path.Join(filesPrefix, asset.FileID, asset.FileName)
		writer, err := zipWriter.CreateHeader(&zip.FileHeader{Name: zipPath, Method: zip.Deflate})
		if err != nil {
			closeQuietly(file)
			return nil, err
		}
		if _, err := io.Copy(writer, file); err != nil {
			closeQuietly(file)
			return nil, err
		}
		closeQuietly(file)
	}

	if err := zipWriter.Close(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// extractAssetIDsFromCommonConfigs extracts asset IDs from common.ResourceConfig list
func extractAssetIDsFromCommonConfigs(configs []*common.ResourceConfig) []string {
	var ids []string
	for _, cfg := range configs {
		if cfg == nil {
			continue
		}
		for _, rx := range []*regexp.Regexp{assetRefRegexp, fileURLRefRegexp} {
			matches := rx.FindAllStringSubmatch(cfg.Content, -1)
			for _, match := range matches {
				if len(match) >= 2 {
					ids = append(ids, match[1])
				}
			}
		}
	}
	return ids
}

// buildFilesPrefix constructs the files directory prefix based on basePath.
// Examples:
//
//	basePath="" -> "asset/file"
//	basePath="/rainbow-bridge" -> "rainbow-bridge/api/v1/asset/file"
func buildFilesPrefix(basePath string) string {
	if basePath == "" {
		return path.Join("api", "v1", "asset", "file")
	}
	// 移除前导的 /
	cleanBase := strings.TrimPrefix(basePath, "/")
	return path.Join(cleanBase, "api", "v1", "asset", "file")
}
