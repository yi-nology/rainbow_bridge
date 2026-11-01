package maintenance

import (
	"context"
	"errors"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
)

// VerifyCompleted is read-only and makes response-loss replay check actual Pods,
// rather than treating the terminal journal alone as business availability.
func VerifyCompleted(ctx context.Context, cfg Config, k *Kube, op Operation) error {
	if !op.Terminal {
		return errors.New("操作尚未提交")
	}
	active, e := readActive(ctx, cfg)
	if e != nil || active != op.Data.Target {
		return errors.New("当前业务代次已变化，不能把旧结果当作当前恢复完成")
	}
	app, _, e := k.appConfig(ctx, cfg)
	if e != nil {
		return e
	}
	fp, e := maintcontrol.Fingerprint(app)
	if e != nil || fp != active.Fingerprint {
		return errors.New("当前连接与已提交代次不一致")
	}
	l := &Lease{cfg: cfg, Op: op}
	if e = k.waitPods(ctx, l, app, false); e != nil {
		return e
	}
	return checkRuntime(ctx, l, k, app)
}
