package asset

import (
	"context"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/biz/handler"
	assetpb "github.com/yi-nology/rainbow_bridge/biz/model/asset"
	"github.com/yi-nology/rainbow_bridge/biz/service"
)

// Delete is registered from asset.proto by hz; payload locations stay server-owned.
func Delete(ctx context.Context, c *app.RequestContext) {
	var req assetpb.DeleteAssetRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, map[string]any{"code": 400, "msg": "error", "error": "invalid resource delete request", "error_type": service.ErrTypeScopeInvalidRequest})
		return
	}
	result, err := svc.DeleteAsset(handler.EnrichContext(ctx, c), service.DeleteAssetInput{FileID: req.FileId, EnvironmentKey: req.EnvironmentKey, PipelineKey: req.PipelineKey, ExpectedScopeID: req.ExpectedScopeId})
	if err != nil {
		if handler.WriteAssetError(c, err) {
			return
		}
		if e, ok := service.AsScopeError(err); ok {
			c.JSON(e.HTTPStatus, map[string]any{"code": e.Code, "msg": "error", "error": e.Message, "error_type": e.ErrorType})
			return
		}
		if e, ok := service.AsFreezeError(err); ok {
			c.JSON(e.HTTPStatus, map[string]any{"code": e.Code, "msg": "error", "error": e.Message, "error_type": e.ErrorType})
			return
		}
		if e, ok := service.AsAuthError(err); ok {
			c.JSON(e.HTTPStatus, map[string]any{"code": e.Code, "msg": "error", "error": e.Error(), "error_type": e.ErrorType})
			return
		}
		c.JSON(500, map[string]any{"code": 500, "msg": "error", "error": "resource deletion failed"})
		return
	}
	// Explicit booleans are part of this API even when their value is false.
	c.JSON(200, map[string]any{"code": 200, "msg": "OK", "data": result})
}
