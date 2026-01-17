package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"
	resourceservice "github.com/yi-nology/rainbow_bridge/biz/service/resource"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
	"github.com/yi-nology/rainbow_bridge/pkg/validator"
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

// ResourceHandler exposes non-protobuf endpoints such as file upload.
type ResourceHandler struct {
	service *resourceservice.Service
}

func NewResourceHandler(service *resourceservice.Service) *ResourceHandler {
	return &ResourceHandler{service: service}
}

// UploadFile handles multipart uploads and persists assets through the service layer.
func (h *ResourceHandler) UploadFile(ctx context.Context, c *app.RequestContext) {
	// Check Content-Length header first
	contentLength := c.Request.Header.ContentLength()
	if contentLength > MaxUploadSize {
		writeBadRequest(c, errors.New("file too large"))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		writeBadRequest(c, err)
		return
	}

	// Validate file size
	if fileHeader.Size > MaxUploadSize {
		writeBadRequest(c, errors.New("file too large"))
		return
	}

	if fileHeader.Size == 0 {
		writeBadRequest(c, errors.New("file is empty"))
		return
	}

	// Validate MIME type from header
	declaredType := fileHeader.Header.Get("Content-Type")
	normalizedType := strings.ToLower(strings.TrimSpace(declaredType))
	if idx := strings.Index(normalizedType, ";"); idx > 0 {
		normalizedType = strings.TrimSpace(normalizedType[:idx])
	}
	if !AllowedMimeTypes[normalizedType] {
		writeBadRequest(c, errors.New("unsupported file type"))
		return
	}

	// Validate business key
	businessKey := string(c.FormValue("business_key"))
	if businessKey != "" && !validator.ValidateBusinessKey(businessKey) {
		writeBadRequest(c, errors.New("invalid business_key format"))
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	defer file.Close()

	// Use LimitReader to prevent reading more than allowed
	data, err := io.ReadAll(io.LimitReader(file, MaxUploadSize+1))
	if err != nil {
		writeInternalError(c, err)
		return
	}

	// Double-check size after reading
	if int64(len(data)) > MaxUploadSize {
		writeBadRequest(c, errors.New("file too large"))
		return
	}

	input := &resourceservice.FileUploadInput{
		BusinessKey: businessKey,
		Remark:      string(c.FormValue("remark")),
		FileName:    fileHeader.Filename,
		ContentType: fileHeader.Header.Get("Content-Type"),
		Data:        data,
	}

	asset, reference, err := h.service.UploadAsset(enrichContext(ctx, c), input)
	if err != nil {
		writeInternalError(c, err)
		return
	}

	c.JSON(consts.StatusOK, common.CommonResponse{
		Code: consts.StatusOK,
		Data: map[string]any{
			"asset":     asset,
			"reference": reference,
		},
	})
}

// GetFile streams stored asset content back to the client.
func (h *ResourceHandler) GetFile(ctx context.Context, c *app.RequestContext) {
	fileID := c.Param("fileID")
	asset, path, err := h.service.GetAssetFile(enrichContext(ctx, c), fileID)
	if err != nil {
		if errors.Is(err, resourceservice.ErrAssetNotFound) || errors.Is(err, os.ErrNotExist) {
			writeNotFound(c, err)
			return
		}
		writeInternalError(c, err)
		return
	}

	content, err := os.ReadFile(path)
	if err != nil {
		writeInternalError(c, err)
		return
	}

	contentType := asset.ContentType
	if contentType == "" {
		contentType = consts.MIMEApplicationOctetStream
	}
	c.Response.Header.Set("Content-Type", contentType)
	if asset.FileName != "" {
		c.Response.Header.Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", asset.FileName))
	}
	c.Data(consts.StatusOK, contentType, content)
}

// ListSystemResource exposes system configuration for legacy consumers.
func (h *ResourceHandler) ListAssets(ctx context.Context, c *app.RequestContext) {
	businessKey := strings.TrimSpace(c.Query("business_key"))
	if businessKey == "" {
		writeBadRequest(c, errors.New("business_key is required"))
		return
	}
	assets, err := h.service.ListAssets(enrichContext(ctx, c), businessKey)
	if err != nil {
		writeInternalError(c, err)
		return
	}
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code: consts.StatusOK,
		Data: map[string]any{
			"assets": assets,
		},
	})
}

