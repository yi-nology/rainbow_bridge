package util

import "strings"

// ConfigType constants define the supported configuration types.
const (
	ConfigTypeImage  = "image"
	ConfigTypeFile   = "file"
	ConfigTypeText   = "text"
	ConfigTypeColor  = "color"
	ConfigTypeConfig = "config"
	ConfigTypeKV     = "kv"
)

// NormalizeConfigType 只做基本的空白字符处理，不转换类型。
// 前端传什么类型就存什么类型，直接透传。
func NormalizeConfigType(t string) string {
	return strings.TrimSpace(t)
}
