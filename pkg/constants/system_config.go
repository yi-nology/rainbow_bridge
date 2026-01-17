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
