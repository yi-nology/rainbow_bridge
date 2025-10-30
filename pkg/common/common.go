package common

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// CommonResponse is a lightweight response wrapper used by HTTP handlers.
type CommonResponse struct {
	Code  int         `json:"code"`
	Msg   string      `json:"msg,omitempty"`
	Error string      `json:"error,omitempty"`
	Data  interface{} `json:"data,omitempty"`
}

// ReturnOK creates a HTTP 200 response.
func (CommonResponse) ReturnOK() CommonResponse {
	return CommonResponse{Code: 200}
}

var (
	versionRegexp = regexp.MustCompile(`^\d+(\.\d+){0,2}$`)

	ErrInvalidVersion = errors.New("version must follow semantic format such as 1.0.0")
)

// ValidateVersion ensures the supplied version string matches a semantic pattern.
func ValidateVersion(version string) error {
	if version == "" {
		return ErrInvalidVersion
	}
	if !versionRegexp.MatchString(version) {
		return ErrInvalidVersion
	}
	return nil
}

// VersionToNumber converts a semantic version (major.minor.patch) into a sortable integer.
func VersionToNumber(version string) int64 {
	if version == "" {
		return 0
	}
	parts := strings.Split(version, ".")
	var numbers [3]int64
	for i := 0; i < len(parts) && i < 3; i++ {
		if n, err := strconv.ParseInt(parts[i], 10, 64); err == nil {
			numbers[i] = n
		}
	}
	return numbers[0]*1_000_000 + numbers[1]*1_000 + numbers[2]
}

// NumberToVersion converts a sortable integer back to semantic version string.
func NumberToVersion(n int64) string {
	if n <= 0 {
		return "0.0.0"
	}
	major := n / 1_000_000
	minor := (n % 1_000_000) / 1_000
	patch := n % 1_000
	return fmt.Sprintf("%d.%d.%d", major, minor, patch)
}

// GetMD5Hash returns the lowercase hex MD5 hash of the input.
func GetMD5Hash(input string) string {
	sum := md5.Sum([]byte(input))
	return hex.EncodeToString(sum[:])
}

type contextKey string

const (
	userIDKey        contextKey = "user_id"
	clientVersionKey contextKey = "client_version"
)

// ContextWithUserID stores user ID into context.
func ContextWithUserID(ctx context.Context, id int) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

// GetUserID retrieves the user ID from context.
func GetUserID(ctx context.Context) (int, bool) {
	v := ctx.Value(userIDKey)
	if v == nil {
		return 0, false
	}
	switch val := v.(type) {
	case int:
		return val, true
	case int64:
		return int(val), true
	case string:
		id, err := strconv.Atoi(val)
		if err != nil {
			return 0, false
		}
		return id, true
	default:
		return 0, false
	}
}

// ContextWithClientVersion stores client version info into context.
func ContextWithClientVersion(ctx context.Context, version string) context.Context {
	return context.WithValue(ctx, clientVersionKey, version)
}

// GetClientVersion retrieves client version from context.
func GetClientVersion(ctx context.Context) string {
	v := ctx.Value(clientVersionKey)
	if v == nil {
		return ""
	}
	if version, ok := v.(string); ok {
		return version
	}
	return ""
}
