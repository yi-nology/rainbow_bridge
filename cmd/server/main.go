package main

import (
	"flag"
	"log"

	appinit "github.com/yi-nology/rainbow_bridge/internal/app"
	bizrouter "github.com/yi-nology/rainbow_bridge/biz/router"
)

var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	application, err := appinit.Initialize(*configPath, appinit.BuildConfig{
		Version:   Version,
		GitCommit: GitCommit,
		BuildTime: BuildTime,
	})
	if err != nil {
		log.Fatalf("initialize app: %v", err)
	}

	bizrouter.GeneratedRegister(application.H)

	log.Printf("API server listening at %s (no frontend)", application.Config.Server.Address)
	application.H.Spin()
}
