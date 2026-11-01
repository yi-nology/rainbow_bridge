package maintenanceweb

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/maintenance"
	"time"
)

func (s *Store) Worker(ctx context.Context, engine maintenance.Config, id string) error {
	t, e := s.task(ctx, id, false)
	if e != nil {
		return e
	}
	if t.State == "cancelled" || t.State == "succeeded" {
		return nil
	}
	k, e := maintenance.NewKube(engine.Kubernetes, engine.Namespace)
	if e != nil {
		return e
	}
	owner, e := k.Executor(ctx, engine.InstanceID)
	if e != nil {
		return e
	}
	// A Job may start before the console receives create's response. Verify its template/UID independently.
	cluster, e := newCluster(s.Config)
	if e != nil {
		return e
	}
	uid, e := cluster.ensureJob(ctx, s, t)
	if e != nil {
		return e
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(context.Background())
	var state string
	if e = tx.QueryRow(ctx, `SELECT state FROM rb_web_task WHERE task_id=$1 FOR UPDATE`, id).Scan(&state); e != nil {
		return e
	}
	if terminal(state) {
		return nil
	}
	if _, e = tx.Exec(ctx, `UPDATE rb_web_task SET state='running',job_uid=$2,started_at=COALESCE(started_at,now()),updated_at=now() WHERE task_id=$1`, id, uid); e != nil {
		return e
	}
	if e = tx.Commit(ctx); e != nil {
		return e
	}
	// Separate connection and server-side lock prevent duplicate worker processes in one Job.
	lock, e := s.Pool.Acquire(ctx)
	if e != nil {
		return e
	}
	defer lock.Release()
	var acquired bool
	if e = lock.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,3))`, id).Scan(&acquired); e != nil || !acquired {
		return errors.New("任务已有执行者")
	}
	defer lock.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1,3))`, id)
	var result *Result
	switch t.Kind {
	case "plan":
		result, e = s.makePlan(ctx, engine, k, t)
	case "verify":
		result, e = s.verifyBackup(ctx, engine, k, t)
	default:
		if t.Kind == "backup" || t.Kind == "restore" {
			v, err := s.Preview(ctx, t.Preview)
			if err != nil || v.State != "valid" {
				return s.finish(ctx, id, nil, failure(410, "PLAN_EXPIRED", "预览已过期，请重新预览"))
			}
		}
		watchCtx, cancel := context.WithCancel(ctx)
		done := make(chan struct{})
		go func() { defer close(done); s.watchEngine(watchCtx, engine, t) }()
		var op maintenance.Operation
		op, e = maintenance.Run(ctx, engine, k, t.Kind, t.EngineRequest, t.EngineConfirm, t.Backup)
		cancel()
		<-done
		if op.ID != "" {
			_, _ = s.Pool.Exec(ctx, `UPDATE rb_web_task SET operation_id=$2,phase=$3,revision=revision+1,updated_at=now() WHERE task_id=$1`, id, op.ID, publicPhase(op.Phase))
		}
		if e == nil {
			e = maintenance.VerifyCompleted(ctx, engine, k, op)
		}
		if e == nil {
			available := true
			reauth := op.Kind == "restore"
			result = &Result{BusinessAvailable: &available, ReauthRequired: &reauth}
			if op.Kind == "backup" && !op.Data.Aborting {
				result.BackupID = &op.Data.BackupID
				e = s.indexBackup(ctx, engine, k, t, op)
			}
		}
	}
	_ = owner // Executor validation above is required even for read-only plan/verify Jobs.
	return s.finish(ctx, id, result, e)
}
func (s *Store) watchEngine(ctx context.Context, cfg maintenance.Config, t privateTask) {
	ticker := time.NewTicker(800 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			op, e := maintenance.Status(ctx, cfg, t.EngineRequest)
			if e != nil {
				continue
			}
			phase := publicPhase(op.Phase)
			if op.Data.Aborting && !op.Terminal {
				phase = "aborting"
			}
			p := Progress{CompletedObjects: str(decimal(op.Data.Progress.Objects)), CompletedBytes: str(decimal(op.Data.Progress.Bytes))}
			if op.Data.Progress.TotalObjects > 0 {
				p.TotalObjects = str(decimal(op.Data.Progress.TotalObjects))
			}
			if op.Data.Progress.TotalBytes > 0 {
				p.TotalBytes = str(decimal(op.Data.Progress.TotalBytes))
			}
			progress, _ := json.Marshal(p)
			_, _ = s.Pool.Exec(ctx, `WITH changed AS (UPDATE rb_web_task SET operation_id=$2,phase=$3,progress=$4,revision=revision+1,updated_at=now() WHERE task_id=$1 AND (operation_id IS DISTINCT FROM $2::uuid OR phase<>$3 OR progress<>$4::jsonb) RETURNING task_id,revision,phase) INSERT INTO rb_web_event(task_id,revision,phase) SELECT task_id,revision,phase FROM changed`, t.TaskID, op.ID, phase, progress)
		}
	}
}
func (s *Store) finish(ctx context.Context, id string, result *Result, problem error) error {
	state, phase := "succeeded", "completed"
	var public *TaskError
	if problem != nil {
		state = "failed"
		public = &TaskError{"TASK_FAILED", "操作未完成；请查看业务可用性和允许的后续操作", true}
		var safe *HTTPError
		if errors.As(problem, &safe) {
			public = &TaskError{safe.Code, safe.Message, safe.Status >= 500}
		}
		var op *string
		_ = s.Pool.QueryRow(ctx, `SELECT operation_id::text FROM rb_web_task WHERE task_id=$1`, id).Scan(&op)
		if op != nil {
			state = "interrupted"
		}
		phase = "queued"
	}
	b, _ := json.Marshal(result)
	p, _ := json.Marshal(public)
	_, e := s.Pool.Exec(ctx, `WITH changed AS (UPDATE rb_web_task SET state=$2,phase=CASE WHEN $2='succeeded' THEN $3 ELSE phase END,result=$4,error=$5,revision=revision+1,updated_at=now(),finished_at=now() WHERE task_id=$1 RETURNING task_id,revision,phase) INSERT INTO rb_web_event(task_id,revision,phase) SELECT task_id,revision,phase FROM changed`, id, state, phase, b, p)
	if e != nil {
		return e
	}
	return problem
}
func (s *Store) makePlan(ctx context.Context, cfg maintenance.Config, k *maintenance.Kube, t privateTask) (*Result, error) {
	if t.Request.Kind == "restore" {
		if e := s.checkBackupHash(ctx, t.Request.BackupID, t.Request.ExpectedSHA256); e != nil {
			return nil, e
		}
	}
	p, e := maintenance.BuildPlan(ctx, cfg, k, t.Request.Kind, t.Request.BackupID)
	if e != nil {
		return nil, e
	}
	preview := uuid.NewString()
	expires := time.Now().UTC().Add(10 * time.Minute)
	v := Preview{PreviewID: preview, State: "valid", Kind: t.Request.Kind, ExpiresAt: expires, TargetLabel: s.Config.TargetLabel, Counts: countsFromRows(p.TableRows), Bytes: str(decimal(p.DataBytes)), Warnings: []Issue{{"BUSINESS_DOWNTIME", "执行时所有业务服务将暂停"}}, Issues: []Issue{}, PlanFingerprint: p.Fingerprint, Revision: "1"}
	if p.BackupID != "" {
		v.BackupID = &p.BackupID
		v.ManifestSHA256 = &p.ManifestSHA
	}
	view, _ := json.Marshal(v)
	plan, _ := json.Marshal(p)
	_, e = s.Pool.Exec(ctx, `INSERT INTO rb_web_preview(preview_id,instance_id,task_id,plan,view,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(task_id) DO NOTHING`, preview, cfg.InstanceID, t.TaskID, plan, view, expires)
	if e != nil {
		return nil, e
	}
	// Replays return the already persisted preview, not a fresh identifier.
	if e = s.Pool.QueryRow(ctx, `SELECT preview_id::text FROM rb_web_preview WHERE task_id=$1`, t.TaskID).Scan(&preview); e != nil {
		return nil, e
	}
	return &Result{PreviewID: &preview}, nil
}
func countsFromRows(rows map[string]int64) *Counts {
	v := &Counts{}
	for _, pair := range []struct {
		table string
		dest  **string
	}{{"environment", &v.Environments}, {"pipeline", &v.Pipelines}, {"resource_config", &v.Configs}, {"asset", &v.Assets}, {"config_release_version", &v.Versions}, {"config_freeze_event", &v.FreezeEvents}, {"config_release_event", &v.ReleaseEvents}} {
		if n, ok := rows[pair.table]; ok {
			*pair.dest = str(decimal(n))
		}
	}
	return v
}
func (s *Store) checkBackupHash(ctx context.Context, id, sha string) error {
	var actual, state string
	e := s.Pool.QueryRow(ctx, `SELECT b.manifest_sha,w.verification_state FROM rb_maintenance_backup b JOIN rb_web_backup w USING(backup_id,instance_id) WHERE b.instance_id=$1 AND b.backup_id=$2 AND b.state='available'`, s.Config.InstanceID, id).Scan(&actual, &state)
	if e != nil || actual != sha || state != "passed" {
		return failure(422, "BACKUP_INVALID", "备份尚未通过核验或摘要已变化")
	}
	return nil
}
func (s *Store) verifiedManifest(ctx context.Context, cfg maintenance.Config, k *maintenance.Kube, id string) (*maintenance.Manifest, string, error) {
	app, _, e := maintenance.ApplicationConfig(ctx, k, cfg)
	if e != nil {
		return nil, "", e
	}
	store, e := maintenance.NewOperatorStore(app, cfg)
	if e != nil {
		return nil, "", e
	}
	return maintenance.LoadManifest(ctx, cfg, store, id)
}
func (s *Store) verifyBackup(ctx context.Context, cfg maintenance.Config, k *maintenance.Kube, t privateTask) (*Result, error) {
	_, _ = s.Pool.Exec(ctx, `UPDATE rb_web_backup SET verification_state='running' WHERE instance_id=$1 AND backup_id=$2`, cfg.InstanceID, t.Backup)
	_, sha, e := s.verifiedManifest(ctx, cfg, k, t.Backup)
	state := "passed"
	if e != nil || sha != t.Request.ExpectedSHA256 {
		state = "failed"
		e = failure(422, "BACKUP_INVALID", "备份完整性校验失败")
	}
	_, save := s.Pool.Exec(ctx, `UPDATE rb_web_backup SET verification_state=$3,checked_at=now() WHERE instance_id=$1 AND backup_id=$2`, cfg.InstanceID, t.Backup, state)
	if save != nil {
		return nil, save
	}
	return &Result{BackupID: &t.Backup}, e
}
func (s *Store) indexBackup(ctx context.Context, cfg maintenance.Config, k *maintenance.Kube, t privateTask, op maintenance.Operation) error {
	m, sha, e := s.verifiedManifest(ctx, cfg, k, op.Data.BackupID)
	if e != nil {
		return e
	}
	rows := map[string]int64{}
	for _, table := range m.Tables {
		rows[table.Name] = table.Rows
	}
	at, e := time.Parse(time.RFC3339, m.CompletedAt)
	if e != nil {
		return e
	}
	var created time.Time
	if e = s.Pool.QueryRow(ctx, `SELECT created_at FROM rb_maintenance_backup WHERE backup_id=$1`, m.BackupID).Scan(&created); e != nil {
		return e
	}
	v := Backup{BackupID: m.BackupID, CreatedAt: created, ConsistentAt: at, ManifestSHA256: sha, SizeBytes: decimal(m.Bytes), Counts: *countsFromRows(rows), Reason: t.Reason, Actor: t.Actor, Verification: Verification{State: "passed", CheckedAt: &at}, Restorable: true}
	b, _ := json.Marshal(v)
	_, e = s.Pool.Exec(ctx, `INSERT INTO rb_web_backup(backup_id,instance_id,view,verification_state,checked_at) VALUES($1,$2,$3,'passed',now()) ON CONFLICT(backup_id) DO NOTHING`, m.BackupID, cfg.InstanceID, b)
	return e
}
