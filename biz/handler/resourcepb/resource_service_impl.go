package resourcepb

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	resourcepbapi "github.com/yi-nology/rainbow_bridge/biz/model/api/resourcepb"
	resourcesvc "github.com/yi-nology/rainbow_bridge/biz/service/resource"
	"github.com/yi-nology/rainbow_bridge/pkg/common"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// ResourceService bridges protobuf-defined endpoints to the internal resource service.
type ResourceService struct {
	svc *resourcesvc.Service
}

// NewResourceService creates a protobuf handler backed by the provided service logic.
func NewResourceService(svc *resourcesvc.Service) *ResourceService {
	return &ResourceService{svc: svc}
}

// --------------------- Config endpoints ---------------------

func (s *ResourceService) AddConfig(ctx context.Context, c *app.RequestContext) {
	req := &resourcepbapi.CreateOrUpdateConfigRequest{}
	if err := bindJSON(c, req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	cfg, err := s.svc.AddConfig(enrichContext(ctx, c), req)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	respondConfig(c, cfg)
}

func (s *ResourceService) UpdateConfig(ctx context.Context, c *app.RequestContext) {
	req := &resourcepbapi.CreateOrUpdateConfigRequest{}
	if err := bindJSON(c, req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if req.Config.GetResourceKey() == "" {
		respondError(c, consts.StatusBadRequest, errors.New("resource_key is required"))
		return
	}
	cfg, err := s.svc.UpdateConfig(enrichContext(ctx, c), req)
	if err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourcesvc.ErrResourceNotFound) {
			status = consts.StatusNotFound
		}
		respondError(c, status, err)
		return
	}
	respondConfig(c, cfg)
}

func (s *ResourceService) DeleteConfig(ctx context.Context, c *app.RequestContext) {
	req := &resourcepbapi.ResourceDeleteRequest{}
	if err := bindJSON(c, req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if req.GetBusinessKey() == "" || req.GetResourceKey() == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key and resource_key are required"))
		return
	}
	if err := s.svc.DeleteConfig(enrichContext(ctx, c), req); err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourcesvc.ErrResourceNotFound) {
			status = consts.StatusNotFound
		} else if errors.Is(err, resourcesvc.ErrProtectedSystemConfig) {
			status = consts.StatusBadRequest
		}
		respondError(c, status, err)
		return
	}
	respondOK(c)
}

func (s *ResourceService) ListConfigs(ctx context.Context, c *app.RequestContext) {
	req := &resourcepbapi.ResourceQueryRequest{
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

	list, err := s.svc.ListConfigs(enrichContext(ctx, c), req)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &resourcepbapi.ResourceListResponse{List: list})
}

func (s *ResourceService) GetConfigDetail(ctx context.Context, c *app.RequestContext) {
	req := &resourcepbapi.ResourceDetailRequest{
		BusinessKey: c.Query("business_key"),
		ResourceKey: c.Query("resource_key"),
	}
	if req.BusinessKey == "" || req.ResourceKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key and resource_key are required"))
		return
	}
	cfg, err := s.svc.GetConfigDetail(enrichContext(ctx, c), req)
	if err != nil {
		status := consts.StatusInternalServerError
		if errors.Is(err, resourcesvc.ErrResourceNotFound) {
			status = consts.StatusNotFound
		}
		respondError(c, status, err)
		return
	}
	c.JSON(consts.StatusOK, &resourcepbapi.ResourceDetailResponse{Detail: cfg})
}

func (s *ResourceService) ImportConfigs(ctx context.Context, c *app.RequestContext) {
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
		configs, err := s.svc.ImportConfigsArchive(enrichContext(ctx, c), data, overwrite)
		if err != nil {
			respondError(c, consts.StatusInternalServerError, err)
			return
		}
		respondOKWithSummary(c, buildConfigSummary(configs))
		return
	}

	req := &resourcepbapi.ResourceImportRequest{}
	if err := bindJSON(c, req); err != nil {
		respondError(c, consts.StatusBadRequest, err)
		return
	}
	if len(req.Configs) == 0 {
		respondError(c, consts.StatusBadRequest, errors.New("configs cannot be empty"))
		return
	}
	if err := s.svc.ImportConfigs(enrichContext(ctx, c), req); err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	respondOKWithSummary(c, buildConfigSummary(req.GetConfigs()))
}

