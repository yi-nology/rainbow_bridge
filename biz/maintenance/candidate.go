package maintenance

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/minio/minio-go/v7"
	"github.com/yi-nology/rainbow_bridge/biz/backup"
	configdb "github.com/yi-nology/rainbow_bridge/biz/dal/db"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
	"io"
	"strings"
)

func fence(ctx context.Context, l *Lease, app *config.Config, login bool) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	if err := checkRole(ctx, l.cfg, app); err != nil {
		return err
	}
	c, err := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.Plan.Database)
	if err != nil {
		return err
	}
	defer closePG(c)
	var alien int
	if err = c.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE usename=$1 AND datname<>$2 AND datname<>$3`, l.cfg.ApplicationRole, l.Op.Data.Plan.Database, l.Op.Data.CandidateDB).Scan(&alien); err != nil || alien != 0 {
		return errors.New("应用角色在未声明数据库有连接，禁止变更角色")
	}
	setting := " NOLOGIN"
	if login {
		setting = " LOGIN"
	}
	if _, err = c.Exec(ctx, "ALTER ROLE "+pgx.Identifier{l.cfg.ApplicationRole}.Sanitize()+setting); err != nil {
		return errors.New("独占应用角色 fence 失败")
	}
	if login {
		return l.Check(ctx)
	}
	if _, err = c.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND datname IN($2,$3) AND pid<>pg_backend_pid()`, l.cfg.ApplicationRole, l.Op.Data.Plan.Database, l.Op.Data.CandidateDB); err != nil {
		return errors.New("应用连接排空失败")
	}
	if err = c.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE usename=$1`, l.cfg.ApplicationRole).Scan(&alien); err != nil || alien != 0 {
		return errors.New("应用数据库连接未清零")
	}
	if err = c.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, l.Op.Data.Plan.Database).Scan(&alien); err != nil || alien != 0 {
		return errors.New("源业务库存在未纳入协议的直连写者")
	}
	return l.Check(ctx)
}
func candidateApp(app *config.Config, l *Lease) (*config.Config, error) {
	db, err := pgx.ParseConfig(app.Database.Postgres.DSN)
	if err != nil {
		return nil, errors.New("源应用 DSN 无效")
	}
	_ = db
	dsn, err := DatabaseDSN(app.Database.Postgres.DSN, l.Op.Data.CandidateDB)
	if err != nil {
		return nil, err
	}
	_, target, err := patchConfig(mustYAML(app), dsn, l.Op.Data.CandidateOriginal, l.Op.Data.CandidateSnapshots, l.Op.Data.Target.Generation, l.Op.Data.Target.SessionGeneration)
	return target, err
}
func operatorDatabase(app *config.Config, l *Lease, name string) (*gorm.DB, error) {
	pg, err := pgx.ParseConfig(l.cfg.AdminDSN)
	if err != nil {
		return nil, err
	}
	_ = pg
	c := app.Database
	c.Postgres.DSN, err = DatabaseDSN(l.cfg.AdminDSN, name)
	if err != nil {
		return nil, err
	}
	return database.Open(c)
}
func trustedSchema(ctx context.Context, g *gorm.DB) error {
	return g.WithContext(ctx).AutoMigrate(&model.Config{}, &model.Asset{}, &model.Environment{}, &model.Pipeline{}, &model.ConfigFreezeState{}, &model.ConfigFreezeEvent{}, &model.ConfigWriteGate{}, &model.ConfigReleaseVersion{}, &model.ConfigReleaseAsset{}, &model.ConfigReleaseHead{}, &model.ConfigReleaseEvent{}, &model.ReleaseStorageAttempt{}, &model.ScopeLifecycleEvent{}, &model.AuthUser{}, &model.AuthSession{})
}
func prepareDatabase(ctx context.Context, l *Lease) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	parsed, err := pgx.ParseConfig(l.cfg.AdminDSN)
	if err != nil {
		return err
	}
	c, err := connectDB(ctx, l.cfg.AdminDSN, parsed.Database)
	if err != nil {
		return err
	}
	defer closePG(c)
	var exists bool
	if c.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, l.Op.Data.CandidateDB).Scan(&exists) != nil {
		return errors.New("候选库预检失败")
	}
	if exists {
		return errors.New("候选数据库已存在；创建阶段状态不明，禁止覆盖，保持维护")
	}
	if _, err = c.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{l.Op.Data.CandidateDB}.Sanitize()+" OWNER "+pgx.Identifier{l.cfg.ApplicationRole}.Sanitize()+" TEMPLATE template0"); err != nil {
		return errors.New("独占候选数据库创建失败")
	}
	comment := "rainbow-maintenance:" + l.cfg.InstanceID + ":" + l.Op.ID
	_, err = c.Exec(ctx, "COMMENT ON DATABASE "+pgx.Identifier{l.Op.Data.CandidateDB}.Sanitize()+" IS '"+comment+"'")
	if err != nil {
		return errors.New("候选库归属登记失败，禁止覆盖")
	}
	return nil
}
func createCandidateBuckets(ctx context.Context, l *Lease, s *Store) error {
	for _, bucket := range []string{l.Op.Data.CandidateOriginal, l.Op.Data.CandidateSnapshots} {
		if err := l.Check(ctx); err != nil {
			return err
		}
		exists, err := s.client.BucketExists(ctx, bucket)
		if err != nil || exists {
			return errors.New("候选 bucket 已存在或状态不明，禁止覆盖")
		}
		if err = s.client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return errors.New("候选 bucket 创建失败")
		}
		if err = l.Check(ctx); err != nil {
			return err
		}
		marker, _ := json.Marshal(map[string]string{"instance_id": l.cfg.InstanceID, "operation_id": l.Op.ID})
		if _, err = s.client.PutObject(ctx, bucket, "_rainbow_maintenance_owner.json", bytes.NewReader(marker), int64(len(marker)), minio.PutObjectOptions{DisableMultipart: true}); err != nil {
			return errors.New("候选 bucket 归属标记写入失败，保留未知资源供核对")
		}
	}
	return nil
}
func PrepareCandidate(ctx context.Context, l *Lease, app *config.Config, s *Store, m *Manifest) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StreamTimeout)
	defer cancel()
	if err := prepareDatabase(ctx, l); err != nil {
		return err
	}
	if err := l.Save(ctx, "candidate_db_created"); err != nil {
		return err
	}
	if err := createCandidateBuckets(ctx, l, s); err != nil {
		return err
	}
	if err := l.Save(ctx, "candidate_resources_created"); err != nil {
		return err
	}
	return fillCandidate(ctx, l, app, s, m)
}
func fillCandidate(ctx context.Context, l *Lease, app *config.Config, s *Store, m *Manifest) error {
	g, err := operatorDatabase(app, l, l.Op.Data.CandidateDB)
	if err != nil {
		return errors.New("候选数据连接失败")
	}
	sqlDB, _ := g.DB()
	defer sqlDB.Close()
	if err = trustedSchema(ctx, g); err != nil {
		return errors.New("候选可信结构迁移失败")
	}
	// Install identity constraints on the empty trusted schema. Running the
	// legacy backfill after importing current rows rewrites their updated_at.
	if err = configdb.MigrateScopeIdentity(ctx, g); err != nil {
		return err
	}
	// Any partial import is isolated. A resumed attempt is not silently truncated.
	c, err := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.CandidateDB)
	if err != nil {
		return err
	}
	defer closePG(c)
	if err = ImportLogical(ctx, c, s, m.Tables); err != nil {
		return err
	}
	if _, err = c.Exec(ctx, `INSERT INTO config_write_gate(id,coordination_count,updated_at) VALUES(1,0,now())`); err != nil {
		return errors.New("候选写协调行初始化失败")
	}
	if _, err = c.Exec(ctx, `UPDATE config_release_version SET storage_bucket=$1,legacy_local=false WHERE storage_backend='minio'`, l.Op.Data.CandidateSnapshots); err != nil {
		return err
	}
	if _, err = c.Exec(ctx, `INSERT INTO release_storage_attempt(id,snapshot_id,request_id,fingerprint,scope_id,bucket,prefix,kind,state,diagnostic,created_at,updated_at) SELECT storage_attempt,snapshot_id,creation_request_id,request_fingerprint,scope_id,storage_bucket,storage_prefix,'restore','committed','',created_at,created_at FROM config_release_version`); err != nil {
		return errors.New("已提交快照 attempt 重建失败")
	}
	if err = configdb.EnsureReleaseNumbering(ctx, g); err != nil {
		return err
	}
	if err = database.PrepareConfigAliasConstraint(ctx, g); err != nil {
		return err
	}
	for _, o := range m.Objects {
		bucket := l.Op.Data.CandidateOriginal
		if o.Kind == "snapshot" {
			bucket = l.Op.Data.CandidateSnapshots
		}
		if _, err = s.copyObject(ctx, l, s.backup, o.File.Key, "", bucket, o.Key, o.File.Bytes, o.File.SHA256); err != nil {
			return err
		}
		l.Op.Data.Progress.Objects++
	}
	if err = retainAuthAndBounds(ctx, l, c); err != nil {
		return err
	}
	for _, q := range []string{"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO " + pgx.Identifier{l.cfg.ApplicationRole}.Sanitize(), "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO " + pgx.Identifier{l.cfg.ApplicationRole}.Sanitize()} {
		if _, err = c.Exec(ctx, q); err != nil {
			return errors.New("候选应用权限准备失败")
		}
	}
	for _, table := range append(businessTableNames(), "auth_users", "auth_sessions", "config_write_gate", "release_storage_attempt") {
		if _, err = c.Exec(ctx, "ALTER TABLE "+pgx.Identifier{table}.Sanitize()+" OWNER TO "+pgx.Identifier{l.cfg.ApplicationRole}.Sanitize()); err != nil {
			return errors.New("候选表所有权转交失败")
		}
	}
	if err = verifyCandidate(ctx, l, app, s, m); err != nil {
		return err
	}
	return l.Save(ctx, "prepared")
}
func retainAuthAndBounds(ctx context.Context, l *Lease, target *pgx.Conn) error {
	source, err := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.Plan.Database)
	if err != nil {
		return err
	}
	defer closePG(source)
	columns := []string{"id", "username", "password_hash", "role", "disabled", "credential_version", "created_at", "updated_at"}
	expr := make([]string, len(columns))
	for i, c := range columns {
		expr[i] = pgx.Identifier{c}.Sanitize() + "::text"
	}
	authSource := source
	if l.cfg.AuthReadDSN != "" {
		authSource, err = openControl(ctx, l.cfg.AuthReadDSN)
		if err != nil {
			return errors.New("当前控制账号不可读取")
		}
		defer closePG(authSource)
		var active bool
		if authSource.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rb_auth_authority WHERE instance_id=$1 AND state='active' AND schema_version=1)`, l.cfg.InstanceID).Scan(&active) != nil || !active {
			return errors.New("控制认证权威未迁移")
		}
	}
	rows, err := authSource.Query(ctx, "SELECT "+strings.Join(expr, ",")+" FROM auth_users ORDER BY id")
	if err != nil {
		return errors.New("读取当前管理员失败")
	}
	r, w := io.Pipe()
	done := make(chan error, 1)
	go func() {
		defer rows.Close()
		var err error
		for rows.Next() {
			values, e := rows.Values()
			if e != nil {
				err = e
				break
			}
			b, e := json.Marshal(values)
			if e != nil {
				err = e
				break
			}
			_, err = copyRows(ctx, strings.NewReader(string(b)+"\n"), w, len(columns))
			if err != nil {
				break
			}
		}
		if err == nil {
			err = rows.Err()
		}
		w.CloseWithError(err)
		done <- err
	}()
	tag, err := target.PgConn().CopyFrom(ctx, r, "COPY auth_users ("+quotedColumns(columns)+") FROM STDIN WITH (FORMAT csv, NULL '\\N')")
	r.CloseWithError(err)
	copyErr := <-done
	if err != nil || copyErr != nil || tag.RowsAffected() < 1 {
		return errors.New("当前管理员保留失败")
	}
	// Source and candidate histories both contribute to the non-regressing bound.
	for _, db := range []*pgx.Conn{source, target} {
		bounds, e := db.Query(ctx, `SELECT scope_id,environment_key,pipeline_key,max(n) FROM (SELECT scope_id,environment_key,pipeline_key,last_version_number n FROM config_release_head UNION ALL SELECT scope_id,environment_key,pipeline_key,substring(version from 2)::bigint FROM config_release_version WHERE version ~ '^v[1-9][0-9]*$') b GROUP BY scope_id,environment_key,pipeline_key`)
		if e != nil {
			return errors.New("读取版本编号上界失败")
		}
		// A second target connection avoids querying on the active source cursor.
		out, e := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.CandidateDB)
		if e != nil {
			bounds.Close()
			return e
		}
		for bounds.Next() {
			var scope, env, pipe string
			var n int64
			if e = bounds.Scan(&scope, &env, &pipe, &n); e != nil {
				break
			}
			_, e = out.Exec(ctx, `UPDATE config_release_head SET last_version_number=GREATEST(last_version_number,$2) WHERE scope_id=$1 OR (environment_key=$3 AND pipeline_key=$4)`, scope, n, env, pipe)
			if e != nil {
				break
			}
		}
		if e == nil {
			e = bounds.Err()
		}
		bounds.Close()
		closePG(out)
		if e != nil {
			return errors.New("合并版本编号上界失败")
		}
	}
	for _, table := range append([]string{"auth_users", "auth_sessions"}, businessTableNames()...) {
		q := fmt.Sprintf(`SELECT setval(pg_get_serial_sequence('%s','id'),COALESCE((SELECT max(id) FROM %s),1),(SELECT count(*)>0 FROM %s))`, table, pgx.Identifier{table}.Sanitize(), pgx.Identifier{table}.Sanitize())
		if _, err = target.Exec(ctx, q); err != nil {
			return errors.New("候选序列上界更新失败")
		}
	}
	return nil
}
func verifyCandidate(ctx context.Context, l *Lease, app *config.Config, s *Store, m *Manifest) error {
	compare, err := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.CandidateDB)
	if err != nil {
		return err
	}
	err = CompareLogical(ctx, compare, s, m.Tables, l.Op.Data.CandidateSnapshots)
	closePG(compare)
	if err != nil {
		return err
	}
	target, err := candidateApp(app, l)
	if err != nil {
		return err
	}
	target.Backup.Distributed.Enabled = false
	g, err := operatorDatabase(target, l, l.Op.Data.CandidateDB)
	if err != nil {
		return err
	}
	sqldb, _ := g.DB()
	defer sqldb.Close()
	for _, table := range m.Tables {
		var n int64
		if err = g.Table(table.Name).Count(&n).Error; err != nil || n != table.Rows {
			return errors.New("候选业务表行数不符")
		}
	}
	for _, o := range m.Objects {
		bucket := l.Op.Data.CandidateOriginal
		if o.Kind == "snapshot" {
			bucket = l.Op.Data.CandidateSnapshots
		}
		f := o.File
		f.Key = o.Key
		if err = s.verify(ctx, bucket, f); err != nil {
			return err
		}
	}
	var bad int64
	queries := []string{
		`SELECT count(*) FROM pipeline p LEFT JOIN environment e ON p.environment_id=e.environment_id WHERE e.id IS NULL`,
		`SELECT count(*) FROM resource_config c LEFT JOIN pipeline p ON c.scope_id=p.scope_id WHERE p.id IS NULL`,
		`SELECT count(*) FROM asset a LEFT JOIN pipeline p ON a.scope_id=p.scope_id WHERE p.id IS NULL`,
		`SELECT count(*) FROM config_release_version v LEFT JOIN pipeline p ON v.scope_id=p.scope_id WHERE p.id IS NULL`,
		`SELECT count(*) FROM config_release_asset a LEFT JOIN config_release_version v ON a.snapshot_id=v.snapshot_id WHERE v.id IS NULL`,
		`SELECT count(*) FROM config_release_head h LEFT JOIN config_release_version v ON h.active_snapshot_id=v.snapshot_id AND h.scope_id=v.scope_id WHERE h.active_snapshot_id IS NOT NULL AND h.active_snapshot_id<>'' AND v.id IS NULL`,
		`SELECT count(*) FROM auth_sessions`,
	}
	for _, q := range queries {
		if err = g.Raw(q).Scan(&bad).Error; err != nil || bad != 0 {
			return errors.New("候选关联、scope 或空会话校验失败")
		}
	}
	svc := service.NewService(g, nil, target.Server.BasePath, target)
	defer svc.CloseDistributedControl()
	return svc.WalkMaintenanceObjects(ctx, func(o service.MaintenanceObject) error { return nil })
}

func businessTableNames() []string {
	var names []string
	for _, t := range backup.BusinessTableAllowlist() {
		names = append(names, t.Name)
	}
	return names
}
func mustYAML(v any) []byte { b, _ := yaml.Marshal(v); return b }
