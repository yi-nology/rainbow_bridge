package router

import (
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/yi-nology/rainbow_bridge/biz/handler"
)

// RegisterResourceRoutes configures HTTP routes for resource APIs.
func RegisterResourceRoutes(r *server.Hertz, h *handler.ResourceHandler) {
	if h == nil {
		return
	}

	v1 := r.Group("/api/v1")

	resources := v1.Group("/resources")
	resources.POST("/upload", h.UploadFile)
	resources.GET("/nginx-config", h.GetRealtimeStaticConfig)
	v1.GET("/files/:fileID", h.GetFile)

	r.GET("/ping", handler.Ping)
}
