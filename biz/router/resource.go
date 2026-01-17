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

	// ==================== Config Routes ====================
	// New paths (recommended)
	config := v1.Group("/config")
	config.POST("/create", h.AddConfig)
	config.POST("/update", h.UpdateConfig)
	config.POST("/delete", h.DeleteConfig)
	config.GET("/list", h.ListConfigs)
	config.GET("/detail", h.GetConfigDetail)

	// Legacy paths (backward compatibility)
	resources := v1.Group("/resources")
	resources.POST("", h.AddConfig)
	resources.PUT("", h.UpdateConfig)
	resources.DELETE("", h.DeleteConfig)
	resources.GET("", h.ListConfigs)
	resources.GET("/detail", h.GetConfigDetail)

	// ==================== Asset Routes ====================
	// New paths (recommended)
	asset := v1.Group("/asset")
	asset.GET("/list", h.ListAssets)
	asset.POST("/upload", h.UploadFile)
	asset.GET("/file/:fileID", h.GetFile)

	// Legacy paths (backward compatibility)
	v1.GET("/assets", h.ListAssets)
	v1.POST("/assets/upload", h.UploadFile)
	resources.POST("/upload", h.UploadFile)
	v1.GET("/files/:fileID", h.GetFile)

	// ==================== Transfer Routes ====================
	// New paths (recommended)
	transfer := v1.Group("/transfer")
	transfer.POST("/import", h.ImportConfigs)
	transfer.GET("/export", h.ExportConfigs)
	transfer.GET("/export/static/selected", h.ExportSystemSelectedStaticBundle)
	transfer.GET("/export/static/all", h.ExportStaticBundleAll)

	// Legacy paths (backward compatibility)
	resources.POST("/import", h.ImportConfigs)
	resources.GET("/export", h.ExportConfigs)
	resources.GET("/export/system-selected-static", h.ExportSystemSelectedStaticBundle)
	resources.GET("/export/all-static", h.ExportStaticBundleAll)

	// ==================== System Routes ====================
	// New paths (recommended)
	system := v1.Group("/system")
	system.GET("/init", h.GetInitData)
	system.GET("/business-keys", h.ListBusinessKeys)
	system.GET("/realtime", h.GetRealtimeStaticConfig)

	// Legacy paths (backward compatibility)
	v1.GET("/init", h.GetInitData)
	resources.GET("/business-keys", h.ListBusinessKeys)
	resources.GET("/nginx-config", h.GetRealtimeStaticConfig)

	// ==================== Health Check ====================
	r.GET("/ping", handler.Ping)
}
