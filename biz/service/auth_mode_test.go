package service

import (
	"context"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"testing"
)

func TestAuthenticationModeDefaultsAndRecovery(t *testing.T) {
	f := newSessionFixture(t)
	s := f.svc
	ctx := context.Background()
	if !s.AuthenticationEnabled() {
		t.Fatal("default must protect")
	}
	if _, err := s.AdminIdentityForRequest(ctx, AuthRequestInput{}, false); err == nil {
		t.Fatal("anonymous default accepted")
	}
	login := f.login(t)
	off := false
	settings := s.AuthSettings()
	settings.Enabled = &off
	s.SetAuthSettings(settings)
	id, err := s.AdminIdentityForRequest(ctx, AuthRequestInput{SessionToken: "stale", CSRFToken: "bad", HasOrigin: true, Origin: "http://untrusted"}, true)
	if err != nil || id.UserID != 0 || id.Username != "anonymous-admin" || id.AuthenticationSource != "disabled" {
		t.Fatalf("anonymous identity: %+v %v", id, err)
	}
	on := true
	settings.Enabled = &on
	s.SetAuthSettings(settings)
	if _, err = s.AdminIdentityForRequest(ctx, AuthRequestInput{}, false); err == nil {
		t.Fatal("true did not restore")
	}
	if _, err = s.AdminIdentityForRequest(ctx, AuthRequestInput{SessionToken: login.Token, CSRFToken: login.CSRFToken, HasOrigin: true, Origin: "http://127.0.0.1:18081"}, true); err != nil {
		t.Fatal(err)
	}
	settings.Enabled = &off
	s.SetAuthSettings(settings)
	var before, after int64
	s.authenticationDB().Table("auth_users").Count(&before)
	if err = s.EnsureAuthBootstrap(ctx); err != nil {
		t.Fatal(err)
	}
	s.authenticationDB().Table("auth_users").Count(&after)
	if before != after {
		t.Fatal("bootstrap changed account")
	}
	if !config.AuthEnabled(nil) || !config.AuthEnabled(&config.Config{}) {
		t.Fatal("nil defaults not protected")
	}
}

func TestDisabledIdentityRetainsBusinessGuards(t *testing.T) {
	s := newFreezeService(t)
	off := false
	settings := s.AuthSettings()
	settings.Enabled = &off
	s.SetAuthSettings(settings)
	identity, err := s.AdminIdentityForRequest(context.Background(), AuthRequestInput{}, true)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithAdminIdentity(context.Background(), identity)
	seedFreezeScope(t, s, "anonymous_qa", "default")
	scope, err := resolveScopeByKeys(ctx, s.logic, "anonymous_qa", "default")
	if err != nil {
		t.Fatal(err)
	}
	row, err := s.AddConfigWithIdentity(ctx, buildConfig("anonymous_qa", "default", "anonymous", "text", "before"), scope.ScopeID)
	if err != nil {
		t.Fatal(err)
	}
	row.Content = "after"
	saved, err := s.UpdateConfigWithIdentity(ctx, row, row.EditRevision, scope.ScopeID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.UpdateConfigWithIdentity(ctx, row, row.EditRevision, scope.ScopeID); err == nil {
		t.Fatal("stale edit accepted")
	}
	if _, err = s.UpdateConfigWithIdentity(ctx, saved, saved.EditRevision, "wrong"); err == nil {
		t.Fatal("wrong scope accepted")
	}
	state, err := s.LockFreezeWithIdentity(ctx, "anonymous_qa", "default", "", "0", scope.ScopeID)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteConfigWithIdentity(ctx, "anonymous_qa", "default", row.ResourceKey, scope.ScopeID); err == nil {
		t.Fatal("frozen write accepted")
	}
	if _, err = s.UnlockFreeze(ctx, "anonymous_qa", "default", "", fmtRevision(state.Revision)); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteConfigWithIdentity(ctx, "anonymous_qa", "default", row.ResourceKey, scope.ScopeID); err != nil {
		t.Fatal(err)
	}
}
