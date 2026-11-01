package maintenance

import (
	"context"
	"encoding/json"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"time"
)

// Cancel direction and persistent maintenance state form one transaction.
// Neither an interrupted transaction nor a lost response may resume forward.
// Unknown old Pod termination obligations remain until actually proved.
func (l *Lease) beginAbort(ctx context.Context) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	d := l.Op.Data
	d.Aborting = true
	d.Target = maintcontrol.Identity{}
	if d.PhaseTimes == nil {
		d.PhaseTimes = map[string]time.Time{}
	}
	d.PhaseTimes["aborting"] = time.Now().UTC()
	b, _ := json.Marshal(d)
	tx, err := l.conn.Begin(ctx)
	if err != nil {
		return ErrOwnership
	}
	defer tx.Rollback(context.Background())
	tag, err := tx.Exec(ctx, `UPDATE rb_maintenance_instance SET mode='draining',pending=NULL,updated_at=now() WHERE instance_id=$1 AND token=$2 AND operation_id=$3`, l.cfg.InstanceID, l.Op.Token, l.Op.ID)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrOwnership
	}
	tag, err = tx.Exec(ctx, `UPDATE rb_maintenance_operation SET phase='aborting',data=$3,updated_at=now() WHERE operation_id=$1 AND token=$2 AND NOT terminal`, l.Op.ID, l.Op.Token, b)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrOwnership
	}
	if tx.Commit(ctx) != nil {
		return ErrOwnership
	}
	l.Op.Data = d
	l.Op.Phase = "aborting"
	return nil
}
