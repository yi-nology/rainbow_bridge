package middleware

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/hlog"
)

// Logging returns a middleware that logs request and response information.
func Logging() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		start := time.Now()

		// Process request
		c.Next(ctx)

		// Calculate latency
		latency := time.Since(start)

		// Get request details
		method := string(c.Request.Method())
		path := string(c.Request.URI().Path())
		statusCode := c.Response.StatusCode()
		clientIP := c.ClientIP()

		// Log the request
		hlog.CtxInfof(ctx, "[%s] %s %s %d %v",
			clientIP,
			method,
			path,
			statusCode,
			latency,
		)
	}
}
