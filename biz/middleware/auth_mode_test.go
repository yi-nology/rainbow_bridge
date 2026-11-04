package middleware

import (
	"context"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"strings"
	"testing"
)

func TestDisabledManagementAndCORS(t *testing.T) {
	off := false
	cfg := &config.Config{}
	cfg.Auth.Enabled = &off
	s := service.NewService(nil, nil, "", cfg)
	h := server.New()
	h.Use(CORS(&config.CORSConfig{AllowOrigin: "*", AllowCredentials: true}, nil, "", false))
	h.Use(AdminSession(s, ""))
	h.POST("/api/v1/test", func(ctx context.Context, c *app.RequestContext) {
		id, ok := service.AdminIdentityFrom(ctx)
		if !ok || id.UserID != 0 || id.Username != "anonymous-admin" {
			c.Status(500)
			return
		}
		c.Status(200)
	})
	r := ut.PerformRequest(h.Engine, "POST", "/api/v1/test", &ut.Body{Body: strings.NewReader("{}"), Len: 2}, ut.Header{Key: "Authorization", Value: "Bearer invalid"}, ut.Header{Key: "Cookie", Value: "rb_admin_session=old"}, ut.Header{Key: "Origin", Value: "http://untrusted"})
	if r.Code != 200 {
		t.Fatalf("HTTP %d %s", r.Code, r.Body.String())
	}
	if string(r.Header().Peek("Access-Control-Allow-Origin")) != "*" || string(r.Header().Peek("Access-Control-Allow-Credentials")) != "false" {
		t.Fatal("invalid wildcard credentials CORS")
	}
}