// GetRealtimeStaticConfig returns the realtime static configuration (nginx-config).
// This endpoint's response structure must remain unchanged for backward compatibility.
func (h *ResourceHandler) GetRealtimeStaticConfig(ctx context.Context, c *app.RequestContext) {
	payload, err := h.service.GetRealtimeStaticConfig(enrichContext(ctx, c))
	if err != nil {
		writeInternalError(c, err)
		return
	}
	c.JSON(consts.StatusOK, payload)
}

// GetInitData returns all initialization data needed by the frontend.
// This aggregates business keys, system config, and realtime config into a single response.
func (h *ResourceHandler) GetInitData(ctx context.Context, c *app.RequestContext) {
	initData, err := h.service.GetInitData(enrichContext(ctx, c))
	if err != nil {
		writeInternalError(c, err)
		return
	}
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code: consts.StatusOK,
		Data: initData,
	})
}

// ExportSystemSelectedStaticBundle returns a static bundle containing system configs and the business selected by system.business_select.
func (h *ResourceHandler) ExportSystemSelectedStaticBundle(ctx context.Context, c *app.RequestContext) {
	data, name, err := h.service.ExportSystemSelectedStaticBundle(enrichContext(ctx, c))
	if err != nil {
		writeInternalError(c, err)
		return
	}
	if name == "" {
		name = "system_static_bundle.zip"
	}
	c.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
	c.Data(consts.StatusOK, "application/zip", data)
}

// ExportStaticBundleAll returns a static bundle containing all business configs including system.
func (h *ResourceHandler) ExportStaticBundleAll(ctx context.Context, c *app.RequestContext) {
	data, name, err := h.service.ExportStaticBundleAll(enrichContext(ctx, c))
	if err != nil {
		writeInternalError(c, err)
		return
	}
	if name == "" {
		name = "all_static_bundle.zip"
	}
	c.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
	c.Data(consts.StatusOK, "application/zip", data)
}

// enrichContext mirrors the logic used in protobuf handlers to propagate headers.
func enrichContext(ctx context.Context, c *app.RequestContext) context.Context {
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

func writeBadRequest(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusBadRequest,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

func writeInternalError(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusInternalServerError,
		Msg:   "internal error",
		Error: err.Error(),
	})
}

func writeNotFound(c *app.RequestContext, err error) {
	c.JSON(consts.StatusOK, common.CommonResponse{
		Code:  consts.StatusNotFound,
		Msg:   err.Error(),
		Error: err.Error(),
	})
}

// --------------------- Config CRUD endpoints ---------------------

// AddConfig handles creating a new config.
func (h *ResourceHandler) AddConfig(ctx context.Context, c *app.RequestContext) {
	req := &api.CreateOrUpdateConfigRequest{}
	if err := c.BindJSON(req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	cfg, err := h.service.AddConfig(enrichContext(ctx, c), req)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	respondConfig(c, cfg)
}

// UpdateConfig handles updating an existing config.
func (h *ResourceHandler) UpdateConfig(ctx context.Context, c *app.RequestContext) {
	req := &api.CreateOrUpdateConfigRequest{}
	if err := c.BindJSON(req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if req.Config == nil || req.Config.ResourceKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("resource_key is required"))
		return
	}
	cfg, err := h.service.UpdateConfig(enrichContext(ctx, c), req)
	if err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourceservice.ErrResourceNotFound) {
			status = consts.StatusNotFound
		}
		respondError(c, status, err)
		return
	}
	respondConfig(c, cfg)
}

