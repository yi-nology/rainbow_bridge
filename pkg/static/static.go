//go:build !dev
// +build !dev

package static

import (
	"embed"
	"io/fs"
)

//go:embed all:web
var webFS embed.FS

func WebFS() (fs.FS, error) {
	return fs.Sub(webFS, "web")
}

// UseEmbedFS 返回是否使用嵌入的静态文件系统
// 在正式构建中始终返回 true
func UseEmbedFS() bool {
	return true
}
