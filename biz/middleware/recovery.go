package middleware

import (
	"context"
	"fmt"
	"runtime/debug"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// Recovery returns a middleware that recovers from panics and logs the error.
func Recovery() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		defer func() {
			if err := recover(); err != nil {
				// Log the panic with stack trace
				stack := debug.Stack()
				hlog.CtxErrorf(ctx, "panic recovered: %v\n%s", err, string(stack))

				// Return a generic error response
				c.JSON(consts.StatusInternalServerError, map[string]any{
					"code":  consts.StatusInternalServerError,
					"error": "internal server error",
					"msg":   fmt.Sprintf("%v", err),
				})
				c.Abort()
			}
		}()

		c.Next(ctx)
	}
}
