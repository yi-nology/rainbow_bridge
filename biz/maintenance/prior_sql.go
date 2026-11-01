package maintenance

import (
	"context"
	"errors"
	"time"
)

func (l *Lease) drainPriorBeforeClaim(ctx context.Context) error {
	// Identity/role exclusivity was bound by the original plan. Validate again
	// using control catalog before terminating any old operator connection.
	var safe bool
	err := l.conn.QueryRow(ctx, `SELECT NOT r.rolsuper AND shobj_description(r.oid,'pg_authid')=$1 AND r.oid=d.datdba FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`, "rainbow-maintenance:"+l.cfg.InstanceID).Scan(&safe)
	if err != nil || !safe {
		return errors.New("接续维护角色独占归属无法确认")
	}
	if _, err = l.conn.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=current_user AND pid<>pg_backend_pid()`); err != nil {
		return errors.New("不能终止旧维护 SQL 动作")
	}
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	for {
		var n int
		if l.conn.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE usename=current_user AND pid<>pg_backend_pid()`).Scan(&n) != nil {
			return errors.New("旧维护 SQL 排空确认失败")
		}
		if n == 0 {
			return nil
		}
		select {
		case <-time.After(100 * time.Millisecond):
		case <-deadline.C:
			return errors.New("旧维护 SQL 仍在执行，禁止接管")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
