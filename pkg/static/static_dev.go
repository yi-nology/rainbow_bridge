//go:build dev
// +build dev

package static

import (
	"io/fs"
	"os"
)

// WebFS 在开发模式下从文件系统加载静态文件
// 优先从 vue/dist 目录加载（Vite 构建输出）
// 如果不存在，则尝试从 pkg/static/web 加载
func WebFS() (fs.FS, error) {
	// 尝试多个可能的路径
	possiblePaths := []string{
		"vue/dist",       // 开发时 Vite 输出目录
		"pkg/static/web", // 嵌入目录
		"web",            // 备选目录
	}

	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			return os.DirFS(path), nil
		}
	}

	// 如果都找不到，返回当前目录的 web 子目录
	return os.DirFS("web"), nil
}

// UseEmbedFS 返回是否使用嵌入的静态文件系统
// 在开发模式下返回 false，表示从文件系统加载
func UseEmbedFS() bool {
	return false
}
