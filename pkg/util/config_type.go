package util

import "strings"

// ConfigType constants define the supported configuration types.
const (
	ConfigTypeImage  = "image"
	ConfigTypeText   = "text"
	ConfigTypeColor  = "color"
	ConfigTypeConfig = "config"
)

// NormalizeConfigType normalizes various input type strings to standard types.
// Returns one of: "image", "text", "color", "config" (default).
func NormalizeConfigType(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "image":
		return ConfigTypeImage
	case "text", "string", "copy", "文案":
		return ConfigTypeText
	case "color", "colour", "color_tag", "color-tag", "色彩", "色彩标签":
		return ConfigTypeColor
	default:
		return ConfigTypeConfig
	}
}

// DisplayConfigType returns a human-readable display name for the config type.
func DisplayConfigType(t string) string {
	switch NormalizeConfigType(t) {
	case ConfigTypeImage:
		return "图片"
	case ConfigTypeText:
		return "文案"
	case ConfigTypeColor:
		return "色彩标签"
	default:
		return "配置对象"
	}
}

// IsValidConfigType checks if the given type is a valid normalized config type.
func IsValidConfigType(t string) bool {
	normalized := NormalizeConfigType(t)
	return normalized == ConfigTypeImage ||
		normalized == ConfigTypeText ||
		normalized == ConfigTypeColor ||
		normalized == ConfigTypeConfig
}
