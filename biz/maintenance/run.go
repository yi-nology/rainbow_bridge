package maintenance

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"gopkg.in/yaml.v3"
	"strings"
	"time"
)

// Run binds execution to the reviewed plan. Resume uses the stored fingerprint,
// never fabricates a new plan while maintenance has already stopped service.
func Run(ctx context.Context, cfg Config, k *Kube, action, request, confirm, backup string) (Operation, error) {
	var data OperationData
	kind := action
	paramHash := ""
	// Identical completed and interrupted requests use their persistent plan;
	// rebuilding a plan after entering maintenance would reject valid replays.
	if action == "backup" || action == "restore" {
		if previous, e := Status(ctx, cfg, request); e == nil {
			if previous.Kind != action || previous.Data.Plan.Fingerprint != confirm || (action == "restore" && previous.Data.BackupID != backup) {
				return previous, errors.New("同 request-id 参数冲突")
			}
			if previous.Terminal {
				return previous, nil
			}
			action = "resume"
		}
	}
	if action == "resume" || action == "abort" {
		previous, err := Status(ctx, cfg, request)
		if err != nil {
			return previous, err
		}
		if previous.Terminal {
			if action == "abort" {
				return previous, errors.New("已开放新写入，拒绝自动退回旧库")
			}
			return previous, nil
		}
		kind = previous.Kind
		data = previous.Data
		paramHash = data.Plan.Fingerprint
		if confirm != paramHash {
			return previous, errors.New("接续必须确认原计划 fingerprint")
		}
	} else {
		plan, err := BuildPlan(ctx, cfg, k, kind, backup)
		if err != nil {
			return Operation{}, err
		}
		if confirm != plan.Fingerprint {
			return Operation{}, errors.New("计划已变化或缺少精确确认；重新运行 plan")
		}
		paramHash = plan.Fingerprint
		data = OperationData{Plan: plan, BackupID: backup, StartedAt: time.Now().UTC()}
		if kind == "backup" {
			data.BackupID = uuid.NewString()
		}
	}
	owner, err := k.Executor(ctx, cfg.InstanceID)
	if err != nil {
		return Operation{}, err
	}
	l, err := Acquire(ctx, cfg, request, kind, paramHash, owner, data, k.ProveExecutorStopped)
	if err != nil {
		return Operation{}, err
	}
	defer l.Close()
	if l.Op.Terminal {
		return l.Op, nil
	}
	ctx, cancel, err := l.WatchLock(ctx)
	if err != nil {
		return l.Op, err
	}
	defer cancel()
	if l.Op.Data.OldSecret == "" {
		l.Op.Data.OldSecret = "rb-maint-" + l.Op.ID + "-old"
		if err = l.Save(ctx, "claimed"); err != nil {
			return l.Op, err
		}
	}
	if l.Op.Phase == "claimed" {
		if kind == "backup" {
			if _, err = l.conn.Exec(ctx, `INSERT INTO rb_maintenance_backup(backup_id,instance_id,operation_id,prefix,manifest_sha,state) VALUES($1,$2,$3,'','','pending') ON CONFLICT DO NOTHING`, l.Op.Data.BackupID, cfg.InstanceID, l.Op.ID); err != nil {
				return l.Op, errors.New("备份 pending 索引登记失败")
			}
		}
		if err = k.saveOldConfig(ctx, l); err != nil {
			return l.Op, err
		}
	}
	old, err := k.oldConfig(ctx, l)
	if err != nil {
		return l.Op, err
	}
	var app config.Config
	if yaml.Unmarshal(old, &app) != nil {
		return l.Op, errors.New("受限旧配置解析失败")
	}
	if err = checkOperator(ctx, cfg, &app); err != nil {
		return l.Op, err
	}
	if err = validateContinuation(cfg, l.Op.Data.Plan); err != nil {
		return l.Op, err
	}
	store, err := NewOperatorStore(&app, cfg)
	if err != nil {
		return l.Op, err
	}
	if action == "abort" && !l.Op.Data.Aborting {
		if err = l.beginAbort(ctx); err != nil {
			return l.Op, err
		}
	}
	if l.Op.Data.Aborting {
		if err = k.Stop(ctx, l); err != nil {
			return l.Op, err
		}
		if err = fence(ctx, l, &app, false); err != nil {
			return l.Op, err
		}
		if err = l.reserveGeneration(ctx); err != nil {
			return l.Op, err
		}
		err = Switch(ctx, l, k, &app, old)
		return l.Op, err
	}
	if l.Op.Phase == "claimed" || l.Op.Phase == "stopping" || l.Op.Phase == "stopped" {
		if err = k.Stop(ctx, l); err != nil {
			return l.Op, err
		}
		if err = fence(ctx, l, &app, false); err != nil {
			return l.Op, err
		}
		if err = l.Save(ctx, "fenced"); err != nil {
			return l.Op, err
		}
	}
	if kind == "backup" {
		switch l.Op.Phase {
		case "fenced", "copying":
			err = BuildBackup(ctx, l, &app, store)
		case "manifest_written":
			err = publishBackup(ctx, l)
		}
		if err != nil {
			return l.Op, err
		}
	} else {
		if l.Op.Phase == "fenced" || l.Op.Phase == "preparing" || strings.HasPrefix(l.Op.Phase, "candidate_") {
			m, sha, e := LoadManifest(ctx, cfg, store, l.Op.Data.BackupID)
			if e != nil {
				return l.Op, e
			}
			if sha != l.Op.Data.Plan.ManifestSHA {
				return l.Op, errors.New("备份摘要与确认计划不同")
			}
			if err = l.reserveGeneration(ctx); err != nil {
				return l.Op, err
			}
			if len(l.Op.Data.ResourceAttempts) >= 10 {
				return l.Op, errors.New("候选重试资源达到限额，需 abort 后逐项处理残留")
			}
			id := strings.ReplaceAll(uuid.NewString(), "-", "")
			l.Op.Data.CandidateDB = "rb_restore_" + id
			bucketPrefix := "rb-r-" + strings.ReplaceAll(cfg.InstanceID, "-", "") + "-" + id[:20]
			l.Op.Data.CandidateOriginal = bucketPrefix + "-o"
			l.Op.Data.CandidateSnapshots = bucketPrefix + "-s"
			l.Op.Data.ResourceAttempts = append(l.Op.Data.ResourceAttempts, []string{l.Op.Data.CandidateDB, l.Op.Data.CandidateOriginal, l.Op.Data.CandidateSnapshots})
			l.resetProgress()
			if err = l.Save(ctx, "preparing"); err != nil {
				return l.Op, err
			}
			if err = PrepareCandidate(ctx, l, &app, store, m); err != nil {
				return l.Op, err
			}
		}
	}
	if l.Op.Phase != "available" && l.Op.Phase != "prepared" && l.Op.Phase != "configuration_switching" && l.Op.Phase != "configuration_switched" && l.Op.Phase != "starting" && l.Op.Phase != "checked" {
		return l.Op, errors.New("当前阶段尚不满足切换条件")
	}
	err = Switch(ctx, l, k, &app, old)
	return l.Op, err
}
