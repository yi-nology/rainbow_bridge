package constants

// SystemBusinessKey is the reserved business key for system-wide configurations.
const SystemBusinessKey = "system"

// System configuration aliases that are protected from deletion.
const (
	SysConfigBusinessSelect = "business_select"
	SysConfigSystemKeys     = "system_keys"
)

// ProtectedSystemConfigs contains system configuration aliases that cannot be deleted.
var ProtectedSystemConfigs = map[string]bool{
	SysConfigBusinessSelect: true,
	SysConfigSystemKeys:     true,
}

// IsProtectedSystemConfig returns true if the given alias is a protected system configuration.
func IsProtectedSystemConfig(alias string) bool {
	return ProtectedSystemConfigs[alias]
}

// Default values for system configs when initializing a new environment.
const (
	DefaultBusinessSelect = "default"
	DefaultSystemKeys     = `{"logo":"logo"}`
)

// DefaultSystemConfigRemark provides default remarks for system config keys.
var DefaultSystemConfigRemark = map[string]string{
	SysConfigBusinessSelect: "系统选择的业务",
	SysConfigSystemKeys:     "系统配置选项",
}
