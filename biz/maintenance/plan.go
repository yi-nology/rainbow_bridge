package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"time"
)

func connectDB(ctx context.Context, dsn, database string) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("维护数据库连接配置无效")
	}
	cfg.Database = database
	cfg.ConnectTimeout = 5 * time.Second
	c, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("维护数据库连接失败")
	}
	return c, nil
}
func readActive(ctx context.Context, cfg Config) (maintcontrol.Identity, error) {
	var id maintcontrol.Identity
	c, err := pgx.Connect(ctx, cfg.ControlDSN)
	if err != nil {
		return id, errors.New("控制数据库不可用")
	}
	defer c.Close(ctx)
	var mode string
	var b []byte
	if c.QueryRow(ctx, `SELECT mode,active FROM rb_maintenance_instance WHERE instance_id=$1`, cfg.InstanceID).Scan(&mode, &b) != nil || mode != "active" || json.Unmarshal(b, &id) != nil {
		return id, errors.New("实例非正常服务状态，请先 status/resume")
	}
	return id, nil
}
func checkRole(ctx context.Context, cfg Config, app *config.Config) error {
	parsed, err := pgx.ParseConfig(app.Database.Postgres.DSN)
	if err != nil || parsed.User != cfg.ApplicationRole {
		return errors.New("应用必须使用独占登录角色")
	}
	admin, err := pgx.ParseConfig(cfg.AdminDSN)
	if err != nil || admin.User == cfg.ApplicationRole {
		return errors.New("维护角色必须与应用角色分离")
	}
	c, err := connectDB(ctx, cfg.AdminDSN, parsed.Database)
	if err != nil {
		return err
	}
	defer c.Close(ctx)
	var safe bool
	// Provisioning must explicitly label the exclusive role. Superusers, role
	// memberships and connections to another database are never silently fenced.
	err = c.QueryRow(ctx, `SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND shobj_description(oid,'pg_authid')=$2 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) FROM pg_roles r WHERE rolname=$1`, cfg.ApplicationRole, "rainbow-maintenance:"+cfg.InstanceID).Scan(&safe)
	if err != nil || !safe {
		return errors.New("不能证明应用角色独占归属，禁止 fence 共享角色")
	}
	var version int
	if c.QueryRow(ctx, `SELECT current_setting('server_version_num')::int`).Scan(&version) != nil || version < 160000 || version >= 170000 {
		return errors.New("首批维护模式仅验证 PostgreSQL 16")
	}
	return nil
}
func BuildPlan(ctx context.Context, cfg Config, k *Kube, kind, backup string) (Plan, error) {
	var p Plan
	if _, e := k.lifecycle(cfg); e != nil {
		return p, e
	}
	if err := cfg.Validate(); err != nil {
		return p, err
	}
	app, raw, err := k.appConfig(ctx, cfg)
	if err != nil {
		return p, err
	}
	if !app.Backup.Distributed.Enabled || app.Backup.Distributed.InstanceID != cfg.InstanceID {
		return p, errors.New("应用尚未启用同一全局维护协议")
	}
	if err = checkOperator(ctx, cfg, app); err != nil {
		return p, err
	}
	identity, err := readActive(ctx, cfg)
	if err != nil {
		return p, err
	}
	fp, err := maintcontrol.Fingerprint(app)
	if err != nil || fp != identity.Fingerprint || app.Backup.Distributed.Generation != identity.Generation || app.Backup.Distributed.SessionGeneration != identity.SessionGeneration {
		return p, errors.New("应用与控制实例的代次或数据连接不一致")
	}
	if err = checkRole(ctx, cfg, app); err != nil {
		return p, err
	}
	workloads, err := k.loadWorkloads(ctx, cfg.Workloads)
	if err != nil {
		return p, err
	}
	if err = k.verifyServingProtocol(ctx, app, workloads, identity); err != nil {
		return p, err
	}
	if cfg.BackupBucket == app.Storage.Minio.Bucket || cfg.BackupBucket == app.ReleaseStorage.Bucket {
		return p, errors.New("备份必须使用独立 bucket")
	}
	store, err := NewOperatorStore(app, cfg)
	if err != nil {
		return p, err
	}
	if err = store.privateBucket(ctx, cfg.BackupBucket); err != nil {
		return p, err
	}
	db, _ := pgx.ParseConfig(app.Database.Postgres.DSN)
	p = Plan{InstanceID: cfg.InstanceID, Kind: kind, Active: identity, Workloads: workloads, ConfigUID: cfg.ConfigSecretUID, ConfigHash: digest(raw), Database: db.Database, OriginalBucket: app.Storage.Minio.Bucket, SnapshotBucket: app.ReleaseStorage.Bucket, BackupBucket: cfg.BackupBucket, BackupID: backup}
	p.Namespace = cfg.Namespace
	p.ExecutionMode = cfg.ExecutionMode
	if cfg.ExecutionMode == "pod_sidecar" {
		pods, _, e := k.matchingPods(ctx, workloads)
		if e != nil {
			return p, e
		}
		probe := &Lease{cfg: cfg}
		for _, pod := range pods {
			state, e := (sidecarLifecycle{k}).command(ctx, probe, pod, "status")
			if e != nil {
				return p, errors.New("同Pod内部认证通道或host协议不可用")
			}
			if state.State != "running" {
				return p, errors.New("业务child当前未运行")
			}
			if state.ConfigSHA != p.ConfigHash {
				return p, errors.New("实际业务配置SHA与配置Secret不一致")
			}
		}
	}
	p.ConfigSecret = cfg.ConfigSecret
	p.CandidatePattern = "new database rb_restore_<UUID>; new buckets rb-r-<instance UUID>-<attempt>-{o,s}"
	if kind == "restore" {
		m, sha, err := LoadManifest(ctx, cfg, store, backup)
		if err != nil {
			return p, err
		}
		p.ManifestSHA = sha
		p.TableRows = map[string]int64{}
		for _, table := range m.Tables {
			p.TableRows[table.Name] = table.Rows
		}
		p.ObjectCount = len(m.Objects)
		p.DataBytes = m.Bytes
	} else if kind != "backup" {
		return p, errors.New("计划仅支持 backup 或 restore")
	}
	p.Fingerprint = p.Hash()
	return p, nil
}
