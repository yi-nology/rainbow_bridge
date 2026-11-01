package maintenance

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
)

func checkOperator(ctx context.Context, cfg Config, app *config.Config) error {
	if app.Backup.Distributed.WebEnabled && cfg.AuthReadDSN == "" {
		return errors.New("网页模式必须从控制认证权威保留当前账号")
	}
	operator, e := pgx.ParseConfig(cfg.AdminDSN)
	if e != nil {
		return errors.New("维护连接格式无效")
	}
	control, e := pgx.ParseConfig(cfg.ControlDSN)
	if e != nil {
		return errors.New("控制连接格式无效")
	}
	reader, e := pgx.ParseConfig(app.Backup.Distributed.ControlDSN)
	if e != nil {
		return errors.New("应用控制连接格式无效")
	}
	business, e := pgx.ParseConfig(app.Database.Postgres.DSN)
	if e != nil {
		return errors.New("业务连接格式无效")
	}
	if control.User != operator.User || control.User == reader.User || reader.User == business.User || control.Host != reader.Host || control.Port != reader.Port || control.Database != reader.Database || control.Database == business.Database || control.Database == "postgres" || control.Database == "template0" || control.Database == "template1" || operator.Host != business.Host || operator.Port != business.Port || operator.Host != control.Host || operator.Port != control.Port {
		return errors.New("首批要求同一 PG 端点的独立业务/控制库，以及分离的应用/只读控制/维护身份")
	}
	c, e := openControl(ctx, cfg.ControlDSN)
	if e != nil {
		return errors.New("维护身份验证失败")
	}
	defer c.Close(ctx)
	var valid bool
	e = c.QueryRow(ctx, `SELECT NOT r.rolsuper AND r.rolcreatedb AND r.rolcreaterole AND shobj_description(r.oid,'pg_authid')=$1 AND r.oid=d.datdba AND current_user=session_user FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`, "rainbow-maintenance:"+cfg.InstanceID).Scan(&valid)
	if e != nil || !valid {
		return errors.New("维护角色必须独占、非超级用户并拥有独立控制库")
	}
	return nil
}
