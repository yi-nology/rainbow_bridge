package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/yi-nology/rainbow_bridge/pkg/constants"
)

// InitData contains all initialization data needed by the frontend.
type InitData struct {
	BusinessKeys   []string          `json:"business_keys"`
	SystemConfig   *SystemConfigData `json:"system_config"`
	RealtimeConfig map[string]any    `json:"realtime_config"`
	Timestamp      int64             `json:"timestamp"`
}

// SystemConfigData contains parsed system configuration.
type SystemConfigData struct {
	BusinessSelect string            `json:"business_select"`
	SystemKeys     map[string]string `json:"system_keys"`
}

// GetInitData returns all data needed for frontend initialization.
// This aggregates multiple queries into a single response to reduce
// the number of API calls needed during page load.
func (s *Service) GetInitData(ctx context.Context) (*InitData, error) {
	// 1. Get all business keys
	businessKeys, err := s.logic.ListBusinessKeys(ctx)
	if err != nil {
		return nil, err
	}

	// 2. Get system configuration
	systemConfig, err := s.getSystemConfigData(ctx)
	if err != nil {
		return nil, err
	}

	// 3. Get realtime config (using default environment and pipeline)
	realtimeConfig, err := s.GetRealtimeStaticConfig(ctx, "default", "default")
	if err != nil {
		return nil, err
	}

	return &InitData{
		BusinessKeys:   businessKeys,
		SystemConfig:   systemConfig,
		RealtimeConfig: realtimeConfig,
		Timestamp:      time.Now().Unix(),
	}, nil
}

// getSystemConfigData extracts and parses system configuration values.
// It reads from the new system_config table using the default environment.
func (s *Service) getSystemConfigData(ctx context.Context) (*SystemConfigData, error) {
	result := &SystemConfigData{
		BusinessSelect: constants.DefaultBusinessSelect,
		SystemKeys:     make(map[string]string),
	}

	// Get business_select from system_config table (using default environment)
	businessSelect, err := s.logic.GetSystemConfigValue(ctx, "default", constants.SysConfigBusinessSelect)
	if err == nil && businessSelect != "" {
		content := strings.TrimSpace(businessSelect)
		// Handle both plain string and JSON object formats
		if strings.HasPrefix(content, "{") {
			var parsed map[string]any
			if err := json.Unmarshal([]byte(content), &parsed); err == nil {
				for _, key := range []string{"business_key", "businessKey", "selected", "key"} {
					if val, ok := parsed[key]; ok {
						if str, ok := val.(string); ok && str != "" {
							result.BusinessSelect = strings.TrimSpace(str)
							break
						}
					}
				}
			}
		} else {
			result.BusinessSelect = strings.Trim(content, "\"")
		}
	}

	// Get system_keys from system_config table (using default environment)
	systemKeys, err := s.logic.GetSystemConfigValue(ctx, "default", constants.SysConfigSystemKeys)
	if err == nil && systemKeys != "" {
		content := strings.TrimSpace(systemKeys)
		if strings.HasPrefix(content, "{") {
			var parsed map[string]any
			if err := json.Unmarshal([]byte(content), &parsed); err == nil {
				for k, v := range parsed {
					if str, ok := v.(string); ok {
						result.SystemKeys[k] = str
					}
				}
			}
		}
	}

	return result, nil
}
