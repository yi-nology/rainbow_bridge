package middleware

import (
	"context"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/pkg/common"
)

var jwtConfig *common.JWTConfig

// SetJWTConfig sets the JWT configuration for the middleware
func SetJWTConfig(config *common.JWTConfig) {
	jwtConfig = config
}

// Auth returns a middleware that extracts user information from JWT token
// and adds it to the context. This middleware does NOT enforce authentication,
// it only enriches the context with user info if present.
func Auth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		// Extract token from Authorization header
		authHeader := string(c.GetHeader("Authorization"))
		if authHeader != "" {
			// Check if the header has the Bearer prefix
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString := strings.TrimPrefix(authHeader, "Bearer ")
				if jwtConfig != nil {
					claims, err := jwtConfig.ValidateToken(tokenString)
					if err == nil {
						ctx = common.ContextWithUserID(ctx, claims.UserID)
						ctx = common.ContextWithUsername(ctx, claims.Username)
						ctx = common.ContextWithUserRole(ctx, claims.Role)
					}
				}
			}
		} else {
			// Fallback to X-User-Id header for backward compatibility
			if userHeader := c.GetHeader("X-User-Id"); len(userHeader) > 0 {
				if id, err := strconv.Atoi(string(userHeader)); err == nil && id > 0 {
					ctx = common.ContextWithUserID(ctx, id)
				}
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

// RequireAuth returns a middleware that enforces authentication using JWT.
// Requests without a valid JWT token will be rejected with 401.
func RequireAuth() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		// Extract token from Authorization header
		authHeader := string(c.GetHeader("Authorization"))
		if authHeader == "" {
			c.JSON(401, map[string]any{
				"code":  401,
				"error": "authentication required",
				"msg":   "missing Authorization header",
			})
			c.Abort()
			return
		}

		// Check if the header has the Bearer prefix
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(401, map[string]any{
				"code":  401,
				"error": "authentication required",
				"msg":   "invalid Authorization header format",
			})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if jwtConfig == nil {
			c.JSON(500, map[string]any{
				"code":  500,
				"error": "internal server error",
				"msg":   "JWT configuration not set",
			})
			c.Abort()
			return
		}

		claims, err := jwtConfig.ValidateToken(tokenString)
		if err != nil {
			c.JSON(401, map[string]any{
				"code":  401,
				"error": "authentication required",
				"msg":   "invalid or expired token",
			})
			c.Abort()
			return
		}

		ctx = common.ContextWithUserID(ctx, claims.UserID)
		ctx = common.ContextWithUsername(ctx, claims.Username)
		ctx = common.ContextWithUserRole(ctx, claims.Role)
		c.Next(ctx)
	}
}
