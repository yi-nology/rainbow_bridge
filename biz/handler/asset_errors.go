package handler

import (
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/biz/service"
)

// WriteAssetError also handles wrapped import errors, preserving actual status.
func WriteAssetError(c *app.RequestContext, err error) bool {
	e, ok := service.AsAssetError(err)
	if !ok {
		return false
	}
	body := map[string]any{"code": e.HTTPStatus, "msg": "error", "error": e.Message, "error_type": e.ErrorType}
	if e.References != nil {
		body["data"] = e.References
	}
	c.JSON(e.HTTPStatus, body)
	return true
}
