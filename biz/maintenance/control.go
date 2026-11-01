package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"time"
)

const ControlDDL = `
CREATE TABLE IF NOT EXISTS rb_maintenance_instance (
 instance_id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode IN ('active','draining','checking')),
 active jsonb NOT NULL, pending jsonb, next_generation bigint NOT NULL,
 token bigint NOT NULL DEFAULT 0, operation_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rb_maintenance_operation (
 operation_id uuid PRIMARY KEY, instance_id uuid NOT NULL REFERENCES rb_maintenance_instance,
 request_id uuid NOT NULL, parameter_hash text NOT NULL, kind text NOT NULL,
 phase text NOT NULL, token bigint NOT NULL, owner jsonb NOT NULL, data jsonb NOT NULL,
 terminal boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(instance_id,request_id));
CREATE TABLE IF NOT EXISTS rb_maintenance_backup (
 backup_id uuid PRIMARY KEY, instance_id uuid NOT NULL REFERENCES rb_maintenance_instance,
 operation_id uuid NOT NULL REFERENCES rb_maintenance_operation, prefix text NOT NULL,
 manifest_sha text NOT NULL, state text NOT NULL CHECK(state IN ('pending','available')),
 created_at timestamptz NOT NULL DEFAULT now());`

var ErrOwnership = errors.New("执行者已失去控制锁或 fencing token；保持维护，停止外部操作")

// Bootstrap is explicit provisioning, never called by ordinary application startup.
func Bootstrap(ctx context.Context, dsn, instance string, identity maintcontrol.Identity) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if _, err := uuid.Parse(instance); err != nil || identity.Generation < 1 || identity.SessionGeneration < 1 || len(identity.Fingerprint) != 64 {
		return errors.New("控制实例初始化参数无效")
	}
	c, err := openControl(ctx, dsn)
	if err != nil {
		return errors.New("控制库连接失败")
	}
	defer c.Close(ctx)
	if _, err = c.Exec(ctx, ControlDDL); err != nil {
		return errors.New("控制库结构初始化失败")
	}
	b, _ := json.Marshal(identity)
	tag, err := c.Exec(ctx, `INSERT INTO rb_maintenance_instance(instance_id,mode,active,next_generation) VALUES($1,'active',$2,$3) ON CONFLICT DO NOTHING`, instance, b, max(identity.Generation, identity.SessionGeneration))
	if err != nil || tag.RowsAffected() != 1 {
		return errors.New("控制实例已存在或初始化失败，不覆盖现有控制状态")
	}
	return nil
}

type Lease struct {
	conn *pgx.Conn
	cfg  Config
	Op   Operation
	pid  uint32
}

func scanOperation(row pgx.Row) (Operation, error) {
	var o Operation
	var owner, data []byte
	err := row.Scan(&o.ID, &o.RequestID, &o.Kind, &o.Phase, &o.Token, &owner, &data, &o.Terminal)
	if err != nil {
		return o, err
	}
	if json.Unmarshal(owner, &o.Owner) != nil || json.Unmarshal(data, &o.Data) != nil {
		return o, errors.New("控制作业记录损坏")
	}
	return o, nil
}

const operationColumns = `operation_id::text,request_id::text,kind,phase,token,owner,data,terminal`

