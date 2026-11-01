package maintenanceweb

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/biz/maintenance"
	"github.com/yi-nology/rainbow_bridge/pkg/businesshost"
	"os"
	"time"
)

func publicPhase(phase string) string {
	switch phase {
	case "claimed", "stopping", "stopped", "fenced":
		return "draining"
	case "copying":
		return "copying"
	case "manifest_written", "available":
		return "verifying"
	case "preparing", "candidate_db_created", "candidate_resources_created", "prepared":
		return "preparing"
	case "configuration_switching", "configuration_switched":
		return "switching"
	case "starting", "checked":
		return "checking"
	case "completed", "aborted":
		return "completed"
	}
	return "queued"
}
func (s *Store) Operation(ctx context.Context, id string) (Operation, error) {
	var v Operation
	var data []byte
	var done bool
	var phase, mode string
	var updated time.Time
	if _, e := uuid.Parse(id); e != nil {
		return v, failure(404, "NOT_FOUND", "操作不存在")
	}
	e := s.Pool.QueryRow(ctx, `SELECT o.operation_id::text,o.kind,o.phase,o.terminal,o.updated_at,o.data,i.mode FROM rb_maintenance_operation o JOIN rb_maintenance_instance i USING(instance_id) WHERE o.instance_id=$1 AND o.operation_id=$2`, s.Config.InstanceID, id).Scan(&v.OperationID, &v.Kind, &phase, &done, &updated, &data, &mode)
	if errors.Is(e, pgx.ErrNoRows) {
		return v, failure(404, "NOT_FOUND", "操作不存在")
	}
	if e != nil {
		return v, e
	}
	v.Revision = decimal(updated.UnixMicro())
	v.State = "running"
	v.MaintenanceActive = mode != "active"
	v.WritesOpened = done
	v.BusinessAvailable = false
	v.AllowedActions = []string{}
	v.BlockingReasons = []Issue{}
	var result []byte
	var latestState string
	if e = s.Pool.QueryRow(ctx, `SELECT result,state FROM rb_web_task WHERE instance_id=$1 AND operation_id=$2 ORDER BY updated_at DESC LIMIT 1`, s.Config.InstanceID, id).Scan(&result, &latestState); e == nil {
		var r Result
		_ = json.Unmarshal(result, &r)
		v.BusinessAvailable = r.BusinessAvailable != nil && *r.BusinessAvailable && mode == "active"
	}
	if done {
		v.State = "succeeded"
		if phase == "aborted" {
			v.State = "cancelled"
		}
		if v.BusinessAvailable {
			return v, nil
		}
		v.State = "blocked"
		v.BlockingReasons = append(v.BlockingReasons, Issue{"BUSINESS_NOT_CONFIRMED", "控制提交已完成，需继续核对业务就绪；不能回退旧库"})
	}
	var owner maintenance.Executor
	if e = s.Pool.QueryRow(ctx, `SELECT owner FROM rb_maintenance_operation WHERE operation_id=$1`, id).Scan(&data); e != nil {
		return v, e
	}
	if json.Unmarshal(data, &owner) != nil {
		return v, errors.New("执行者状态无效")
	}
	k, e := maintenance.NewKube(s.Config.Kubernetes, s.Config.Namespace)
	if e == nil {
		e = k.ProveExecutorStopped(ctx, owner)
	}
	if e == nil {
		v.State = "interrupted"
		v.AllowedActions = []string{"resume", "abort"}
		if done {
			v.State = "blocked"
			v.AllowedActions = []string{"resume"}
		}
	} else if latestState == "interrupted" || latestState == "blocked" {
		v.State = "blocked"
		v.BlockingReasons = append(v.BlockingReasons, Issue{"EXECUTOR_NOT_STOPPED", "执行者尚未确认退出；不能接管或回退"})
	}
	return v, nil
}
func (s *Store) Task(ctx context.Context, id string, byRequest bool) (Task, *Operation, error) {
	t, e := s.task(ctx, id, byRequest)
	if e != nil {
		return t.Task, nil, e
	}
	if t.OperationID == nil {
		return t.Task, nil, nil
	}
	op, e := s.Operation(ctx, *t.OperationID)
	if e != nil {
		return t.Task, nil, e
	}
	t.AllowedActions = op.AllowedActions
	return t.Task, &op, nil
}
func (s *Store) Capabilities(ctx context.Context) Capabilities {
	v := Capabilities{Mode: "maintenance_web", ContractVersion: 1, Supported: true, Reasons: []Issue{}, Actions: map[string]bool{}}
	v.Limits.PlanTTLSeconds = 600
	v.Limits.TaskDeadlineSeconds = 7200
	var mode string
	var pending bool
	e := s.Pool.QueryRow(ctx, `SELECT mode,operation_id::text FROM rb_maintenance_instance WHERE instance_id=$1`, s.Config.InstanceID).Scan(&mode, &v.Maintenance.OperationID)
	if e != nil {
		v.Reasons = append(v.Reasons, Issue{"CONTROL_UNAVAILABLE", "控制服务暂不可用"})
		return v
	}
	v.Maintenance.Active = mode != "active"
	v.Maintenance.BusinessAvailable = mode == "active"
	if e = s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rb_web_task WHERE instance_id=$1 AND state IN('queued','running'))`, s.Config.InstanceID).Scan(&pending); e != nil {
		return v
	}
	k, e := newCluster(s.Config)
	if e == nil {
		_, status, err := k.request(ctx, "GET", k.jobPath("")+"?limit=1", nil)
		if err != nil || status != 200 {
			e = errors.New("job permission unavailable")
		}
		if e == nil {
			review, status, err := k.request(ctx, "POST", "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", map[string]any{"apiVersion": "authorization.k8s.io/v1", "kind": "SelfSubjectAccessReview", "spec": map[string]any{"resourceAttributes": map[string]string{"namespace": s.Config.Namespace, "verb": "create", "group": "batch", "resource": "jobs"}}})
			allowed, _ := object(review, "status")["allowed"].(bool)
			if err != nil || status != 201 || !allowed {
				e = errors.New("job create permission unavailable")
			}
		}
	}
	if e == nil && s.Config.ExecutionMode == "pod_sidecar" {
		key, err := os.ReadFile("/host-auth/key")
		if err != nil {
			e = errors.New("host authentication unavailable")
		} else {
			status, err := businesshost.LocalStatus(ctx, "/ipc/business-host.sock", key, s.Config.InstanceID, os.Getenv("RB_POD_UID"))
			if err != nil {
				e = err
			} else if mode == "active" && status.State != "running" {
				e = errors.New("business host not running")
			}
		}
	}
	v.Ready = e == nil
	if e != nil {
		v.Reasons = append(v.Reasons, Issue{"MAINTENANCE_NOT_READY", "任务执行服务或权限未就绪"})
	}
	for _, action := range []string{"plan", "create", "verify", "restore"} {
		v.Actions[action] = v.Ready && !pending && mode == "active"
	}
	v.Actions["cancel"] = v.Ready && pending
	v.Actions["resume"] = false
	v.Actions["abort"] = false
	if v.Maintenance.OperationID != nil {
		if op, e := s.Operation(ctx, *v.Maintenance.OperationID); e == nil {
			v.Actions["resume"] = contains(op.AllowedActions, "resume")
			v.Actions["abort"] = contains(op.AllowedActions, "abort")
		}
	}
	return v
}
func (s *Store) ListBackups(ctx context.Context, limit int, c string) (map[string]any, error) {
	v, e := s.decodeCursor(c, "backups")
	if e != nil {
		return nil, e
	}
	rows, e := s.Pool.Query(ctx, `SELECT w.view,w.verification_state,w.checked_at FROM rb_web_backup w JOIN rb_maintenance_backup b USING(backup_id,instance_id) WHERE w.instance_id=$1 AND b.state='available' AND (b.created_at,b.backup_id)<($2,$3::uuid) ORDER BY b.created_at DESC,b.backup_id DESC LIMIT $4`, s.Config.InstanceID, v.At, v.ID, limit+1)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []Backup{}
	for rows.Next() {
		var b []byte
		var item Backup
		var state string
		var at *time.Time
		if e = rows.Scan(&b, &state, &at); e != nil {
			return nil, e
		}
		if e = json.Unmarshal(b, &item); e != nil {
			return nil, e
		}
		item.Verification.State = state
		item.Verification.CheckedAt = at
		item.Restorable = state == "passed"
		items = append(items, item)
	}
	if e = rows.Err(); e != nil {
		return nil, e
	}
	more := len(items) > limit
	next := ""
	if more {
		items = items[:limit]
		last := items[len(items)-1]
		next = cursor(pageCursor{s.Config.InstanceID, last.CreatedAt, last.BackupID, "backups"})
	}
	return map[string]any{"items": items, "next_cursor": next, "has_more": more}, nil
}
