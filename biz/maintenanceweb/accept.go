package maintenanceweb

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"strings"
	"unicode/utf8"
)

func (s *Store) Accept(ctx context.Context, kind, target string, r Request, actor service.AdminIdentity) (Task, error) {
	var empty Task
	if _, e := uuid.Parse(r.RequestID); e != nil || utf8.RuneCountInString(r.Reason) > 500 {
		return empty, failure(400, "INVALID_REQUEST", "请求编号或备注不合法")
	}
	if kind == "plan" && r.Kind != "backup" && r.Kind != "restore" {
		return empty, failure(400, "INVALID_REQUEST", "预览类型不合法")
	}
	expected := map[string]string{"backup": "BACKUP_ALL_BUSINESS_DATA", "restore": "RESTORE_ALL_BUSINESS_DATA", "resume": "RESUME_OPERATION", "abort": "ABORT_BEFORE_COMMIT"}
	if v := expected[kind]; v != "" && r.Confirmation != v {
		return empty, failure(400, "INVALID_REQUEST", "缺少操作确认")
	}
	paramHash := hash([]any{kind, target, r, actor.UserID})
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return empty, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,2))`, s.Config.InstanceID); e != nil {
		return empty, e
	}
	prior, e := scanTask(tx.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND request_id=$2`, s.Config.InstanceID, r.RequestID))
	if e == nil {
		var h string
		if tx.QueryRow(ctx, `SELECT parameter_hash FROM rb_web_task WHERE task_id=$1`, prior.TaskID).Scan(&h) != nil {
			return empty, errors.New("请求状态不可读取")
		}
		if h != paramHash {
			return empty, failure(409, "REQUEST_CONFLICT", "同一请求编号的参数不一致")
		}
		return prior.Task, nil
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return empty, e
	}
	var mode string
	var current *string
	if e = tx.QueryRow(ctx, `SELECT mode,operation_id::text FROM rb_maintenance_instance WHERE instance_id=$1`, s.Config.InstanceID).Scan(&mode, &current); e != nil {
		return empty, e
	}
	engineRequest := r.RequestID
	confirm := ""
	var op, parent *string
	if kind == "backup" || kind == "restore" {
		v, e := s.Preview(ctx, r.PreviewID)
		if e != nil {
			return empty, e
		}
		if v.State == "expired" {
			return empty, failure(410, "PLAN_EXPIRED", "预览已过期，请重新预览")
		}
		if v.Kind != kind || v.State != "valid" || v.PlanFingerprint != r.PlanFingerprint {
			return empty, failure(409, "PLAN_STALE", "预览已变化，请重新预览")
		}
		confirm = v.PlanFingerprint
		plan, e := s.privatePlan(ctx, r.PreviewID)
		if e != nil {
			return empty, e
		}
		var active []byte
		if e = tx.QueryRow(ctx, `SELECT active FROM rb_maintenance_instance WHERE instance_id=$1`, s.Config.InstanceID).Scan(&active); e != nil {
			return empty, e
		}
		var identity struct {
			Generation  int64  `json:"generation"`
			Session     int64  `json:"session_generation"`
			Fingerprint string `json:"fingerprint"`
		}
		if json.Unmarshal(active, &identity) != nil || identity.Generation != plan.Active.Generation || identity.Session != plan.Active.SessionGeneration || identity.Fingerprint != plan.Active.Fingerprint {
			return empty, failure(409, "PLAN_STALE", "实例代次已变化，请重新预览")
		}
		if kind == "restore" && (v.BackupID == nil || v.ManifestSHA256 == nil || *v.BackupID != r.BackupID || *v.ManifestSHA256 != r.ManifestSHA256) {
			return empty, failure(422, "BACKUP_INVALID", "备份确认信息不一致")
		}
		if kind == "restore" {
			if e = s.checkBackupHash(ctx, r.BackupID, r.ManifestSHA256); e != nil {
				return empty, e
			}
		}
	}
	if kind == "verify" {
		if _, e = uuid.Parse(target); e != nil {
			return empty, failure(404, "NOT_FOUND", "备份不存在")
		}
		r.BackupID = target
		if len(r.ExpectedSHA256) != 64 {
			return empty, failure(400, "INVALID_REQUEST", "需要备份摘要")
		}
	}
	if kind == "resume" || kind == "abort" {
		if _, e = uuid.Parse(target); e != nil {
			return empty, failure(404, "NOT_FOUND", "操作不存在")
		}
		original, e := scanTask(tx.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND operation_id=$2 AND kind IN('backup','restore') ORDER BY created_at LIMIT 1`, s.Config.InstanceID, target))
		if e != nil {
			return empty, failure(404, "NOT_FOUND", "操作不存在")
		}
		view, e := s.Operation(ctx, target)
		if e != nil {
			return empty, e
		}
		if view.Revision != r.ExpectedRevision {
			return empty, &HTTPError{Status: 409, Code: "STATE_CONFLICT", Message: "操作状态已变化，请刷新", CurrentRevision: view.Revision}
		}
		if !contains(view.AllowedActions, kind) {
			return empty, failure(409, "EXECUTOR_NOT_STOPPED", "当前执行者尚未退出或操作已不能继续/回退")
		}
		engineRequest = original.EngineRequest
		confirm = original.EngineConfirm
		op = &target
		parent = &original.TaskID
	} else if mode != "active" {
		return empty, failure(409, "TASK_BUSY", "当前有维护任务，请先处理该任务")
	}
	// Serialize queued/running commands across processes, including the interval before engine Acquire.
	var busy bool
	if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rb_web_task WHERE instance_id=$1 AND state IN('queued','running'))`, s.Config.InstanceID).Scan(&busy); e != nil {
		return empty, e
	}
	if busy {
		return empty, failure(409, "TASK_BUSY", "已有任务正在执行")
	}
	id := uuid.NewString()
	job := "rb-web-" + strings.ReplaceAll(id, "-", "")
	request, _ := json.Marshal(r)
	templateHash := hash(s.jobTemplate(id, job))
	backup := any(nil)
	if r.BackupID != "" {
		if _, e = uuid.Parse(r.BackupID); e != nil {
			return empty, failure(400, "INVALID_REQUEST", "备份编号不合法")
		}
		backup = r.BackupID
	}
	preview := any(nil)
	if r.PreviewID != "" {
		preview = r.PreviewID
	}
	_, e = tx.Exec(ctx, `INSERT INTO rb_web_task(task_id,instance_id,request_id,kind,parameter_hash,actor,actor_id,reason,operation_id,engine_request,engine_confirm,backup_id,preview_id,parent_task_id,job_name,template_hash,request) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, id, s.Config.InstanceID, r.RequestID, kind, paramHash, actor.Username, actor.UserID, r.Reason, op, engineRequest, confirm, backup, preview, parent, job, templateHash, request)
	if e != nil {
		return empty, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO rb_web_outbox(task_id) VALUES($1)`, id); e != nil {
		return empty, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO rb_web_event(task_id,revision,phase) VALUES($1,1,'queued')`, id); e != nil {
		return empty, e
	}
	if e = tx.Commit(ctx); e != nil {
		return empty, e
	}
	t, e := s.task(ctx, id, false)
	return t.Task, e
}
func contains(items []string, v string) bool {
	for _, i := range items {
		if i == v {
			return true
		}
	}
	return false
}
func (s *Store) Cancel(ctx context.Context, id string, r Request, actor service.AdminIdentity) (Task, error) {
	if _, e := uuid.Parse(r.RequestID); e != nil {
		return Task{}, failure(400, "INVALID_REQUEST", "请求编号不合法")
	}
	if _, e := uuid.Parse(id); e != nil {
		return Task{}, failure(404, "NOT_FOUND", "任务不存在")
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return Task{}, e
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,2))`, s.Config.InstanceID); e != nil {
		return Task{}, e
	}
	parameter := hash([]any{"cancel", id, r, actor.UserID})
	previous, lookup := scanTask(tx.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND request_id=$2`, s.Config.InstanceID, r.RequestID))
	if lookup == nil {
		var p string
		if e = tx.QueryRow(ctx, `SELECT parameter_hash FROM rb_web_task WHERE task_id=$1`, previous.TaskID).Scan(&p); e != nil {
			return Task{}, e
		}
		if p != parameter {
			return Task{}, failure(409, "REQUEST_CONFLICT", "同一请求编号的参数不一致")
		}
		return previous.Task, nil
	}
	if !errors.Is(lookup, pgx.ErrNoRows) {
		return Task{}, lookup
	}
	t, e := scanTask(tx.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND task_id=$2 FOR UPDATE`, s.Config.InstanceID, id))
	if e != nil {
		return Task{}, failure(404, "NOT_FOUND", "任务不存在")
	}
	if t.Revision != r.ExpectedRevision || t.State != "queued" || t.JobUID != "" {
		return Task{}, failure(409, "STATE_CONFLICT", "任务已开始，不能取消排队")
	}
	// A prior create may have succeeded while its response/DB commit was lost.
	k, err := newCluster(s.Config)
	if err != nil {
		return Task{}, err
	}
	_, status, err := k.request(ctx, "GET", k.jobPath(t.JobName), nil)
	if err != nil || status != 404 {
		return Task{}, failure(409, "STATE_CONFLICT", "执行是否开始尚未确认，不能取消排队")
	}
	if _, e = tx.Exec(ctx, `UPDATE rb_web_task SET state='cancelled',revision=revision+1,updated_at=now(),finished_at=now() WHERE task_id=$1`, id); e != nil {
		return Task{}, e
	}
	if _, e = tx.Exec(ctx, `UPDATE rb_web_outbox SET dispatched=true WHERE task_id=$1`, id); e != nil {
		return Task{}, e
	}
	command := uuid.NewString()
	request, _ := json.Marshal(r)
	if _, e = tx.Exec(ctx, `INSERT INTO rb_web_task(task_id,instance_id,request_id,kind,parameter_hash,actor,actor_id,state,phase,engine_request,parent_task_id,job_name,template_hash,request,started_at,finished_at) VALUES($1,$2,$3,'cancel',$4,$5,$6,'succeeded','completed',$7,$8,$9,'none',$10,now(),now())`, command, s.Config.InstanceID, r.RequestID, parameter, actor.Username, actor.UserID, t.EngineRequest, t.TaskID, "cancel-"+command, request); e != nil {
		return Task{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Task{}, e
	}
	t, e = s.task(ctx, command, false)
	return t.Task, e
}
