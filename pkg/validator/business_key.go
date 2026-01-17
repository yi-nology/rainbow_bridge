package validator

import (
	"regexp"
	"strings"
)

// businessKeyRegexp defines the valid format for business keys:
// lowercase letters, numbers, underscores, and hyphens, 1-64 characters.
var businessKeyRegexp = regexp.MustCompile(`^[a-z0-9_-]{1,64}$`)

// ValidateBusinessKey checks if the given key is a valid business key.
// Valid business keys contain only lowercase letters, numbers, underscores,
// and hyphens, with a length between 1 and 64 characters.
func ValidateBusinessKey(key string) bool {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return false
	}
	return businessKeyRegexp.MatchString(trimmed)
}

// SanitizeBusinessKey trims whitespace and validates the business key.
// Returns the sanitized key and a boolean indicating if it's valid.
func SanitizeBusinessKey(key string) (string, bool) {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return "", false
	}
	if !businessKeyRegexp.MatchString(trimmed) {
		return trimmed, false
	}
	return trimmed, true
}
