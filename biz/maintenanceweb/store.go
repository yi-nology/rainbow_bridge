package maintenanceweb

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yi-nology/rainbow_bridge/biz/maintenance"
	"strconv"
	"time"
)

type Store struct {
	Pool   *pgxpool.Pool
	Config Config
}

func Open(ctx context.Context, cfg Config) (*Store, error) {
	p, e := pgxpool.ParseConfig(cfg.DatabaseDSN)
	if e != nil {
		return nil, errors.New("控制服务数据库配置错误")
	}
	p.MaxConns = 8
	p.ConnConfig.ConnectTimeout = 3 * time.Second
	pool, e := pgxpool.NewWithConfig(ctx, p)
	if e != nil {
		return nil, e
	}
	s := &Store{Pool: pool, Config: cfg}
	if e = pool.Ping(ctx); e != nil {
		pool.Close()
		return nil, errors.New("控制服务数据库不可用")
	}
	return s, nil
}
func hash(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func decimal(n int64) string { return strconv.FormatInt(n, 10) }
func str(s string) *string   { return &s }

type privateTask struct {
	Task
	EngineRequest, EngineConfirm, Backup, Preview, JobName, JobUID, TemplateHash string
	Request                                                                      Request
	ActorID                                                                      int64
}

const taskColumns = `task_id::text,request_id::text,kind,state,phase,revision,operation_id::text,created_at,updated_at,started_at,finished_at,actor,reason,parent_task_id::text,result,error,progress,engine_request::text,engine_confirm,COALESCE(backup_id::text,''),COALESCE(preview_id::text,''),job_name,COALESCE(job_uid,''),template_hash,request,actor_id`

func scanTask(row pgx.Row) (privateTask, error) {
	var t privateTask
	var rev int64
	var result, problem, progress, request []byte
	e := row.Scan(&t.TaskID, &t.RequestID, &t.Kind, &t.State, &t.Phase, &rev, &t.OperationID, &t.CreatedAt, &t.UpdatedAt, &t.StartedAt, &t.FinishedAt, &t.Actor, &t.Reason, &t.ParentTaskID, &result, &problem, &progress, &t.EngineRequest, &t.EngineConfirm, &t.Backup, &t.Preview, &t.JobName, &t.JobUID, &t.TemplateHash, &request, &t.ActorID)
	if e != nil {
		return t, e
	}
	t.Revision = decimal(rev)
	if len(result) > 0 {
		if e = json.Unmarshal(result, &t.Result); e != nil {
			return t, e
		}
	}
	if len(problem) > 0 {
		if e = json.Unmarshal(problem, &t.Error); e != nil {
			return t, e
		}
	}
	if e = json.Unmarshal(progress, &t.Progress); e != nil {
		return t, e
	}
	if e = json.Unmarshal(request, &t.Request); e != nil {
		return t, e
	}
	t.AllowedActions = []string{}
	if t.State == "queued" && t.JobUID == "" {
		t.AllowedActions = []string{"cancel"}
	}
	return t, nil
}
func (s *Store) task(ctx context.Context, id string, byRequest bool) (privateTask, error) {
	col := "task_id"
	if byRequest {
		col = "request_id"
	}
	if _, e := uuid.Parse(id); e != nil {
		return privateTask{}, failure(404, "NOT_FOUND", "任务不存在")
	}
	t, e := scanTask(s.Pool.QueryRow(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND `+col+`=$2`, s.Config.InstanceID, id))
	if errors.Is(e, pgx.ErrNoRows) {
		return t, failure(404, "NOT_FOUND", "任务不存在")
	}
	return t, e
}
func (s *Store) Preview(ctx context.Context, id string) (Preview, error) {
	var v Preview
	var b []byte
	if _, e := uuid.Parse(id); e != nil {
		return v, failure(404, "NOT_FOUND", "预览不存在")
	}
	e := s.Pool.QueryRow(ctx, `SELECT view FROM rb_web_preview WHERE instance_id=$1 AND preview_id=$2`, s.Config.InstanceID, id).Scan(&b)
	if e != nil {
		return v, failure(404, "NOT_FOUND", "预览不存在")
	}
	e = json.Unmarshal(b, &v)
	if v.ExpiresAt.Before(time.Now()) {
		v.State = "expired"
	}
	return v, e
}
func (s *Store) privatePlan(ctx context.Context, id string) (maintenance.Plan, error) {
	var p maintenance.Plan
	var b []byte
	e := s.Pool.QueryRow(ctx, `SELECT plan FROM rb_web_preview WHERE instance_id=$1 AND preview_id=$2`, s.Config.InstanceID, id).Scan(&b)
	if e != nil {
		return p, e
	}
	return p, json.Unmarshal(b, &p)
}
func terminal(state string) bool {
	switch state {
	case "succeeded", "failed", "interrupted", "blocked", "cancelled":
		return true
	}
	return false
}

type pageCursor struct {
	Instance string    `json:"i"`
	At       time.Time `json:"a"`
	ID       string    `json:"id"`
	Kind     string    `json:"k"`
}

func (s *Store) decodeCursor(cursor, kind string) (pageCursor, error) {
	v := pageCursor{Instance: s.Config.InstanceID, At: time.Now().Add(time.Minute), ID: "ffffffff-ffff-ffff-ffff-ffffffffffff", Kind: kind}
	if cursor == "" {
		return v, nil
	}
	b, e := base64.RawURLEncoding.DecodeString(cursor)
	if e != nil || len(b) > 512 || json.Unmarshal(b, &v) != nil || v.Instance != s.Config.InstanceID || v.Kind != kind {
		return v, failure(400, "INVALID_REQUEST", "分页标记不合法")
	}
	if _, e = uuid.Parse(v.ID); e != nil {
		return v, failure(400, "INVALID_REQUEST", "分页标记不合法")
	}
	return v, nil
}
func cursor(v pageCursor) string {
	b, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(b)
}
func (s *Store) ListTasks(ctx context.Context, limit int, c string) (map[string]any, error) {
	v, e := s.decodeCursor(c, "tasks")
	if e != nil {
		return nil, e
	}
	rows, e := s.Pool.Query(ctx, `SELECT `+taskColumns+` FROM rb_web_task WHERE instance_id=$1 AND (created_at,task_id)<($2,$3::uuid) ORDER BY created_at DESC,task_id DESC LIMIT $4`, s.Config.InstanceID, v.At, v.ID, limit+1)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []Task{}
	for rows.Next() {
		t, e := scanTask(rows)
		if e != nil {
			return nil, e
		}
		items = append(items, t.Task)
	}
	if e = rows.Err(); e != nil {
		return nil, e
	}
	more := len(items) > limit
	next := ""
	if more {
		items = items[:limit]
		t := items[len(items)-1]
		next = cursor(pageCursor{s.Config.InstanceID, t.CreatedAt, t.TaskID, "tasks"})
	}
	return map[string]any{"items": items, "next_cursor": next, "has_more": more}, nil
}
