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
