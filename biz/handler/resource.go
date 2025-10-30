package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	resourceservice "github.com/yi-nology/rainbow_bridge/biz/service/resource"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
)

// ResourceHandler exposes non-protobuf endpoints such as file upload.
type ResourceHandler struct {
	service *resourceservice.Service
}

func NewResourceHandler(service *resourceservice.Service) *ResourceHandler {
	return &ResourceHandler{service: service}
}

// UploadFile handles multipart uploads and persists assets through the service layer.
func (h *ResourceHandler) UploadFile(ctx context.Context, c *app.RequestContext) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeInternalError(c, err)
		return
	}

	input := &resourceservice.FileUploadInput{
		BusinessKey: string(c.FormValue("business_key")),
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

// ListSystemResource exposes system configuration for legacy consumers.
func (h *ResourceHandler) GetRealtimeStaticConfig(ctx context.Context, c *app.RequestContext) {
	payload, err := h.service.GetRealtimeStaticConfig(enrichContext(ctx, c))
	if err != nil {
		writeInternalError(c, err)
		return
	}
	c.JSON(consts.StatusOK, payload)
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