// Acquire never equates a released advisory lock with permission to take over.
// Prior executor termination is a separate mandatory Kubernetes proof.
func Acquire(ctx context.Context, cfg Config, request, kind, paramHash string, owner Executor, data OperationData, proveStopped func(context.Context, Executor) error) (*Lease, error) {
	if _, err := uuid.Parse(request); err != nil {
		return nil, errors.New("request-id 必须为 UUID")
	}
	c, err := openControl(ctx, cfg.ControlDSN)
	if err != nil {
		return nil, errors.New("控制连接失败")
	}
	ok := false
	defer func() {
		if !ok {
			closePG(c)
		}
	}()
	var locked bool
	if c.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, cfg.InstanceID).Scan(&locked) != nil || !locked {
		return nil, errors.New("已有维护执行者持锁")
	}
	l := &Lease{conn: c, cfg: cfg, pid: c.PgConn().PID()}
	var oldHash string
	previous, err := scanOperation(c.QueryRow(ctx, `SELECT `+operationColumns+` FROM rb_maintenance_operation WHERE instance_id=$1 AND request_id=$2`, cfg.InstanceID, request))
	if err == nil {
		if err = c.QueryRow(ctx, `SELECT parameter_hash FROM rb_maintenance_operation WHERE operation_id=$1`, previous.ID).Scan(&oldHash); err != nil {
			return nil, ErrOwnership
		}
		if oldHash != paramHash {
			return nil, errors.New("同 request-id 参数冲突")
		}
		if previous.Terminal {
			l.Op = previous
			ok = true
			return l, nil
		}
		if previous.Owner != owner {
			if err = proveStopped(ctx, previous.Owner); err != nil {
				return nil, err
			}
		}
		l.Op = previous
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("读取持久作业失败")
	}
	// The old execution process is already proved dead above. Drain its server
	// SQL before a new owner can create/drop/switch external resources.
	if l.Op.ID != "" {
		if err = l.drainPriorBeforeClaim(ctx); err != nil {
			return nil, err
		}
	}
	tx, err := c.Begin(ctx)
	if err != nil {
		return nil, ErrOwnership
	}
	defer tx.Rollback(context.Background())
	var mode string
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,2))`, cfg.InstanceID); err != nil {
		return nil, ErrOwnership
	}
	var opID *string
	var token int64
	if err = tx.QueryRow(ctx, `SELECT mode,operation_id::text,token FROM rb_maintenance_instance WHERE instance_id=$1 FOR UPDATE`, cfg.InstanceID).Scan(&mode, &opID, &token); err != nil {
		return nil, errors.New("控制实例不存在")
	}
	if l.Op.ID == "" {
		if mode != "active" || opID != nil {
			return nil, errors.New("实例已有未完成维护，先 status/resume/abort")
		}
		l.Op = Operation{ID: uuid.NewString(), RequestID: request, Kind: kind, Phase: "claimed", Data: data}
	} else if opID == nil || *opID != l.Op.ID {
		return nil, ErrOwnership
	}
	l.Op.Token = token + 1
	l.Op.Owner = owner
	o, _ := json.Marshal(owner)
	d, _ := json.Marshal(l.Op.Data)
	_, err = tx.Exec(ctx, `INSERT INTO rb_maintenance_operation(operation_id,instance_id,request_id,parameter_hash,kind,phase,token,owner,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(operation_id) DO UPDATE SET token=EXCLUDED.token,owner=EXCLUDED.owner,updated_at=now()`, l.Op.ID, cfg.InstanceID, request, paramHash, kind, l.Op.Phase, l.Op.Token, o, d)
	if err != nil {
		return nil, errors.New("登记维护作业失败")
	}
	_, err = tx.Exec(ctx, `UPDATE rb_maintenance_instance SET mode=CASE WHEN mode='active' THEN 'draining' ELSE mode END,token=$2,operation_id=$3,updated_at=now() WHERE instance_id=$1`, cfg.InstanceID, l.Op.Token, l.Op.ID)
	if err != nil || tx.Commit(ctx) != nil {
		return nil, ErrOwnership
	}
	ok = true
	return l, nil
}
func (l *Lease) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	l.conn.Close(ctx)
}
func (l *Lease) Check(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var ok bool
	err := l.conn.QueryRow(ctx, `SELECT token=$2 AND operation_id=$3 AND pg_backend_pid()=$4 AND EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted) FROM rb_maintenance_instance WHERE instance_id=$1`, l.cfg.InstanceID, l.Op.Token, l.Op.ID, l.pid).Scan(&ok)
	if err != nil || !ok {
		return ErrOwnership
	}
	return nil
}
func (l *Lease) Save(ctx context.Context, phase string) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := l.Check(ctx); err != nil {
		return err
	}
	if l.Op.Data.PhaseTimes == nil {
		l.Op.Data.PhaseTimes = map[string]time.Time{}
	}
	if _, exists := l.Op.Data.PhaseTimes[phase]; !exists {
		l.Op.Data.PhaseTimes[phase] = time.Now().UTC()
	}
	b, _ := json.Marshal(l.Op.Data)
	tag, err := l.conn.Exec(ctx, `UPDATE rb_maintenance_operation SET phase=$2,data=$3,updated_at=now() WHERE operation_id=$1 AND token=$4 AND NOT terminal`, l.Op.ID, phase, b, l.Op.Token)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrOwnership
	}
	l.Op.Phase = phase
	return nil
}
func Status(ctx context.Context, cfg Config, request string) (Operation, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	c, err := openControl(ctx, cfg.ControlDSN)
	if err != nil {
		return Operation{}, errors.New("控制库不可用")
	}
	defer c.Close(ctx)
	return scanOperation(c.QueryRow(ctx, `SELECT `+operationColumns+` FROM rb_maintenance_operation WHERE instance_id=$1 AND request_id=$2`, cfg.InstanceID, request))
}
