package businesshost

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestInternalCommandAuthenticationBindsBodyPathAndTime(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	now := time.Now()
	body := []byte(`{"PodUID":"one","Action":"stop"}`)
	r := httptest.NewRequest("POST", "http://host/v1/command", nil)
	Sign(r, body, key, now)
	if authenticate(r, body, key, now) != nil {
		t.Fatal("valid command rejected")
	}
	if authenticate(r, []byte(`{"PodUID":"two","Action":"stop"}`), key, now) == nil {
		t.Fatal("cross-Pod/body tamper accepted")
	}
	if authenticate(r, body, key, now.Add(time.Minute)) == nil {
		t.Fatal("stale command accepted")
	}
	r.URL.Path = "/other"
	if authenticate(r, body, key, now) == nil {
		t.Fatal("path tamper accepted")
	}
}

func TestLifecycleRequiresCurrentOperationAndToken(t *testing.T) {
	c := Control{Mode: "draining", Operation: "operation", Token: 3}
	cmd := Command{Operation: "operation", Token: 3}
	if !matchesOperation(c, cmd) {
		t.Fatal("valid current command rejected")
	}
	cmd.Token = 2
	if matchesOperation(c, cmd) {
		t.Fatal("old owner accepted")
	}
	cmd.Token = 3
	c.Mode = "active"
	if matchesOperation(c, cmd) {
		t.Fatal("active mode accepted destructive command")
	}
}