// DeleteConfig handles deleting a config.
func (h *ResourceHandler) DeleteConfig(ctx context.Context, c *app.RequestContext) {
	req := &api.ResourceDeleteRequest{}
	if err := c.BindJSON(req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if req.BusinessKey == "" || req.ResourceKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key and resource_key are required"))
		return
	}
	if err := h.service.DeleteConfig(enrichContext(ctx, c), req); err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourceservice.ErrResourceNotFound) {
			status = consts.StatusNotFound
		} else if errors.Is(err, resourceservice.ErrProtectedSystemConfig) {
			status = consts.StatusBadRequest
		}
		respondError(c, status, err)
		return
	}
	respondOK(c)
}

// ListConfigs handles listing configs by business key.
func (h *ResourceHandler) ListConfigs(ctx context.Context, c *app.RequestContext) {
	req := &api.ResourceQueryRequest{
		BusinessKey: c.Query("business_key"),
		Type:        c.Query("type"),
		MinVersion:  c.Query("min_version"),
		MaxVersion:  c.Query("max_version"),
	}
	if req.BusinessKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key is required"))
		return
	}
	if val := c.Query("is_latest"); val != "" {
		parsed, err := strconv.ParseBool(val)
		if err != nil {
			respondError(c, consts.StatusBadRequest, err)
			return
		}
		req.IsLatest = parsed
	}

	list, err := h.service.ListConfigs(enrichContext(ctx, c), req)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &api.ResourceListResponse{List: list})
}

// GetConfigDetail handles getting a single config detail.
func (h *ResourceHandler) GetConfigDetail(ctx context.Context, c *app.RequestContext) {
	req := &api.ResourceDetailRequest{
		BusinessKey: c.Query("business_key"),
		ResourceKey: c.Query("resource_key"),
	}
	if req.BusinessKey == "" || req.ResourceKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key and resource_key are required"))
		return
	}
	cfg, err := h.service.GetConfigDetail(enrichContext(ctx, c), req)
	if err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourceservice.ErrResourceNotFound) {
			status = consts.StatusNotFound
		}
		respondError(c, status, err)
		return
	}
	c.JSON(consts.StatusOK, &api.ResourceDetailResponse{Detail: cfg})
}

// ImportConfigs handles importing configs from JSON or ZIP archive.
func (h *ResourceHandler) ImportConfigs(ctx context.Context, c *app.RequestContext) {
	contentType := strings.ToLower(string(c.GetHeader("Content-Type")))
	if strings.HasPrefix(contentType, "multipart/form-data") {
		fileHeader, err := c.FormFile("archive")
		if err != nil {
			respondError(c, consts.StatusBadRequest, err)
			return
		}
		file, err := fileHeader.Open()
		if err != nil {
			respondError(c, consts.StatusBadRequest, err)
			return
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			respondError(c, consts.StatusInternalServerError, err)
			return
		}
		overwrite := strings.ToLower(string(c.FormValue("overwrite"))) == "true"
		configs, err := h.service.ImportConfigsArchive(enrichContext(ctx, c), data, overwrite)
		if err != nil {
			respondError(c, consts.StatusInternalServerError, err)
			return
		}
		respondOKWithSummary(c, buildConfigSummary(configs))
		return
	}

	req := &api.ResourceImportRequest{}
	if err := c.BindJSON(req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if len(req.Configs) == 0 {
		respondError(c, consts.StatusBadRequest, errors.New("configs cannot be empty"))
		return
	}
	if err := h.service.ImportConfigs(enrichContext(ctx, c), req); err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	respondOKWithSummary(c, buildConfigSummary(req.Configs))
}

// ExportConfigs handles exporting configs in various formats.
func (h *ResourceHandler) ExportConfigs(ctx context.Context, c *app.RequestContext) {
	includeSystem := true
	if val := c.Query("include_system"); val != "" {
		parsed, err := strconv.ParseBool(val)
		if err != nil {
			respondError(c, consts.StatusBadRequest, err)
			return
		}
		includeSystem = parsed
	}

	businessKeys := parseBusinessKeys(c.Query("business_keys"))
	if single := c.Query("business_key"); single != "" {
		businessKeys = append(businessKeys, single)
	}
	businessKeys = sanitizeBusinessKeys(businessKeys)
	if len(businessKeys) == 0 {
		respondError(c, consts.StatusBadRequest, errors.New("business_key is required"))
		return
	}
	format := strings.ToLower(c.Query("format"))

	if format == "zip" {
		archive, name, err := h.service.ExportConfigsArchiveBatch(enrichContext(ctx, c), businessKeys, includeSystem)
		if err != nil {
			respondError(c, consts.StatusInternalServerError, err)
			return
		}
		if name == "" {
			name = fmt.Sprintf("%s_archive.zip", businessKeys[0])
		}
		c.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
		c.Data(consts.StatusOK, "application/zip", archive)
		return
	}

	if format == "nginx" || format == "static" {
		archive, name, err := h.service.ExportStaticBundleBatch(enrichContext(ctx, c), businessKeys, includeSystem)
		if err != nil {
			respondError(c, consts.StatusInternalServerError, err)
			return
		}
		if name == "" {
			name = fmt.Sprintf("%s_static_bundle.zip", businessKeys[0])
		}
		c.Response.Header.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
		c.Data(consts.StatusOK, "application/zip", archive)
		return
	}

	list, err := h.service.ExportConfigsBatch(enrichContext(ctx, c), businessKeys, includeSystem)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &api.ResourceListResponse{List: list})
}

