package auth

import (
	"context"
	"encoding/json"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"testing"
)

func TestMeDisabledContract(t *testing.T) {
	off := false
	cfg := &config.Config{}
	cfg.Auth.Enabled = &off
	s := service.NewService(nil, nil, "", cfg)
	old := svc
	SetService(s)
	defer SetService(old)
	h := server.New()
	h.GET("/me", Me)
	r := ut.PerformRequest(h.Engine, "GET", "/me", nil, ut.Header{Key: "Cookie", Value: "rb_admin_session=old"}, ut.Header{Key: "Origin", Value: "http://unknown"})
	var body struct {
		Code int            `json:"code"`
		Data map[string]any `json:"data"`
	}
	if json.Unmarshal(r.Body.Bytes(), &body) != nil || r.Code != 200 || body.Code != 0 || body.Data["auth_enabled"] != false || body.Data["session"] != nil || body.Data["csrf_token"] != "" || body.Data["access_scope"] != "admin" {
		t.Fatalf("unexpected me: %d %s", r.Code, r.Body.String())
	}
	if _, err := s.AdminIdentityForRequest(context.Background(), service.AuthRequestInput{}, true); err != nil {
		t.Fatal(err)
	}
}
