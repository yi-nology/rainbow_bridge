package maintenanceweb

import (
	"context"
	"github.com/cloudwego/hertz/pkg/app"
	"io/fs"
	"mime"
	"path"
	"strings"
)

func Static(files fs.FS, base string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		name := strings.TrimPrefix(string(c.Path()), base)
		name = strings.TrimPrefix(name, "/")
		if strings.HasPrefix(name, "api/") {
			c.JSON(404, map[string]any{"code": 404, "msg": "接口不存在"})
			return
		}
		if !fs.ValidPath(name) || name == "." {
			name = "index.html"
		}
		data, e := fs.ReadFile(files, name)
		if e != nil && path.Ext(name) == "" {
			name = "index.html"
			data, e = fs.ReadFile(files, name)
		}
		if e != nil {
			c.String(404, "资源不存在")
			return
		}
		if name == "index.html" {
			c.Header("Cache-Control", "no-store")
		} else {
			c.Header("Cache-Control", "public,max-age=3600")
		}
		content := mime.TypeByExtension(path.Ext(name))
		if content == "" {
			content = "application/octet-stream"
		}
		c.Data(200, content, data)
	}
}
