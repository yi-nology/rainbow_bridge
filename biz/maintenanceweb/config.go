package maintenanceweb

import (
	"errors"
	"github.com/yi-nology/rainbow_bridge/biz/maintenance"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"gopkg.in/yaml.v3"
	"os"
	"strings"
)

// Console credentials can manage only HTTP tables and fixed Jobs, never workload fencing.
type Config struct {
	ExecutionMode          string                 `yaml:"execution_mode"`
	HostSecret             string                 `yaml:"host_secret"`
	ArtifactDir            string                 `yaml:"experimental_artifact_dir"`
	NodeName               string                 `yaml:"experimental_node_name"`
	InstanceID             string                 `yaml:"instance_id"`
	DatabaseDSN            string                 `yaml:"database_dsn"`
	App                    config.Config          `yaml:"application"`
	TargetLabel            string                 `yaml:"target_label"`
	Address                string                 `yaml:"address"`
	Namespace              string                 `yaml:"namespace"`
	ExecutorSecret         string                 `yaml:"executor_secret"`
	WorkerSecret           string                 `yaml:"worker_secret"`
	ExecutorServiceAccount string                 `yaml:"executor_service_account"`
	ExecutorImage          string                 `yaml:"executor_image"`
	ExecutorCommand        string                 `yaml:"executor_command"`
	Kubernetes             maintenance.KubeConfig `yaml:"kubernetes"`
}

func LoadConfig(path string) (Config, error) {
	var c Config
	b, e := os.ReadFile(path)
	if e != nil {
		return c, errors.New("控制服务配置不可读取")
	}
	if e = yaml.Unmarshal(b, &c); e != nil {
		return c, errors.New("控制服务配置格式错误")
	}
	return c, c.Validate()
}
func (c Config) Validate() error {
	if c.ExecutionMode != "" && c.ExecutionMode != "deployment_stop" && c.ExecutionMode != "pod_sidecar" {
		return errors.New("未知维护执行模式")
	}
	if c.ExecutionMode == "pod_sidecar" && c.HostSecret == "" {
		return errors.New("同Pod模式缺少内部通道Secret引用")
	}
	if !c.validArtifacts() {
		return errors.New("候选产物挂载仅允许本轮独占实验目录")
	}
	if c.InstanceID == "" || c.DatabaseDSN == "" || c.TargetLabel == "" || c.Namespace == "" || c.ExecutorSecret == "" || c.WorkerSecret == "" || c.ExecutorServiceAccount == "" || !strings.Contains(c.ExecutorImage, "@sha256:") || c.ExecutorCommand == "" {
		return errors.New("控制服务缺少固定实例、权限或Job模板")
	}
	if !c.App.Backup.Distributed.WebEnabled || c.App.Backup.Distributed.InstanceID != c.InstanceID || c.App.Backup.Distributed.AuthDSN == "" {
		return errors.New("控制服务必须接入唯一认证权威")
	}
	return nil
}