func (s *ResourceService) ExportConfigs(ctx context.Context, c *app.RequestContext) {
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
		archive, name, err := s.svc.ExportConfigsArchiveBatch(enrichContext(ctx, c), businessKeys, includeSystem)
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
		archive, name, err := s.svc.ExportStaticBundleBatch(enrichContext(ctx, c), businessKeys, includeSystem)
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

	list, err := s.svc.ExportConfigsBatch(enrichContext(ctx, c), businessKeys, includeSystem)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &resourcepbapi.ResourceListResponse{List: list})
}

func (s *ResourceService) ListAssets(ctx context.Context, c *app.RequestContext) {
	businessKey := strings.TrimSpace(c.Query("business_key"))
	if businessKey == "" {
		respondError(c, consts.StatusBadRequest, errors.New("business_key is required"))
		return
	}
	list, err := s.svc.ListAssets(enrichContext(ctx, c), businessKey)
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &resourcepbapi.FileAssetListResponse{Assets: list})
}

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

func (s *ResourceService) ListBusinessKeys(ctx context.Context, c *app.RequestContext) {
	keys, err := s.svc.ListBusinessKeys(enrichContext(ctx, c))
	if err != nil {
		respondError(c, consts.StatusInternalServerError, err)
		return
	}
	c.JSON(consts.StatusOK, &resourcepbapi.BusinessKeyListResponse{List: keys})
}

// --------------------- Helpers ---------------------

func bindJSON(c *app.RequestContext, msg proto.Message) error {
	if msg == nil {
		return errors.New("message must not be nil")
	}
	if body := c.Request.Body(); len(body) > 0 {
		return protojson.UnmarshalOptions{DiscardUnknown: true}.Unmarshal(body, msg)
	}
	return errors.New("request body is empty")
}

func respondConfig(c *app.RequestContext, cfg *resourcepbapi.ResourceConfig) {
	c.JSON(consts.StatusOK, &resourcepbapi.OperateResponse{
		Code:   consts.StatusOK,
		Msg:    http.StatusText(consts.StatusOK),
		Config: cfg,
	})
}

func respondOK(c *app.RequestContext) {
	c.JSON(consts.StatusOK, &resourcepbapi.OperateResponse{Code: consts.StatusOK, Msg: http.StatusText(consts.StatusOK)})
}

func respondOKWithSummary(c *app.RequestContext, summary *configSummary) {
	if summary == nil {
		respondOK(c)
		return
	}
	resp := &resourcepbapi.OperateResponse{
		Code: consts.StatusOK,
		Msg:  http.StatusText(consts.StatusOK),
	}
	c.JSON(consts.StatusOK, &operateResponseWithSummary{
		OperateResponse: resp,
		Summary:         summary,
	})
}

func respondError(c *app.RequestContext, status int, err error) {
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	c.JSON(consts.StatusOK, &resourcepbapi.OperateResponse{
		Code:  int32(status),
		Msg:   msg,
		Error: msg,
	})
}

type operateResponseWithSummary struct {
	*resourcepbapi.OperateResponse
	Summary *configSummary `json:"summary,omitempty"`
}

type configSummary struct {
	Total        int                 `json:"total"`
	BusinessKeys []string            `json:"businessKeys"`
	Items        []configSummaryItem `json:"items"`
}

type configSummaryItem struct {
	ResourceKey string `json:"resourceKey"`
	BusinessKey string `json:"businessKey"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Type        string `json:"type"`
}

func buildConfigSummary(configs []*resourcepbapi.ResourceConfig) *configSummary {
	if len(configs) == 0 {
		return &configSummary{
			BusinessKeys: []string{},
			Items:        []configSummaryItem{},
		}
	}

	businessSet := make(map[string]struct{})
	items := make([]configSummaryItem, 0, len(configs))

	for _, cfg := range configs {
		if cfg == nil {
			continue
		}
		key := cfg.GetBusinessKey()
		if key != "" {
			businessSet[key] = struct{}{}
		}
		items = append(items, configSummaryItem{
			ResourceKey: cfg.GetResourceKey(),
			BusinessKey: key,
			Name:        cfg.GetName(),
			Alias:       cfg.GetAlias(),
			Type:        cfg.GetType(),
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

	return &configSummary{
		Total:        len(items),
		BusinessKeys: businessKeys,
		Items:        items,
	}
}

func enrichContext(ctx context.Context, c *app.RequestContext) context.Context {
	userHeader := c.GetHeader("X-User-Id")
	if len(userHeader) > 0 {
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
