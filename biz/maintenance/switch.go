package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"io"
	"net/url"
	"time"
)

func (l *Lease) reserveGeneration(ctx context.Context) error {
	if l.Op.Data.Target.Generation != 0 {
		return nil
	}
	if err := l.Check(ctx); err != nil {
		return err
	}
	tx, err := l.conn.Begin(ctx)
	if err != nil {
		return ErrOwnership
	}
	defer tx.Rollback(context.Background())
	var n int64
	if err = tx.QueryRow(ctx, `UPDATE rb_maintenance_instance SET next_generation=next_generation+1 WHERE instance_id=$1 AND token=$2 AND operation_id=$3 RETURNING next_generation`, l.cfg.InstanceID, l.Op.Token, l.Op.ID).Scan(&n); err != nil {
		return ErrOwnership
	}
	l.Op.Data.Target = maintcontrol.Identity{Generation: n, SessionGeneration: n}
	b, _ := json.Marshal(l.Op.Data)
	if _, err = tx.Exec(ctx, `UPDATE rb_maintenance_operation SET data=$2 WHERE operation_id=$1 AND token=$3`, l.Op.ID, b, l.Op.Token); err != nil || tx.Commit(ctx) != nil {
		return ErrOwnership
	}
	return nil
}
func (l *Lease) checking(ctx context.Context, target maintcontrol.Identity) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	b, _ := json.Marshal(target)
	tag, err := l.conn.Exec(ctx, `UPDATE rb_maintenance_instance SET mode='checking',pending=$4,updated_at=now() WHERE instance_id=$1 AND token=$2 AND operation_id=$3`, l.cfg.InstanceID, l.Op.Token, l.Op.ID, b)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrOwnership
	}
	return nil
}
func (l *Lease) complete(ctx context.Context) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	tx, err := l.conn.Begin(ctx)
	if err != nil {
		return ErrOwnership
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,2))`, l.cfg.InstanceID); err != nil {
		return ErrOwnership
	}
	tag, err := tx.Exec(ctx, `UPDATE rb_maintenance_instance SET active=pending,pending=NULL,mode='active',operation_id=NULL,updated_at=now() WHERE instance_id=$1 AND token=$2 AND operation_id=$3 AND mode='checking' AND pending IS NOT NULL`, l.cfg.InstanceID, l.Op.Token, l.Op.ID)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrOwnership
	}
	phase := "completed"
	if l.cfg.AuthReadDSN != "" && l.Op.Kind == "restore" {
		if _, err = tx.Exec(ctx, `UPDATE rb_auth_authority SET session_epoch=session_epoch+1 WHERE instance_id=$1 AND state='active'`, l.cfg.InstanceID); err != nil {
			return ErrOwnership
		}
	}
	if l.Op.Data.Aborting {
		phase = "aborted"
	}
	if l.Op.Data.PhaseTimes == nil {
		l.Op.Data.PhaseTimes = map[string]time.Time{}
	}
	l.Op.Data.PhaseTimes[phase] = time.Now().UTC()
	data, _ := json.Marshal(l.Op.Data)
	if _, err = tx.Exec(ctx, `UPDATE rb_maintenance_operation SET terminal=true,phase=$2,data=$4,updated_at=now() WHERE operation_id=$1 AND token=$3`, l.Op.ID, phase, l.Op.Token, data); err != nil {
		return ErrOwnership
	}
	if err = tx.Commit(ctx); err != nil {
		return ErrOwnership
	}
	l.Op.Terminal = true
	l.Op.Phase = phase
	return nil
}
func (k *Kube) waitPods(ctx context.Context, l *Lease, app *config.Config, checking bool) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StartTimeout)
	defer cancel()
	var expected int
	for _, w := range l.Op.Data.Plan.Workloads {
		expected += int(w.Replicas)
	}
	for {
		pods, _, err := k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
		if err != nil {
			return err
		}
		all := len(pods) == expected
		for _, p := range pods {
			uid := value(metadata(p), "uid")
			_ = uid
			path := k.path("pods", value(metadata(p), "name")+":8080") + "/proxy" + app.Server.BasePath + "/ping"
			res, e := k.request(ctx, "GET", path, nil)
			if e != nil {
				all = false
				continue
			}
			got, e := probeIdentity(res)
			if app.Backup.Distributed.WebEnabled && got.Authority != "control-v1" {
				return errors.New("候选Pod未接入控制认证权威")
			}
			if e != nil || got.Generation != l.Op.Data.Target.Generation || got.Session != l.Op.Data.Target.SessionGeneration || got.Fingerprint != l.Op.Data.Target.Fingerprint || got.Checking != checking {
				all = false
				continue
			}
			if !checking {
				ready := false
				for _, cond := range array(object(p, "status"), "conditions") {
					c := resource(cond.(map[string]any))
					if value(c, "type") == "Ready" && value(c, "status") == "True" {
						ready = true
					}
				}
				if !ready {
					all = false
				}
			}
		}
		if all {
			return nil
		}
		select {
		case <-time.After(500 * time.Millisecond):
		case <-ctx.Done():
			return errors.New("全部业务 Pod 的连接、代次或 Ready 校验未完成")
		}
	}
}
func Switch(ctx context.Context, l *Lease, k *Kube, source *config.Config, oldRaw []byte) error {
	var target *config.Config
	var want []byte
	var err error
	if l.Op.Kind == "backup" && !l.Op.Data.Aborting {
		target = source
		l.Op.Data.Target = l.Op.Data.Plan.Active
		want = oldRaw
	} else {
		db, err := pgx.ParseConfig(source.Database.Postgres.DSN)
		if err != nil {
			return err
		}
		orig, snap := l.Op.Data.Plan.OriginalBucket, l.Op.Data.Plan.SnapshotBucket
		if !l.Op.Data.Aborting {
			db.Database = l.Op.Data.CandidateDB
			orig = l.Op.Data.CandidateOriginal
			snap = l.Op.Data.CandidateSnapshots
		}
		dsn, e := DatabaseDSN(source.Database.Postgres.DSN, db.Database)
		if e != nil {
			return e
		}
		want, target, err = patchConfig(oldRaw, dsn, orig, snap, l.Op.Data.Target.Generation, l.Op.Data.Target.SessionGeneration)
		if err != nil {
			return err
		}
		fp, e := maintcontrol.Fingerprint(target)
		if e != nil {
			return e
		}
		l.Op.Data.Target.Fingerprint = fp
	}
	wantHash := digest(want)
	known := false
	for _, hash := range l.Op.Data.AllowedConfigHashes {
		if hash == wantHash {
			known = true
		}
	}
	if !known {
		l.Op.Data.AllowedConfigHashes = append(l.Op.Data.AllowedConfigHashes, wantHash)
	}
	if err = l.Save(ctx, "configuration_switching"); err != nil {
		return err
	}
	if err = k.applyConfig(ctx, l, want); err != nil {
		return err
	}
	l.Op.Data.AppliedConfigHash = digest(want)
	if err = l.Save(ctx, "configuration_switched"); err != nil {
		return err
	}
	if err = l.checking(ctx, l.Op.Data.Target); err != nil {
		return err
	}
	if err = fence(ctx, l, source, true); err != nil {
		return err
	}
	for _, w := range l.Op.Data.Plan.Workloads {
		if err = k.scale(ctx, l, w, w.Replicas, l.Op.Data.Target.Generation); err != nil {
			return err
		}
	}
	if err = l.Save(ctx, "starting"); err != nil {
		return err
	}
	if err = k.waitPods(ctx, l, target, true); err != nil {
		return err
	}
	if err = checkRuntime(ctx, l, k, target); err != nil {
		return err
	}
	if err = l.Save(ctx, "checked"); err != nil {
		return err
	}
	if err = l.complete(ctx); err != nil {
		return err
	}
	return k.waitPods(ctx, l, target, false)
}
func checkRuntime(ctx context.Context, l *Lease, k *Kube, app *config.Config) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StartTimeout)
	defer cancel()
	db, _ := pgx.ParseConfig(app.Database.Postgres.DSN)
	c, err := connectDB(ctx, l.cfg.AdminDSN, db.Database)
	if err != nil {
		return err
	}
	defer closePG(c)
	rows, err := c.Query(ctx, `SELECT h.environment_key,h.pipeline_key,h.active_snapshot_id,h.scope_id,v.version,v.asset_count FROM config_release_head h JOIN pipeline p ON p.scope_id=h.scope_id JOIN config_release_version v ON v.snapshot_id=h.active_snapshot_id WHERE h.active_snapshot_id IS NOT NULL AND h.active_snapshot_id<>'' AND p.deleted_at IS NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	pods, _, err := k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
	if err != nil {
		return err
	}
	for rows.Next() {
		var env, pipe, snapshot, scope, version string
		var assets int64
		if err = rows.Scan(&env, &pipe, &snapshot, &scope, &version, &assets); err != nil {
			return err
		}
		for _, p := range pods {
			path := k.path("pods", value(metadata(p), "name")+":8080") + "/proxy" + app.Server.BasePath + "/api/v1/runtime/release?environment_key=" + url.QueryEscape(env) + "&pipeline_key=" + url.QueryEscape(pipe)
			res, e := k.requestHeaders(ctx, "GET", path, nil, map[string]string{"x-environment": env, "x-pipeline": pipe})
			if e != nil {
				return errors.New("候选 runtime 读取失败")
			}
			body, e := io.ReadAll(io.LimitReader(res.Body, model.ReleaseMaxPayloadByte+1))
			res.Body.Close()
			var view struct {
				Code int
				Data struct {
					Snapshot string `json:"snapshot_id"`
				}
			}
			if e != nil || len(body) > model.ReleaseMaxPayloadByte || json.Unmarshal(body, &view) != nil || (view.Code != 200 && view.Code != 0) || view.Data.Snapshot != snapshot {
				return fmt.Errorf("候选 runtime 未指向批准快照")
			}
			base := k.path("pods", value(metadata(p), "name")+":8080") + "/proxy" + app.Server.BasePath + "/api/v1/"
			headers := map[string]string{"x-environment": env, "x-pipeline": pipe}
			for _, endpoint := range []string{"runtime/static?environment_key=" + url.QueryEscape(env) + "&pipeline_key=" + url.QueryEscape(pipe), "runtime/release/static?environment_key=" + url.QueryEscape(env) + "&pipeline_key=" + url.QueryEscape(pipe) + "&scope_id=" + scope + "&version=" + url.QueryEscape(version) + "&expected_snapshot_id=" + snapshot} {
				if e = k.checkZIP(ctx, base+endpoint, headers, assets); e != nil {
					return e
				}
			}
		}
	}
	return rows.Err()
}
