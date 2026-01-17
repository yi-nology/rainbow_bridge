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

func (s *Service) ListSystemConfigs(ctx context.Context) (map[string]string, string, error) {
	data, err := s.logic.ListSystemConfigs(ctx)
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

	configs := make([]model.Config, 0, len(systemConfigs)+4)
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
