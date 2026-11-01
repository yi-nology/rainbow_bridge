package main

import (
	"context"
	"flag"
	"github.com/yi-nology/rainbow_bridge/biz/maintenanceweb"
	"github.com/yi-nology/rainbow_bridge/pkg/maintenanceconsole"
	"log"
)

func main() {
	file := flag.String("config", "console.yaml", "独立控制服务配置")
	init := flag.Bool("initialize", false, "显式初始化")
	source := flag.String("source-config", "", "源配置")
	flag.Parse()
	cfg, e := maintenanceweb.LoadConfig(*file)
	if e == nil {
		if *init {
			e = maintenanceconsole.Initialize(context.Background(), cfg, *source)
		} else {
			e = maintenanceconsole.Serve(context.Background(), cfg)
		}
	}
	if e != nil {
		log.Fatal(e)
	}
}
