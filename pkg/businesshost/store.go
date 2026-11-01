package businesshost

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
)

type Control struct {
	Mode, Operation string
	Token           int64
	Identity        maintcontrol.Identity
}

// controlTx serializes launch permission with operation acceptance/epoch changes.
// A launch is journaled before exec, so a lost host is an unresolved obligation.
func (h *Host) controlTx(ctx context.Context) (pgx.Tx, Control, error) {
	var c Control
	tx, e := h.pool.Begin(ctx)
	if e != nil {
		return nil, c, e
	}
	fail := func(err error) (pgx.Tx, Control, error) { _ = tx.Rollback(ctx); return nil, c, err }
	if _, e = tx.Exec(ctx, `SET LOCAL statement_timeout='3s'`); e != nil {
		return fail(e)
	}
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,2)),set_config('rainbow.host_pod',$2,true),set_config('rainbow.host_boot',$3,true)`, h.cfg.Instance, h.cfg.PodUID, h.boot); e != nil {
		return fail(e)
	}
	var active, pending []byte
	e = tx.QueryRow(ctx, `SELECT mode,COALESCE(operation_id::text,''),token,active,pending FROM rb_maintenance_instance WHERE instance_id=$1`, h.cfg.Instance).Scan(&c.Mode, &c.Operation, &c.Token, &active, &pending)
	if e != nil {
		return fail(e)
	}
	if c.Mode == "checking" {
		active = pending
	}
	if json.Unmarshal(active, &c.Identity) != nil {
		return fail(errors.New("invalid control identity"))
	}
	return tx, c, nil
}

func openPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	c, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		return nil, errors.New("host control configuration invalid")
	}
	c.MaxConns = 3
	return pgxpool.NewWithConfig(ctx, c)
}

func matchesOperation(c Control, cmd Command) bool {
	return c.Mode != "active" && c.Operation == cmd.Operation && c.Token == cmd.Token
}
