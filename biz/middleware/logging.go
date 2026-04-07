package middleware

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/hlog"
)

// Logging returns a middleware that logs request and response information with structured data.
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
		userAgent := string(c.Request.Header.UserAgent())
		contentType := string(c.Request.Header.Get("Content-Type"))

		// Log the request with structured data
		hlog.CtxInfof(ctx, "%s %s %d %v %s %s %s",
			method,
			path,
			statusCode,
			latency,
			clientIP,
			userAgent,
			contentType,
		)
	}
}
