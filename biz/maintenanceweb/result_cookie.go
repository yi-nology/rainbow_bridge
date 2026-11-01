package maintenanceweb

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"net/http"
	"time"
)

const resultCookie = "rb_maintenance_result"

func digestToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
func (s *Store) resultAccess(ctx context.Context, c *app.RequestContext, operation string) bool {
	token := string(c.Cookie(resultCookie))
	if len(token) < 32 {
		return false
	}
	var ok bool
	e := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rb_web_result r JOIN auth_users u ON u.id=r.user_id JOIN rb_maintenance_operation o ON o.operation_id=r.operation_id WHERE r.token_hash=$1 AND r.instance_id=$2 AND r.operation_id=$3 AND NOT r.revoked AND r.expires_at>now() AND (NOT o.terminal OR o.updated_at+interval '15 minutes'>now()) AND NOT u.disabled AND u.role='admin' AND u.credential_version=r.credential_version)`, digestToken(token), s.Config.InstanceID, operation).Scan(&ok)
	return e == nil && ok
}
func (s *Store) issueResult(ctx context.Context, c *app.RequestContext, svc *service.Service, identity service.AdminIdentity, operation string) error {
	if s.resultAccess(ctx, c, operation) {
		return nil
	}
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return e
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	var done bool
	var start time.Time
	var updated time.Time
	if e := s.Pool.QueryRow(ctx, `SELECT o.terminal,LEAST((o.data->>'StartedAt')::timestamptz,(SELECT min(t.created_at) FROM rb_web_task t WHERE t.instance_id=o.instance_id AND t.operation_id=o.operation_id)),o.updated_at FROM rb_maintenance_operation o WHERE o.operation_id=$1 AND o.instance_id=$2`, operation, s.Config.InstanceID).Scan(&done, &start, &updated); e != nil {
		return e
	}
	expires := start.Add(2 * time.Hour)
	if done {
		expires = updated.Add(15 * time.Minute)
	}
	if expires.Before(time.Now()) {
		return nil
	}
	sessionHash := digestToken(string(c.Cookie(svc.AuthSettings().CookieName)))
	_, e := s.Pool.Exec(ctx, `INSERT INTO rb_web_result(token_hash,instance_id,operation_id,user_id,credential_version,session_hash,expires_at) SELECT $1,$2,$3,id,credential_version,$4,$5 FROM auth_users WHERE id=$6 AND role='admin' AND NOT disabled`, digestToken(token), s.Config.InstanceID, operation, sessionHash, expires, identity.UserID)
	if e != nil {
		return e
	}
	settings := svc.AuthSettings()
	cookie := &http.Cookie{Name: resultCookie, Value: token, Path: settings.BasePath + "/api/v1/maintenance/tasks/", Expires: expires, MaxAge: int(time.Until(expires).Seconds()), HttpOnly: true, Secure: settings.CookieSecure, SameSite: http.SameSiteLaxMode}
	c.Response.Header.Add("Set-Cookie", cookie.String())
	return nil
}
func (s *Store) RevokeResults(ctx context.Context, sessionToken string) error {
	_, e := s.Pool.Exec(ctx, `UPDATE rb_web_result SET revoked=true WHERE instance_id=$1 AND session_hash=$2`, s.Config.InstanceID, digestToken(sessionToken))
	return e
}
