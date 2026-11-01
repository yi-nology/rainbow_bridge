package maintenance

import (
	"context"
	"time"
)

// WatchLock uses a separate connection; pgx.Conn must not be used concurrently.
// It cancels in-flight network streams after control loss. This is cancellation,
// not distributed atomicity: takeover still requires a dead prior executor.
func (l *Lease) WatchLock(parent context.Context) (context.Context, context.CancelFunc, error) {
	ctx, cancel := context.WithCancel(parent)
	c, err := openControl(ctx, l.cfg.ControlDSN)
	if err != nil {
		cancel()
		return ctx, cancel, ErrOwnership
	}
	go func() {
		defer closePG(c)
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				check, stop := context.WithTimeout(ctx, 2*time.Second)
				var ok bool
				err := c.QueryRow(check, `SELECT i.token=$2 AND (i.operation_id=$3 OR (i.mode='active' AND o.terminal)) AND EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted AND pid=$4) FROM rb_maintenance_instance i JOIN rb_maintenance_operation o ON o.operation_id=$3 WHERE i.instance_id=$1`, l.cfg.InstanceID, l.Op.Token, l.Op.ID, l.pid).Scan(&ok)
				stop()
				if err != nil || !ok {
					cancel()
					return
				}
			}
		}
	}()
	return ctx, cancel, nil
}
