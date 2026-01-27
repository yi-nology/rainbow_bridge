package version

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
	version "github.com/yi-nology/rainbow_bridge/biz/model/version"
)

var (
	// Version information, injected at build time via main package
	AppVersion   = "dev"
	AppGitCommit = "unknown"
	AppBuildTime = "unknown"
)

// GetVersion .
// @router /api/v1/version [GET]
func GetVersion(ctx context.Context, c *app.RequestContext) {
	var err error
	var req version.VersionRequest
	err = c.BindAndValidate(&req)
	if err != nil {
		c.String(consts.StatusBadRequest, err.Error())
		return
	}

	resp := &version.VersionResponse{
		OperateResponse: &common.OperateResponse{
			Code: consts.StatusOK,
			Msg:  "success",
		},
		VersionInfo: &version.VersionInfo{
			Version:   AppVersion,
			GitCommit: AppGitCommit,
			BuildTime: AppBuildTime,
		},
	}

	c.JSON(consts.StatusOK, resp)
}
