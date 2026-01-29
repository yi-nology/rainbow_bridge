package handler

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	"github.com/yi-nology/rainbow_bridge/biz/model/transfer"
	pkgcommon "github.com/yi-nology/rainbow_bridge/pkg/common"
)

// Upload constraints
const (
	MaxUploadSize = 10 * 1024 * 1024 // 10MB
)

// AllowedMimeTypes defines the whitelist of allowed MIME types for uploads.
var AllowedMimeTypes = map[string]bool{
	// 常见图片格式
	"image/jpeg":               true, // .jpg, .jpeg
	"image/png":                true, // .png
	"image/gif":                true, // .gif
	"image/webp":               true, // .webp
	"image/svg+xml":            true, // .svg
	"image/bmp":                true, // .bmp
	"image/x-ms-bmp":           true, // .bmp (Windows)
	"image/tiff":               true, // .tif, .tiff
	"image/x-icon":             true, // .ico
	"image/vnd.microsoft.icon": true, // .ico
	"image/heic":               true, // .heic (iOS)
	"image/heif":               true, // .heif

	// 压缩包格式
	"application/zip":              true, // .zip
	"application/x-zip-compressed": true, // .zip
	"application/x-rar-compressed": true, // .rar
	"application/x-7z-compressed":  true, // .7z
	"application/x-tar":            true, // .tar
	"application/gzip":             true, // .gz
	"application/x-gzip":           true, // .gz
	"application/x-bzip2":          true, // .bz2

	// 字体文件格式
	"font/ttf":               true, // .ttf
	"font/otf":               true, // .otf
	"font/woff":              true, // .woff
	"font/woff2":             true, // .woff2
	"application/x-font-ttf": true, // .ttf
	"application/x-font-otf": true, // .otf
	"application/font-woff":  true, // .woff
	"application/font-woff2": true, // .woff2

	// 文档格式
	"application/pdf":    true, // .pdf
	"application/msword": true, // .doc
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true, // .docx
	"application/vnd.ms-excel": true, // .xls
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true, // .xlsx
	"application/vnd.ms-powerpoint":                                             true, // .ppt
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true, // .pptx

	// 文本格式
	"text/plain":       true, // .txt
	"text/csv":         true, // .csv
	"text/html":        true, // .html
	"text/css":         true, // .css
	"text/javascript":  true, // .js
	"application/json": true, // .json
	"application/xml":  true, // .xml
	"text/xml":         true, // .xml

	// 音视频格式
	"audio/mpeg":      true, // .mp3
	"audio/wav":       true, // .wav
	"audio/ogg":       true, // .ogg
	"video/mp4":       true, // .mp4
	"video/mpeg":      true, // .mpeg
	"video/webm":      true, // .webm
	"video/quicktime": true, // .mov
}

// EnrichContext mirrors the logic used in protobuf handlers to propagate headers.
func EnrichContext(ctx context.Context, c *app.RequestContext) context.Context {
	if userHeader := c.GetHeader("X-User-Id"); len(userHeader) > 0 {
		if id, err := strconv.Atoi(string(userHeader)); err == nil {
			ctx = pkgcommon.ContextWithUserID(ctx, id)
		}
	}
	clientVersion := string(c.GetHeader("X-Client-Version"))
	if clientVersion == "" {
		clientVersion = c.Query("client_version")
	}
	if clientVersion != "" {
		ctx = pkgcommon.ContextWithClientVersion(ctx, clientVersion)
	}
	return ctx
}

func WriteBadRequest(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, pkgcommon.CommonResponse{
		Code:  consts.StatusBadRequest,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

func WriteInternalError(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, pkgcommon.CommonResponse{
		Code:  consts.StatusInternalServerError,
		Msg:   "internal error",
		Error: err.Error(),
	})
}

func WriteNotFound(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, pkgcommon.CommonResponse{
		Code:  consts.StatusNotFound,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

// --------------------- Response helpers ---------------------

// Response type for config operations
type ConfigOperateResponse struct {
	Code   int32                  `json:"code"`
	Msg    string                 `json:"msg,omitempty"`
	Error  string                 `json:"error,omitempty"`
	Config *common.ResourceConfig `json:"config,omitempty"`
}

func RespondConfig(c *app.RequestContext, cfg *common.ResourceConfig) {
	c.JSON(consts.StatusOK, &ConfigOperateResponse{
		Code:   consts.StatusOK,
		Msg:    http.StatusText(consts.StatusOK),
		Config: cfg,
	})
}

func RespondOK(c *app.RequestContext) {
	c.JSON(consts.StatusOK, &common.OperateResponse{Code: consts.StatusOK, Msg: http.StatusText(consts.StatusOK)})
}

func RespondOKWithSummary(c *app.RequestContext, summary *transfer.ImportSummary) {
	if summary == nil {
		RespondOK(c)
		return
	}
	c.JSON(consts.StatusOK, &transfer.ImportResponse{
		Code: consts.StatusOK,
		Msg:  http.StatusText(consts.StatusOK),
		Data: summary,
	})
}

func RespondError(c *app.RequestContext, status int, err error) {
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	c.JSON(consts.StatusOK, &common.OperateResponse{
		Code:  int32(status),
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

// SummaryItem is a helper struct for building config summaries
type SummaryItem struct {
	ResourceKey    string
	EnvironmentKey string
	PipelineKey    string
	Name           string
	Alias          string
	Type           string
}

// ConfigSummary is a helper struct for building config summaries
type ConfigSummary struct {
	Total           int
	EnvironmentKeys []string
	PipelineKeys    []string
	Items           []SummaryItem
}

func BuildConfigSummary(configs []*common.ResourceConfig) *ConfigSummary {
	if len(configs) == 0 {
		return &ConfigSummary{
			EnvironmentKeys: []string{},
			PipelineKeys:    []string{},
			Items:           []SummaryItem{},
		}
	}

	envSet := make(map[string]struct{})
	pipeSet := make(map[string]struct{})
	items := make([]SummaryItem, 0, len(configs))

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
		items = append(items, SummaryItem{
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

	return &ConfigSummary{
		Total:           len(items),
		EnvironmentKeys: envKeys,
		PipelineKeys:    pipeKeys,
		Items:           items,
	}
}
