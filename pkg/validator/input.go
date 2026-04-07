package validator

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// 常用的验证正则表达式
var (
	// alphaNumericRegexp 匹配字母和数字
	alphaNumericRegexp = regexp.MustCompile(`^[a-zA-Z0-9]+$`)
	
	// alphaNumericDashRegexp 匹配字母、数字、下划线和连字符
	alphaNumericDashRegexp = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	
	// emailRegexp 匹配邮箱地址
	emailRegexp = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	
	// urlRegexp 匹配URL
	urlRegexp = regexp.MustCompile(`^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$`)
)

// ValidateRequired 验证必填字段
func ValidateRequired(value string, fieldName string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New(fieldName + " is required")
	}
	return nil
}

// ValidateLength 验证字符串长度
func ValidateLength(value string, min, max int, fieldName string) error {
	length := len(strings.TrimSpace(value))
	if length < min {
		return errors.New(fieldName + " must be at least " + strconv.Itoa(min) + " characters")
	}
	if max > 0 && length > max {
		return errors.New(fieldName + " must be at most " + strconv.Itoa(max) + " characters")
	}
	return nil
}

// ValidateAlphaNumeric 验证只包含字母和数字
func ValidateAlphaNumeric(value string, fieldName string) error {
	if !alphaNumericRegexp.MatchString(value) {
		return errors.New(fieldName + " must only contain letters and numbers")
	}
	return nil
}

// ValidateAlphaNumericDash 验证只包含字母、数字、下划线和连字符
func ValidateAlphaNumericDash(value string, fieldName string) error {
	if !alphaNumericDashRegexp.MatchString(value) {
		return errors.New(fieldName + " must only contain letters, numbers, underscores, and hyphens")
	}
	return nil
}

// ValidateEmail 验证邮箱地址
func ValidateEmail(value string, fieldName string) error {
	if !emailRegexp.MatchString(value) {
		return errors.New(fieldName + " must be a valid email address")
	}
	return nil
}

// ValidateURL 验证URL
func ValidateURL(value string, fieldName string) error {
	if !urlRegexp.MatchString(value) {
		return errors.New(fieldName + " must be a valid URL")
	}
	return nil
}

// ValidateBusinessKey 验证业务键
func ValidateBusinessKey(value string, fieldName string) error {
	if err := ValidateRequired(value, fieldName); err != nil {
		return err
	}
	if err := ValidateLength(value, 1, 64, fieldName); err != nil {
		return err
	}
	if !businessKeyRegexp.MatchString(value) {
		return errors.New(fieldName + " must only contain lowercase letters, numbers, underscores, and hyphens")
	}
	return nil
}

// SanitizeString 清理字符串
func SanitizeString(value string) string {
	return strings.TrimSpace(value)
}

// ValidateConfigKey 验证配置键
func ValidateConfigKey(value string) error {
	return ValidateBusinessKey(value, "Config key")
}

// ValidateEnvironmentKey 验证环境键
func ValidateEnvironmentKey(value string) error {
	return ValidateBusinessKey(value, "Environment key")
}

// ValidatePipelineKey 验证管道键
func ValidatePipelineKey(value string) error {
	return ValidateBusinessKey(value, "Pipeline key")
}
