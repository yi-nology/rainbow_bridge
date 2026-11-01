// Package businesshost supervises a fixed business child without stopping its Pod.
// Neither control requests nor configuration can select a shell or executable.
package businesshost

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"
)

const Protocol = "pod-sidecar-v1"

type Command struct {
	Instance, PodUID, Operation, Action, ConfigSHA string
	Token                                          int64
}

type Status struct {
	Protocol, PodUID, BootID, RunID, State, ConfigSHA string
	Operation                                         string
	Token                                             int64
	ExitCode                                          *int
}

func signature(key []byte, timestamp, method, path string, body []byte) string {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(timestamp + "\n" + method + "\n" + path + "\n"))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

// Sign binds the complete command and requested Pod to the internal channel.
func Sign(r *http.Request, body []byte, key []byte, now time.Time) {
	t := strconv.FormatInt(now.Unix(), 10)
	r.Header.Set("X-Rainbow-Host-Time", t)
	r.Header.Set("X-Rainbow-Host-Signature", signature(key, t, r.Method, r.URL.RequestURI(), body))
}

func authenticate(r *http.Request, body, key []byte, now time.Time) error {
	t := r.Header.Get("X-Rainbow-Host-Time")
	seconds, e := strconv.ParseInt(t, 10, 64)
	if e != nil || len(key) < 32 || now.Sub(time.Unix(seconds, 0)) > 30*time.Second || time.Unix(seconds, 0).Sub(now) > 30*time.Second {
		return errors.New("internal authentication failed")
	}
	got, e := hex.DecodeString(r.Header.Get("X-Rainbow-Host-Signature"))
	want, _ := hex.DecodeString(signature(key, t, r.Method, r.URL.RequestURI(), body))
	if e != nil || !hmac.Equal(got, want) {
		return errors.New("internal authentication failed")
	}
	return nil
}

func Authenticate(r *http.Request, body, key []byte) error {
	return authenticate(r, body, key, time.Now())
}

func decodeCommand(body []byte) (Command, error) {
	var c Command
	e := json.Unmarshal(body, &c)
	if e != nil || c.Instance == "" || c.PodUID == "" {
		return c, errors.New("invalid host command")
	}
	if c.Action != "status" && c.Action != "stop" && c.Action != "start" {
		return c, errors.New("invalid host action")
	}
	if c.Action != "status" && (c.Operation == "" || c.Token < 1) {
		return c, errors.New("missing operation identity")
	}
	return c, nil
}
