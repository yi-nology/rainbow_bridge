package service

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
)

// --------------------- System operations ---------------------

func (s *Service) ListSystemConfigs(ctx context.Context, environmentKey, pipelineKey string) (map[string]string, string, error) {
	data, err := s.logic.ListSystemConfigs(ctx, environmentKey, pipelineKey)
	if err != nil {
		return nil, "", err
	}
	result := make(map[string]string, len(data))
	keys := make([]string, 0, len(data))
	for alias, content := range data {
		if str, ok := content.(string); ok {
			result[alias] = s.applyFileURLPrefix(str)
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

// GetRealtimeStaticConfig returns a config payload containing the latest configs
// for the specified environment and pipeline.
func (s *Service) GetRealtimeStaticConfig(ctx context.Context, environmentKey, pipelineKey string) (map[string]any, error) {
	configs, err := s.logic.ExportConfigs(ctx, environmentKey, pipelineKey)
	if err != nil {
		return nil, err
	}

	// Simplified payload without nested business logic
	payload := make(map[string]any)
	payload["environment_key"] = environmentKey
	payload["pipeline_key"] = pipelineKey
	payload["total"] = len(configs)

	result := make(map[string]any)
	for _, cfg := range configs {
		key := cfg.Alias
		if key == "" {
			key = cfg.Name
		}
		if key == "" {
			key = cfg.ResourceKey
		}
		result[key] = cfg.Content
	}
	payload["configs"] = result

	return s.decorateRealtimePayload(payload), nil
}

func (s *Service) ListBusinessKeys(ctx context.Context) ([]string, error) {
	return s.logic.ListBusinessKeys(ctx)
}

func extractBusinessSelectKey(configs []model.Config) string {
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
