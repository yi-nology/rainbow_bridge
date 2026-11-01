package middleware

import (
	"context"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"strconv"
	"strings"
)

func DistributedMaintenance(s *service.Service, cfg *config.Config, base string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		if !cfg.Backup.Distributed.Enabled {
			c.Next(ctx)
			return
		}
		checking, err := s.CheckDistributedMaintenance(ctx, true)
		if err != nil {
			c.AbortWithStatusJSON(503, map[string]any{"message": maintcontrol.ErrBlocked.Error()})
			return
		}
		path := strings.TrimPrefix(string(c.Path()), base)
		if path == "/ping" && string(c.Method()) == "GET" {
			fp, _ := maintcontrol.Fingerprint(cfg)
			c.Response.Header.Set("X-Rainbow-Maintenance-Protocol", "1")
			if cfg.Backup.Distributed.WebEnabled {
				c.Response.Header.Set("X-Rainbow-Auth-Authority", "control-v1")
			}
			c.Response.Header.Set("X-Rainbow-Generation", strconv.FormatInt(cfg.Backup.Distributed.Generation, 10))
			c.Response.Header.Set("X-Rainbow-Session-Generation", strconv.FormatInt(cfg.Backup.Distributed.SessionGeneration, 10))
			c.Response.Header.Set("X-Rainbow-Data-Fingerprint", fp)
			c.Response.Header.Set("X-Rainbow-Checking", strconv.FormatBool(checking))
		}
		if checking && !(string(c.Method()) == "GET" && (strings.HasPrefix(path, "/api/v1/runtime/") || strings.HasPrefix(path, "/api/v1/asset/file/"))) {
			c.AbortWithStatusJSON(503, map[string]any{"message": maintcontrol.ErrBlocked.Error()})
			return
		}
		done := s.TrackDistributedRequest()
		defer done()
		c.Next(ctx)
	}
}
