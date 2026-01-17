package middleware

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
)

// Auth returns a middleware that extracts user information from request headers
// and adds it to the context. This middleware does NOT enforce authentication,
// it only enriches the context with user info if present.
func Auth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		// Extract user ID from X-User-Id header
		if userHeader := c.GetHeader("X-User-Id"); len(userHeader) > 0 {
			if id, err := strconv.Atoi(string(userHeader)); err == nil && id > 0 {
				ctx = common.ContextWithUserID(ctx, id)
			}
		}

		// Extract client version from header or query parameter
		clientVersion := string(c.GetHeader("X-Client-Version"))
		if clientVersion == "" {
			clientVersion = c.Query("client_version")
		}
		if clientVersion != "" {
			ctx = common.ContextWithClientVersion(ctx, clientVersion)
		}

		// Continue with enriched context
		c.Next(ctx)
	}
}

// RequireAuth returns a middleware that enforces authentication.
// Requests without a valid X-User-Id header will be rejected with 401.
func RequireAuth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		userHeader := c.GetHeader("X-User-Id")
		if len(userHeader) == 0 {
			c.JSON(401, map[string]any{
				"code":  401,
				"error": "authentication required",
				"msg":   "missing X-User-Id header",
			})
			c.Abort()
			return
		}

		id, err := strconv.Atoi(string(userHeader))
		if err != nil || id <= 0 {
			c.JSON(401, map[string]any{
				"code":  401,
				"error": "authentication required",
				"msg":   "invalid X-User-Id header",
			})
			c.Abort()
			return
		}

		ctx = common.ContextWithUserID(ctx, id)
		c.Next(ctx)
	}
}
