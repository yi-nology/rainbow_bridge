package config

// DistributedBackupConfig contains only the application's read-only control identity.
// Operator database/Kubernetes credentials belong to the external CLI configuration.
type DistributedBackupConfig struct {
	WebEnabled        bool   `yaml:"web_enabled"`
	AuthDSN           string `yaml:"auth_dsn"`
	Enabled           bool   `yaml:"enabled"`
	ControlDSN        string `yaml:"control_dsn"`
	InstanceID        string `yaml:"instance_id"`
	Generation        int64  `yaml:"generation"`
	SessionGeneration int64  `yaml:"session_generation"`
}
