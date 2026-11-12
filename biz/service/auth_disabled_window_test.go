package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// TestLoginMintsNoSessionWhileAuthDisabled 钉住 docs/operations/auth-disabled.md
// 的承诺:「免鉴权期间没有生成持久会话,刷新网页后恢复原登录流程」(issue #31)。
// 窗口期里签发的会话是一条凭据版本匹配的正常 admin 会话,恢复鉴权后依旧有效。
func TestLoginMintsNoSessionWhileAuthDisabled(t *testing.T) {
	f := newSessionFixture(t)
	ctx := context.Background()

	settings := f.svc.AuthSettings()
	off := false
	settings.Enabled = &off
	f.svc.SetAuthSettings(settings)

	var before int64
	if err := f.svc.authenticationDB().Model(&model.AuthSession{}).Count(&before).Error; err != nil {
		t.Fatal(err)
	}

	result, err := f.svc.Login(ctx, AuthLoginInput{
		Username:  sessionTestUser,
		Password:  sessionTestPassword,
		ClientIP:  "127.0.0.1",
		Origin:    "http://127.0.0.1:18081",
		HasOrigin: true,
	})
	if err == nil {
		t.Fatal("login accepted while authentication is disabled")
	}
	if result != nil {
		t.Fatalf("login returned a session while authentication is disabled: %+v", result)
	}
	var authErr *AuthError
	if !errors.As(err, &authErr) || authErr.HTTPStatus != 400 {
		t.Fatalf("expected a 400 AuthError for auth-free login, got %v", err)
	}

	var after int64
	if err := f.svc.authenticationDB().Model(&model.AuthSession{}).Count(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Fatalf("auth-free window minted sessions: before=%d after=%d", before, after)
	}

	// 恢复鉴权后原登录流程照常:同实例、同账号可正常登录并读取身份。
	on := true
	settings.Enabled = &on
	f.svc.SetAuthSettings(settings)
	login := f.login(t)
	me, err := f.me(t, login.Token)
	if err != nil || me.User.Username != sessionTestUser {
		t.Fatalf("login after re-enabling authentication broken: %+v %v", me, err)
	}
}

// TestAuthBootstrapPreconditionSurvivesAuthFreeStart 钉住 issue #32:免鉴权启动
// 不得跳过「账号表为空」前置检查。零管理员实例按文档恢复鉴权(两处设回 true)时
// 不能以 RAINBOW_ADMIN_INITIAL_PASSWORD is required 启动失败。
func TestAuthBootstrapPreconditionSurvivesAuthFreeStart(t *testing.T) {
	t.Chdir(t.TempDir())
	conn, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "auth-bootstrap.db")+"?_pragma=busy_timeout(10000)"),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB, err := conn.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	if err := conn.AutoMigrate(&model.AuthUser{}, &model.AuthSession{}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(conn, nil, "", nil)
	off := false
	svc.SetAuthSettings(AuthSettings{
		CookieName:      "rb_admin_auth_dev",
		CookieSecure:    false,
		IdleTimeout:     time.Hour,
		AbsoluteTimeout: 4 * time.Hour,
		TrustedOrigins:  []string{"http://127.0.0.1:18081"},
		Enabled:         &off,
	})
	ctx := context.Background()

	// 首次部署即以免鉴权启动:空账号表不失败、不创建管理员。
	if err := svc.EnsureAuthBootstrap(ctx); err != nil {
		t.Fatalf("auth-free bootstrap on empty account table must not fail: %v", err)
	}
	var users int64
	if err := conn.Model(&model.AuthUser{}).Count(&users).Error; err != nil {
		t.Fatal(err)
	}
	if users != 0 {
		t.Fatalf("auth-free bootstrap created admin accounts: %d", users)
	}

	// 按文档恢复鉴权:首次密码此时是恢复路径的必要条件,提供后启动照常完成。
	t.Setenv(AdminInitialPasswordEnv, "restore passphrase value")
	on := true
	settings := svc.AuthSettings()
	settings.Enabled = &on
	svc.SetAuthSettings(settings)
	if err := svc.EnsureAuthBootstrap(ctx); err != nil {
		t.Fatalf("restored bootstrap failed with %s flow: %v", AdminInitialPasswordEnv, err)
	}
	if err := conn.Model(&model.AuthUser{}).Count(&users).Error; err != nil {
		t.Fatal(err)
	}
	if users != 1 {
		t.Fatalf("restore bootstrap did not create exactly one admin: %d", users)
	}
}
