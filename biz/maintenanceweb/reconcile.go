package maintenanceweb

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

// Reconcile is an outbox consumer, not a backup scheduler. It never creates a request.
// The row lock spans create+UID recording; deterministic names close the lost-response gap.
func (s *Store) Reconcile(ctx context.Context) error {
	k, e := newCluster(s.Config)
	if e != nil {
		return e
	}
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(context.Background())
	t, e := scanTask(tx.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND state='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`, s.Config.InstanceID))
	if errors.Is(e, pgx.ErrNoRows) {
		return s.reconcileRunning(ctx, k)
	}
	if e != nil {
		return e
	}
	uid, e := k.ensureJob(ctx, s, t)
	if e != nil {
		// A failed old Job with a now-incompatible template must not leave the
		// accepted request invisibly queued forever. Keep its identity; never recreate.
		job, status, readErr := k.request(ctx, "GET", k.jobPath(t.JobName), nil)
		if readErr == nil && status == 200 {
			failed, _ := object(job, "status")["failed"].(float64)
			if failed > 0 {
				problem, _ := json.Marshal(TaskError{"EXECUTOR_INTERRUPTED", "执行者已退出，当前模板无法自动重放此排队任务", false})
				if _, saveErr := tx.Exec(ctx, `UPDATE rb_web_task SET state='blocked',error=$2,finished_at=now(),updated_at=now(),revision=revision+1 WHERE task_id=$1`, t.TaskID, problem); saveErr != nil {
					return saveErr
				}
				return tx.Commit(ctx)
			}
		}
		problem, _ := json.Marshal(TaskError{"EXECUTOR_UNAVAILABLE", "执行服务未就绪；原受理记录已保留，等待核对执行状态", true})
		if _, saveErr := tx.Exec(ctx, `UPDATE rb_web_task SET error=$2,updated_at=now(),revision=revision+1 WHERE task_id=$1 AND error IS DISTINCT FROM $2::jsonb`, t.TaskID, problem); saveErr != nil {
			return saveErr
		}
		if saveErr := tx.Commit(ctx); saveErr != nil {
			return saveErr
		}
		return e
	}
	if t.JobUID != "" && t.JobUID != uid {
		return errors.New("Job UID变化，拒绝自动接管")
	}
	_, e = tx.Exec(ctx, `UPDATE rb_web_task SET job_uid=$2,state='running',error=NULL,revision=revision+1,updated_at=now(),started_at=COALESCE(started_at,now()) WHERE task_id=$1 AND state='queued'`, t.TaskID, uid)
	if e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `UPDATE rb_web_outbox SET dispatched=true,updated_at=now() WHERE task_id=$1`, t.TaskID); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO rb_web_event(task_id,revision,phase) SELECT task_id,revision,phase FROM rb_web_task WHERE task_id=$1`, t.TaskID); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) reconcileRunning(ctx context.Context, k *cluster) error {
	// Executor may die before its first progress poll; the durable engine request
	// is the authoritative link and must remain resumable from the web task.
	if _, e := s.Pool.Exec(ctx, `UPDATE rb_web_task t SET operation_id=o.operation_id,updated_at=now(),revision=t.revision+1 FROM rb_maintenance_operation o WHERE t.instance_id=$1 AND o.instance_id=t.instance_id AND o.request_id=t.engine_request AND t.operation_id IS NULL AND t.state='running'`, s.Config.InstanceID); e != nil {
		return e
	}
	rows, e := s.Pool.Query(ctx, `SELECT task_id::text,job_name,COALESCE(job_uid,'') FROM rb_web_task WHERE instance_id=$1 AND state='running' LIMIT 20`, s.Config.InstanceID)
	if e != nil {
		return e
	}
	type running struct{ id, name, uid string }
	list := []running{}
	for rows.Next() {
		var r running
		if e = rows.Scan(&r.id, &r.name, &r.uid); e != nil {
			rows.Close()
			return e
		}
		list = append(list, r)
	}
	rows.Close()
	for _, r := range list {
		job, status, e := k.request(ctx, "GET", k.jobPath(r.name), nil)
		if e != nil {
			return e
		}
		if status == 404 {
			return s.interrupt(ctx, r.id, "EXECUTOR_NOT_STOPPED", "任务执行记录缺失，无法证明执行者已停止")
		}
		if status != 200 || textValue(object(job, "metadata"), "uid") != r.uid {
			return errors.New("Job归属无法确认")
		}
		state := object(job, "status")
		failed, _ := state["failed"].(float64)
		succeeded, _ := state["succeeded"].(float64)
		if failed > 0 || succeeded > 0 {
			if e = s.interrupt(ctx, r.id, "EXECUTOR_INTERRUPTED", "执行者已退出，请查看当前操作并选择继续或回退"); e != nil {
				return e
			}
		}
	}
	return nil
}
func (s *Store) interrupt(ctx context.Context, id, code, message string) error {
	b, _ := json.Marshal(TaskError{code, message, true})
	_, e := s.Pool.Exec(ctx, `UPDATE rb_web_task SET state='interrupted',error=$2,revision=revision+1,updated_at=now(),finished_at=now() WHERE task_id=$1 AND state='running'`, id, b)
	return e
}
func (s *Store) Loop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		call, cancel := context.WithTimeout(ctx, 15*time.Second)
		_ = s.Reconcile(call)
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
