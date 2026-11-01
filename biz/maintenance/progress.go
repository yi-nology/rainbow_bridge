package maintenance

import (
	"context"
	"time"
)

type Progress struct {
	Objects, Bytes           int64
	TotalObjects, TotalBytes int64
	UpdatedAt                time.Time
}

// Updates are bounded and durable; totals are plans, bytes only count data actually read.
type progressWriter struct {
	ctx   context.Context
	lease *Lease
}

func (w progressWriter) Write(b []byte) (int, error) {
	p := &w.lease.Op.Data.Progress
	p.Bytes += int64(len(b))
	if time.Since(p.UpdatedAt) > time.Second {
		p.UpdatedAt = time.Now().UTC()
		if e := w.lease.Save(w.ctx, w.lease.Op.Phase); e != nil {
			return 0, e
		}
	}
	return len(b), nil
}
func (l *Lease) resetProgress() {
	l.Op.Data.Progress = Progress{TotalObjects: int64(l.Op.Data.Plan.ObjectCount), TotalBytes: l.Op.Data.Plan.DataBytes}
}
