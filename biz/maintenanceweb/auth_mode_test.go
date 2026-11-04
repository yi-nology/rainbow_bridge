package maintenanceweb

import (
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"strings"
	"testing"
)

func TestDisabledMaintenanceReachesValidation(t *testing.T) {
	off := false
	cfg := &config.Config{}
	cfg.Auth.Enabled = &off
	s := service.NewService(nil, nil, "", cfg)
	api := &HTTP{Auth: s}
	h := server.New()
	h.GET("/capabilities", api.Serve("discovery"))
	h.POST("/plan", api.Serve("plan"))
	r := ut.PerformRequest(h.Engine, "GET", "/capabilities", nil)
	if r.Code != 200 {
		t.Fatalf("read %d", r.Code)
	}
	r = ut.PerformRequest(h.Engine, "POST", "/plan", &ut.Body{Body: strings.NewReader("{}"), Len: 2}, ut.Header{Key: "Authorization", Value: "Bearer old"})
	if r.Code != 415 || strings.Contains(r.Body.String(), "AUTH_") {
		t.Fatalf("validation %d %s", r.Code, r.Body.String())
	}
	if len(r.Header().Peek("Set-Cookie")) != 0 {
		t.Fatal("anonymous result cookie issued")
	}
}
