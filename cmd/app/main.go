package main

import (
	"context"
	"flag"
	"io/fs"
	"log"
	"path/filepath"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	bizrouter "github.com/yi-nology/rainbow_bridge/biz/router"
	appinit "github.com/yi-nology/rainbow_bridge/internal/app"
	"github.com/yi-nology/rainbow_bridge/pkg/static"
)

var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
	BasePath  = ""
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	application, err := appinit.Initialize(*configPath, appinit.BuildConfig{
		Version:   Version,
		GitCommit: GitCommit,
		BuildTime: BuildTime,
		BasePath:  BasePath,
	})
	if err != nil {
		log.Fatalf("initialize app: %v", err)
	}

	bizrouter.GeneratedRegister(application.H)

	setupStaticFileServer(application.H, application.BasePath)

	log.Printf("Full application listening at %s (with frontend)", application.Config.Server.Address)
	application.H.Spin()
}

func setupStaticFileServer(h *server.Hertz, basePath string) {
	webFS, err := static.WebFS()
	if err != nil {
		log.Printf("Warning: failed to load static files: %v", err)
		return
	}

	if static.UseEmbedFS() {
		log.Printf("Serving static files from embedded filesystem")
	} else {
		log.Printf("Serving static files from filesystem (dev mode)")
	}

	staticHandler := func(c context.Context, ctx *app.RequestContext) {
		path := string(ctx.URI().Path())

		if basePath != "" {
			path = strings.TrimPrefix(path, basePath)
		}

		if path == "" || path == "/" {
			path = "/index.html"
		}

		if len(path) > 0 && path[0] == '/' {
			path = path[1:]
		}

		ext := filepath.Ext(path)
		contentType := getContentType(ext)

		data, err := fs.ReadFile(webFS, path)
		if err != nil {
			ctx.Status(404)
			return
		}

		ctx.Data(200, contentType, data)
	}

	noRoute := func(c context.Context, ctx *app.RequestContext) {
		path := string(ctx.URI().Path())

		if basePath != "" {
			path = strings.TrimPrefix(path, basePath)
		}

		if strings.HasPrefix(path, "/api/") {
			ctx.Status(404)
			ctx.JSON(404, map[string]string{"error": "not found"})
			return
		}

		data, err := fs.ReadFile(webFS, "index.html")
		if err != nil {
			ctx.Status(404)
			return
		}

		ctx.Data(200, "text/html; charset=utf-8", data)
	}

	h.NoRoute(noRoute)

	staticPaths := []string{
		"/assets/*filepath",
		"/favicon.ico",
		"/vite.svg",
		"/robots.txt",
		"/icon.svg",
		"/apple-icon.png",
		"/icon-dark-32x32.png",
		"/icon-light-32x32.png",
	}

	for _, sp := range staticPaths {
		h.GET(sp, staticHandler)
		h.HEAD(sp, staticHandler)
	}
}

func getContentType(ext string) string {
	contentTypes := map[string]string{
		".html":  "text/html; charset=utf-8",
		".css":   "text/css; charset=utf-8",
		".js":    "application/javascript; charset=utf-8",
		".json":  "application/json; charset=utf-8",
		".png":   "image/png",
		".jpg":   "image/jpeg",
		".jpeg":  "image/jpeg",
		".gif":   "image/gif",
		".svg":   "image/svg+xml",
		".ico":   "image/x-icon",
		".woff":  "font/woff",
		".woff2": "font/woff2",
		".ttf":   "font/ttf",
		".eot":   "application/vnd.ms-fontobject",
	}

	if ct, ok := contentTypes[ext]; ok {
		return ct
	}
	return "application/octet-stream"
}
