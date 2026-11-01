package service

import (
	"context"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"testing"
)

func TestAuthenticationRepositoryDoesNotFallBackToBusiness(t *testing.T) {
	f := newSessionFixture(t)
	authDB := f.svc.logic.db
	// Repository selection is independent of the business DB connection.
	f.svc.authRepository = authDB
	f.svc.logic.db = nil
	session := f.login(t)
	if _, e := f.svc.CurrentSession(context.Background(), AuthRequestInput{SessionToken: session.Token}); e != nil {
		t.Fatal(e)
	}
	if _, e := f.svc.AdminIdentityForRequest(context.Background(), AuthRequestInput{SessionToken: session.Token, CSRFToken: session.CSRFToken}, true); e != nil {
		t.Fatal(e)
	}
	if e := f.svc.ChangePassword(context.Background(), AuthPasswordChangeInput{AuthRequestInput: AuthRequestInput{SessionToken: session.Token, CSRFToken: session.CSRFToken}, CurrentPassword: sessionTestPassword, NewPassword: sessionTestNextPass}); e != nil {
		t.Fatal(e)
	}
	if _, e := f.svc.CurrentSession(context.Background(), AuthRequestInput{SessionToken: session.Token}); e == nil {
		t.Fatal("password change did not revoke session")
	}
}
func TestWebAuthorityUnavailableNeverUsesBusinessCredentials(t *testing.T) {
	f := newSessionFixture(t)
	f.svc.config = &config.Config{}
	f.svc.config.Backup.Distributed.WebEnabled = true
	_, e := f.svc.Login(context.Background(), AuthLoginInput{Username: sessionTestUser, Password: sessionTestPassword, HasOrigin: true, Origin: "http://127.0.0.1:18081"})
	auth, ok := AsAuthError(e)
	if !ok || auth.ErrorType != ErrTypeAuthUnavailable {
		t.Fatal("missing authority did not fail closed")
	}
}
