package handler

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
)

// Upload constraints
const (
	MaxUploadSize = 10 * 1024 * 1024 // 10MB
)

// AllowedMimeTypes defines the whitelist of allowed MIME types for uploads.
var AllowedMimeTypes = map[string]bool{
	"image/jpeg":       true,
	"image/png":        true,
	"image/gif":        true,
	"image/webp":       true,
	"image/svg+xml":    true,
	"application/json": true,
	"text/plain":       true,
}

// EnrichContext mirrors the logic used in protobuf handlers to propagate headers.
func EnrichContext(ctx context.Context, c *app.RequestContext) context.Context {
	if userHeader := c.GetHeader("X-User-Id"); len(userHeader) > 0 {
		if id, err := strconv.Atoi(string(userHeader)); err == nil {
			ctx = common.ContextWithUserID(ctx, id)
		}
	}
	clientVersion := string(c.GetHeader("X-Client-Version"))
	if clientVersion == "" {
		clientVersion = c.Query("client_version")
	}
	if clientVersion != "" {
		ctx = common.ContextWithClientVersion(ctx, clientVersion)
	}
	return ctx
}

func WriteBadRequest(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusBadRequest,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

func WriteInternalError(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusInternalServerError,
		Msg:   "internal error",
		Error: err.Error(),
	})
}

func WriteNotFound(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusNotFound,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

// --------------------- Response helpers ---------------------

func RespondConfig(c *app.RequestContext, cfg *api.ResourceConfig) {
	c.JSON(consts.StatusOK, &api.OperateResponse{
		Code:   consts.StatusOK,
		Msg:    http.StatusText(consts.StatusOK),
		Config: cfg,
	})
}

func RespondOK(c *app.RequestContext) {
	c.JSON(consts.StatusOK, &api.OperateResponse{Code: consts.StatusOK, Msg: http.StatusText(consts.StatusOK)})
}

func RespondOKWithSummary(c *app.RequestContext, summary *api.ConfigSummary) {
	if summary == nil {
		RespondOK(c)
		return
	}
	c.JSON(consts.StatusOK, &api.OperateResponseWithSummary{
		Code:    consts.StatusOK,
		Msg:     http.StatusText(consts.StatusOK),
		Summary: summary,
	})
}

func RespondError(c *app.RequestContext, status int, err error) {
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	c.JSON(consts.StatusOK, &api.OperateResponse{
		Code:  status,
		Msg:   msg,
		Error: msg,
	})
}

// --------------------- Utility functions ---------------------

func ParseBusinessKeys(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	keys := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		keys = append(keys, part)
	}
	return keys
}

func SanitizeBusinessKeys(keys []string) []string {
	seen := make(map[string]struct{}, len(keys))
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result
}

func BuildConfigSummary(configs []*api.ResourceConfig) *api.ConfigSummary {
	if len(configs) == 0 {
		return &api.ConfigSummary{
			EnvironmentKeys: []string{},
			PipelineKeys:    []string{},
			Items:           []api.ConfigSummaryItem{},
		}
	}

	envSet := make(map[string]struct{})
	pipeSet := make(map[string]struct{})
	items := make([]api.ConfigSummaryItem, 0, len(configs))

	for _, cfg := range configs {
		if cfg == nil {
			continue
		}
		envKey := cfg.EnvironmentKey
		pipeKey := cfg.PipelineKey
		if envKey != "" {
			envSet[envKey] = struct{}{}
		}
		if pipeKey != "" {
			pipeSet[pipeKey] = struct{}{}
		}
		items = append(items, api.ConfigSummaryItem{
			ResourceKey:    cfg.ResourceKey,
			EnvironmentKey: envKey,
			PipelineKey:    pipeKey,
			Name:           cfg.Name,
			Alias:          cfg.Alias,
			Type:           cfg.Type,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].EnvironmentKey == items[j].EnvironmentKey {
			if items[i].PipelineKey == items[j].PipelineKey {
				if items[i].Name == items[j].Name {
					return items[i].Alias < items[j].Alias
				}
				return items[i].Name < items[j].Name
			}
			return items[i].PipelineKey < items[j].PipelineKey
		}
		return items[i].EnvironmentKey < items[j].EnvironmentKey
	})

	envKeys := make([]string, 0, len(envSet))
	for key := range envSet {
		envKeys = append(envKeys, key)
	}
	sort.Strings(envKeys)

	pipeKeys := make([]string, 0, len(pipeSet))
	for key := range pipeSet {
		pipeKeys = append(pipeKeys, key)
	}
	sort.Strings(pipeKeys)

	return &api.ConfigSummary{
		Total:           len(items),
		EnvironmentKeys: envKeys,
		PipelineKeys:    pipeKeys,
		Items:           items,
	}
}
