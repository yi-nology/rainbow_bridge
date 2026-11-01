package maintenance

import (
	"errors"
)

func validateContinuation(c Config, p Plan) error {
	if c.ExecutionMode != p.ExecutionMode {
		return errors.New("接续生命周期模式与原计划不一致")
	}
	if c.InstanceID != p.InstanceID || c.Namespace != p.Namespace || c.ConfigSecret != p.ConfigSecret || c.ConfigSecretUID != p.ConfigUID || c.BackupBucket != p.BackupBucket || len(c.Workloads) != len(p.Workloads) {
		return errors.New("运维配置与原确认计划不一致")
	}
	for _, w := range p.Workloads {
		found := false
		for _, allowed := range c.Workloads {
			if w.Name == allowed.Name && w.UID == allowed.UID {
				found = true
				break
			}
		}
		if !found {
			return errors.New("原工作负载已不在当前 allowlist")
		}
	}
	return nil
}
