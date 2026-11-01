// Package maintcontrol implements the application's read-only maintenance protocol.
// Its database is deliberately independent of the replaceable business database.
package maintcontrol

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"gorm.io/gorm"
)

var ErrBlocked = errors.New("全局维护保护：控制状态不可用、正在维护或实例代次不匹配")
var ErrStartupBlocked = fmt.Errorf("业务数据库打开前维护校验失败: %w", ErrBlocked)

type Identity struct {
	Generation        int64  `json:"generation"`
	SessionGeneration int64  `json:"session_generation"`
	Fingerprint       string `json:"fingerprint"`
}

// Fingerprint excludes secrets, but binds a generation to its exact DB and stores.
func Fingerprint(cfg *config.Config) (string, error) {
	if cfg == nil || (cfg.Database.Driver != "postgres" && cfg.Database.Driver != "postgresql") || cfg.Storage.Type != "minio" || cfg.ReleaseStorage.Type != "minio" || cfg.Backup.Enabled {
		return "", ErrBlocked
	}
	db, err := pgx.ParseConfig(cfg.Database.Postgres.DSN)
	if err != nil {
		return "", ErrBlocked
	}
	if db.Database == "" || db.User == "" || cfg.Storage.Minio.Bucket == "" || cfg.ReleaseStorage.Bucket == "" || cfg.Storage.Minio.Bucket == cfg.ReleaseStorage.Bucket {
		return "", ErrBlocked
	}
	b, _ := json.Marshal([]any{db.Host, db.Port, db.Database, db.User, cfg.Storage.Minio.Endpoint, cfg.Storage.Minio.UseSSL, cfg.Storage.Minio.Bucket, cfg.ReleaseStorage.Bucket, cfg.Redis.Enabled, cfg.Redis.Address, cfg.Redis.DB})
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}

type Guard struct {
	active      atomic.Int64
	pool        *pgxpool.Pool
	cfg         config.DistributedBackupConfig
	fingerprint string
}

func (g *Guard) Track() func() {
	if g == nil {
		return func() {}
	}
	g.active.Add(1)
	return func() { g.active.Add(-1) }
}
func (g *Guard) InFlight() int64 {
	if g == nil {
		return 0
	}
	return g.active.Load()
}

func New(cfg *config.Config) (*Guard, error) {
	if cfg == nil || !cfg.Backup.Distributed.Enabled {
		return nil, nil
	}
	c := cfg.Backup.Distributed
	if _, err := uuid.Parse(c.InstanceID); err != nil || c.Generation < 1 || c.SessionGeneration < 1 {
		return nil, ErrBlocked
	}
	fp, err := Fingerprint(cfg)
	if err != nil {
		return nil, err
	}
	pc, err := pgxpool.ParseConfig(c.ControlDSN)
	if err != nil {
		return nil, ErrBlocked
	}
	business, _ := pgx.ParseConfig(cfg.Database.Postgres.DSN)
	if pc.ConnConfig.Database == business.Database || pc.ConnConfig.Database == "" {
		return nil, ErrBlocked
	}
	pc.MaxConns = 3
	pc.MinConns = 0
	pc.ConnConfig.ConnectTimeout = 3 * time.Second
	pool, err := pgxpool.NewWithConfig(context.Background(), pc)
	if err != nil {
		return nil, ErrBlocked
	}
	return &Guard{pool: pool, cfg: c, fingerprint: fp}, nil
}

func (g *Guard) Close() {
	if g != nil {
		g.pool.Close()
	}
}

// Check returns checking=true only for the explicitly approved pending identity.
// A disconnected control database never becomes permission to start or write.
func (g *Guard) Check(ctx context.Context, allowChecking bool) (checking bool, err error) {
	if g == nil {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var mode string
	var active, pending []byte
	var readonly bool
	err = g.pool.QueryRow(ctx, `SELECT i.mode,i.active,i.pending,NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT has_table_privilege(current_user,'rb_maintenance_instance','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_schema_privilege(current_user,'public','CREATE') FROM rb_maintenance_instance i JOIN pg_roles r ON r.rolname=current_user WHERE instance_id=$1`, g.cfg.InstanceID).Scan(&mode, &active, &pending, &readonly)
	if err != nil || !readonly {
		return false, ErrBlocked
	}
	var expected Identity
	if mode == "checking" && allowChecking {
		active = pending
		checking = true
	} else if mode != "active" {
		return false, ErrBlocked
	}
	if json.Unmarshal(active, &expected) != nil || expected.Generation != g.cfg.Generation || expected.SessionGeneration != g.cfg.SessionGeneration || expected.Fingerprint != g.fingerprint {
		return false, ErrBlocked
	}
	return checking, nil
}

func (g *Guard) Namespace() string {
	if g == nil {
		return ""
	}
	return fmt.Sprintf("rb:%s:g%d:", g.cfg.InstanceID, g.cfg.Generation)
}

// Attach covers ORM writes outside withWriteGate too (authentication, attempt
// registration and failure reconciliation). SQL startup writes are checked before
// migrations, and external maintenance CLI writes use the operator protocol.
func (g *Guard) Attach(db *gorm.DB) error {
	if g == nil {
		return nil
	}
	check := func(tx *gorm.DB) {
		if _, err := g.Check(tx.Statement.Context, false); err != nil {
			tx.AddError(err)
		}
	}
	if err := db.Callback().Create().Before("gorm:begin_transaction").Register("rb:maintenance", check); err != nil {
		return err
	}
	if err := db.Callback().Update().Before("gorm:begin_transaction").Register("rb:maintenance", check); err != nil {
		return err
	}
	if err := db.Callback().Delete().Before("gorm:begin_transaction").Register("rb:maintenance", check); err != nil {
		return err
	}
	return db.Callback().Raw().Before("gorm:raw").Register("rb:maintenance", check)
}