// ListBusinessKeys handles listing all business keys.
func (h *ResourceHandler) ListBusinessKeys(ctx context.Context, c *app.RequestContext) {
	keys, err := h.service.ListBusinessKeys(enrichContext(ctx, c))
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &api.BusinessKeyListResponse{List: keys})
}

// --------------------- Response helpers ---------------------

func respondConfig(c *app.RequestContext, cfg *api.ResourceConfig) {
	c.JSON(consts.StatusOK, &api.OperateResponse{
		Code:   consts.StatusOK,
		Msg:    http.StatusText(consts.StatusOK),
		Config: cfg,
	})
}

func respondOK(c *app.RequestContext) {
	c.JSON(consts.StatusOK, &api.OperateResponse{Code: consts.StatusOK, Msg: http.StatusText(consts.StatusOK)})
}

func respondOKWithSummary(c *app.RequestContext, summary *api.ConfigSummary) {
	if summary == nil {
		respondOK(c)
		return
	}
	c.JSON(consts.StatusOK, &api.OperateResponseWithSummary{
		Code:    consts.StatusOK,
		Msg:     http.StatusText(consts.StatusOK),
		Summary: summary,
	})
}

func respondError(c *app.RequestContext, status int, err error) {
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

func parseBusinessKeys(raw string) []string {
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

func sanitizeBusinessKeys(keys []string) []string {
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

func buildConfigSummary(configs []*api.ResourceConfig) *api.ConfigSummary {
	if len(configs) == 0 {
		return &api.ConfigSummary{
			BusinessKeys: []string{},
			Items:        []api.ConfigSummaryItem{},
		}
	}

	businessSet := make(map[string]struct{})
	items := make([]api.ConfigSummaryItem, 0, len(configs))

	for _, cfg := range configs {
		if cfg == nil {
			continue
		}
		key := cfg.BusinessKey
		if key != "" {
			businessSet[key] = struct{}{}
		}
		items = append(items, api.ConfigSummaryItem{
			ResourceKey: cfg.ResourceKey,
			BusinessKey: key,
			Name:        cfg.Name,
			Alias:       cfg.Alias,
			Type:        cfg.Type,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].BusinessKey == items[j].BusinessKey {
			if items[i].Name == items[j].Name {
				return items[i].Alias < items[j].Alias
			}
			return items[i].Name < items[j].Name
		}
		return items[i].BusinessKey < items[j].BusinessKey
	})

	businessKeys := make([]string, 0, len(businessSet))
	for key := range businessSet {
		businessKeys = append(businessKeys, key)
	}
	sort.Strings(businessKeys)

	return &api.ConfigSummary{
		Total:        len(items),
		BusinessKeys: businessKeys,
		Items:        items,
	}
}

// Ensure json import is used
var _ = json.Marshal
