package middleware

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
)

// CORS returns a middleware that handles Cross-Origin Resource Sharing.
func CORS(cfg *config.CORSConfig) app.HandlerFunc {
	// Use defaults if config is nil
	allowOrigin := "*"
	allowMethods := "GET,POST,PUT,DELETE,OPTIONS"
	allowHeaders := "*"
	allowCredentials := "false"

	if cfg != nil {
		if cfg.AllowOrigin != "" {
			allowOrigin = cfg.AllowOrigin
		}
		if cfg.AllowMethods != "" {
			allowMethods = cfg.AllowMethods
		}
		if cfg.AllowHeaders != "" {
			allowHeaders = cfg.AllowHeaders
		}
		if cfg.AllowCredentials {
			allowCredentials = "true"
		}
	}

	return func(ctx context.Context, c *app.RequestContext) {
		c.Response.Header.Set("Access-Control-Allow-Origin", allowOrigin)
		c.Response.Header.Set("Access-Control-Allow-Methods", allowMethods)
		c.Response.Header.Set("Access-Control-Allow-Headers", allowHeaders)
		c.Response.Header.Set("Access-Control-Allow-Credentials", allowCredentials)

		// Handle preflight requests
		if string(c.Request.Method()) == consts.MethodOptions {
			c.AbortWithStatus(consts.StatusNoContent)
			return
		}

		c.Next(ctx)
	}
}
