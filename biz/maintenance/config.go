// Package maintenance implements the external, fail-closed maintenance CLI.
package maintenance

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"gopkg.in/yaml.v3"
	"os"
	"regexp"
	"time"
)

type Workload struct {
	TemplateHash string            `yaml:"-"`
	Name         string            `yaml:"name"`
	UID          string            `yaml:"uid"`
	Replicas     int32             `yaml:"-"`
	Selector     map[string]string `yaml:"-"`
}
type Config struct {
	AuthReadDSN        string             `yaml:"auth_read_dsn"`
	Minio              config.MinioConfig `yaml:"minio"`
	NoUnmanagedWriters bool               `yaml:"no_unmanaged_writers"`
	InstanceID         string             `yaml:"instance_id"`
	ControlDSN         string             `yaml:"control_dsn"`
	AdminDSN           string             `yaml:"admin_dsn"`
	ApplicationRole    string             `yaml:"application_role"`
	Namespace          string             `yaml:"namespace"`
	ConfigSecret       string             `yaml:"config_secret"`
	ConfigSecretUID    string             `yaml:"config_secret_uid"`
	Workloads          []Workload         `yaml:"workloads"`
	BackupBucket       string             `yaml:"backup_bucket"`
	Kubernetes         KubeConfig         `yaml:"kubernetes"`
	// Bounded budgets are per phase, not one global 60-second request timeout.
	StopTimeout   time.Duration `yaml:"stop_timeout"`
	StreamTimeout time.Duration `yaml:"stream_timeout"`
	StartTimeout  time.Duration `yaml:"start_timeout"`
}

var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{2,62}$`)

func LoadConfig(path string) (Config, error) {
	var c Config
	b, err := os.ReadFile(path)
	if err != nil {
		return c, errors.New("无法读取维护工具配置")
	}
	if err = yaml.Unmarshal(b, &c); err != nil {
		return c, errors.New("维护工具配置格式错误")
	}
	if err = c.Validate(); err != nil {
		return c, err
	}
	return c, nil
}
func (c *Config) Validate() error {
	if c.Minio.Endpoint == "" || c.Minio.AccessKey == "" || c.Minio.SecretKey == "" {
		return errors.New("必须提供仅保存在运维配置中的独立对象存储凭据")
	}
	if !c.NoUnmanagedWriters {
		return errors.New("必须先审核并声明没有协议之外的直写者或自动调谐器")
	}
	if _, err := uuid.Parse(c.InstanceID); err != nil {
		return errors.New("instance_id 必须是固定 UUID")
	}
	for _, n := range []string{c.ApplicationRole, c.Namespace, c.ConfigSecret, c.BackupBucket} {
		if !namePattern.MatchString(n) {
			return errors.New("维护资源名称不合法")
		}
	}
	if c.ControlDSN == "" || c.AdminDSN == "" || c.ConfigSecretUID == "" || len(c.Workloads) == 0 {
		return errors.New("缺少独立控制连接、维护连接或明确工作负载归属")
	}
	seen := map[string]bool{}
	for _, w := range c.Workloads {
		if !namePattern.MatchString(w.Name) || w.UID == "" || seen[w.Name] {
			return errors.New("工作负载 allowlist 无效")
		}
		seen[w.Name] = true
	}
	if c.StopTimeout == 0 {
		c.StopTimeout = 5 * time.Minute
	}
	if c.StreamTimeout == 0 {
		c.StreamTimeout = 30 * time.Minute
	}
	if c.StartTimeout == 0 {
		c.StartTimeout = 5 * time.Minute
	}
	if c.StopTimeout < time.Second || c.StreamTimeout < time.Second || c.StartTimeout < time.Second {
		return errors.New("阶段期限必须大于一秒")
	}
	return nil
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func hashJSON(v any) string  { b, _ := json.Marshal(v); return digest(b) }

type Plan struct {
	Namespace, ConfigSecret                                string
	TableRows                                              map[string]int64
	ObjectCount                                            int
	DataBytes                                              int64
	CandidatePattern                                       string
	InstanceID                                             string
	Kind                                                   string
	Active                                                 maintcontrol.Identity
	Workloads                                              []Workload
	ConfigUID, ConfigHash                                  string
	Database, OriginalBucket, SnapshotBucket, BackupBucket string
	BackupID, ManifestSHA                                  string
	Fingerprint                                            string
}

func (p Plan) Hash() string { p.Fingerprint = ""; return hashJSON(p) }

type Executor struct{ Pod, UID string }
type Operation struct {
	ID, RequestID, Kind, Phase string
	Token                      int64
	Owner                      Executor
	Terminal                   bool
	Data                       OperationData
}
type OperationData struct {
	Progress                                           Progress
	AllowedConfigHashes                                []string
	PhaseTimes                                         map[string]time.Time
	StopDetails                                        map[string]PodExitEvidence
	ResourceAttempts                                   [][]string
	AttemptPrefixes                                    []string
	AppliedConfigHash                                  string
	StopProof                                          map[string]bool
	Plan                                               Plan
	BackupID, Prefix, ManifestSHA                      string
	CandidateDB, CandidateOriginal, CandidateSnapshots string
	OldSecret                                          string
	Target                                             maintcontrol.Identity
	Aborting                                           bool
	StartedAt                                          time.Time
}
