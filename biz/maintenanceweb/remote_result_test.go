package maintenanceweb

import (
	"context"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/route/param"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"os"
	"testing"
	"time"
)

func TestRemoteResultCookieCannotElevatePermissions(t *testing.T) {
	file := os.Getenv("RB_WEB_TEST_CONFIG")
	if file == "" {
		t.Skip("requires exclusive web control fixture")
	}
	cfg, e := LoadConfig(file)
	if e != nil {
		t.Fatal(e)
	}
	if cfg.Namespace != "rb-web-20261030-01" {
		t.Fatal("exclusive namespace required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	s, e := Open(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Pool.Close()
	var id, operation string
	if e = s.Pool.QueryRow(ctx, `SELECT t.task_id::text,t.operation_id::text FROM rb_web_task t JOIN rb_maintenance_operation o USING(operation_id,instance_id) WHERE t.instance_id=$1 AND o.terminal AND o.updated_at>now()-interval '10 minutes' AND t.kind IN('restore','resume','abort') ORDER BY t.updated_at DESC LIMIT 1`, cfg.InstanceID).Scan(&id, &operation); e != nil {
		t.Fatal("fresh completed operation fixture required")
	}
	token := uuid.NewString() + uuid.NewString()
	session := uuid.NewString()
	digest := digestToken(token)
	_, e = s.Pool.Exec(ctx, `INSERT INTO rb_web_result(token_hash,instance_id,operation_id,user_id,credential_version,session_hash,expires_at) SELECT $1,$2,$3,id,credential_version,$4,now()+interval '1 hour' FROM auth_users WHERE id=1`, digest, cfg.InstanceID, operation, digestToken(session))
	if e != nil {
		t.Fatal(e)
	}
	svc, e := service.NewAuthenticationService(ctx, &cfg.App)
	if e != nil {
		t.Fatal(e)
	}
	defer svc.CloseDistributedControl()
	svc.SetAuthSettings(service.AuthSettings{CookieName: "rb_admin_session", BasePath: cfg.App.Server.BasePath, TrustedOrigins: []string{"http://127.0.0.1:18080"}, IdleTimeout: time.Hour, AbsoluteTimeout: 2 * time.Hour})
	request := func(method string, own bool) *app.RequestContext {
		c := app.NewContext(0)
		c.Request.SetMethod(method)
		c.Request.Header.SetCookie(resultCookie, token)
		c.Request.Header.Set("Origin", "http://127.0.0.1:18080")
		task := id
		if !own {
			task = uuid.NewString()
		}
		c.Params = param.Params{{Key: "task_id", Value: task}, {Key: "operation_id", Value: operation}}
		return c
	}
	positive := request("GET", true)
	if !s.resultAccess(ctx, positive, operation) {
		t.Fatal("valid result grant not accepted")
	}
	api := &HTTP{Store: s, Auth: svc}
	api.Serve("task")(ctx, positive)
	if positive.Response.StatusCode() != 200 {
		t.Fatal("result-only own task denied")
	}
	for _, action := range []string{"tasks", "by_request", "resume", "abort", "backup", "restore", "plan", "verify", "cancel"} {
		method := "POST"
		if action == "tasks" || action == "by_request" {
			method = "GET"
		}
		c := request(method, true)
		api.Serve(action)(ctx, c)
		if c.Response.StatusCode() != 401 {
			t.Fatalf("result-only elevated %s: %d", action, c.Response.StatusCode())
		}
	}
	other := request("GET", false)
	api.Serve("task")(ctx, other)
	if other.Response.StatusCode() != 401 {
		t.Fatal("result token read another task")
	}
	if s.resultAccess(ctx, request("GET", true), uuid.NewString()) {
		t.Fatal("result token read another operation")
	}
	if _, e = s.Pool.Exec(ctx, `UPDATE rb_web_result SET expires_at=now()-interval '1 second' WHERE token_hash=$1`, digest); e != nil {
		t.Fatal(e)
	}
	if s.resultAccess(ctx, request("GET", true), operation) {
		t.Fatal("expired result token accepted")
	}
	if _, e = s.Pool.Exec(ctx, `UPDATE rb_web_result SET expires_at=now()+interval '1 hour' WHERE token_hash=$1`, digest); e != nil {
		t.Fatal(e)
	}
	if e = s.RevokeResults(ctx, session); e != nil {
		t.Fatal(e)
	}
	if s.resultAccess(ctx, request("GET", true), operation) {
		t.Fatal("logout revocation not enforced")
	}
	if _, e = s.Pool.Exec(ctx, `UPDATE rb_web_result SET revoked=false WHERE token_hash=$1`, digest); e != nil {
		t.Fatal(e)
	}
	// Dedicated auth identity; console is stopped by the harness. No password/hash is read.
	auth, e := pgx.Connect(ctx, cfg.App.Backup.Distributed.AuthDSN)
	if e != nil {
		t.Fatal(e)
	}
	defer auth.Close(ctx)
	if _, e = auth.Exec(ctx, `UPDATE auth_users SET disabled=true WHERE id=1 AND role='admin'`); e != nil {
		t.Fatal(e)
	}
	defer auth.Exec(context.Background(), `UPDATE auth_users SET disabled=false WHERE id=1 AND role='admin'`)
	if s.resultAccess(ctx, request("GET", true), operation) {
		t.Fatal("disabled user retained result access")
	}
	if _, e = auth.Exec(ctx, `UPDATE auth_users SET disabled=false,credential_version=credential_version+1 WHERE id=1 AND role='admin'`); e != nil {
		t.Fatal(e)
	}
	if s.resultAccess(ctx, request("GET", true), operation) {
		t.Fatal("credential revocation retained result access")
	}
	t.Log("real PG/result HTTP: own task read only; list/other UUID/mutations denied; expiry/logout/disable/credential-version revocation enforced; credential version only increases")
}
