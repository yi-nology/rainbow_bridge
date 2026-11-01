package businesshost

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
	"gopkg.in/yaml.v3"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type Config struct {
	Instance, PodUID, ControlDSN, ConfigFile, RuntimeDir, Socket, KeyFile string
	// Binary is a fixed deployment argument, never accepted over IPC.
	Binary string
}

type Host struct {
	cfg    Config
	boot   string
	pool   *pgxpool.Pool
	key    []byte
	mu     sync.Mutex
	child  *exec.Cmd
	status Status
}

func Open(ctx context.Context, c Config) (*Host, error) {
	if _, e := uuid.Parse(c.Instance); e != nil {
		return nil, errors.New("invalid host instance")
	}
	if c.PodUID == "" || !filepath.IsAbs(c.Binary) || !filepath.IsAbs(c.ConfigFile) || !filepath.IsAbs(c.Socket) || !filepath.IsAbs(c.RuntimeDir) {
		return nil, errors.New("host paths or Pod identity invalid")
	}
	key, e := os.ReadFile(c.KeyFile)
	if e != nil || len(key) < 32 {
		return nil, errors.New("host authentication unavailable")
	}
	p, e := openPool(ctx, c.ControlDSN)
	if e != nil {
		return nil, e
	}
	var restricted bool
	e = p.QueryRow(ctx, `SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_table_privilege(current_user,'rb_maintenance_instance','INSERT,UPDATE,DELETE') FROM pg_roles WHERE rolname=current_user`).Scan(&restricted)
	if e != nil || !restricted {
		p.Close()
		return nil, errors.New("host control identity is overprivileged or unavailable")
	}
	h := &Host{cfg: c, boot: uuid.NewString(), pool: p, key: key}
	h.status = Status{Protocol: Protocol, PodUID: c.PodUID, BootID: h.boot, State: "idle"}
	return h, nil
}

func (h *Host) Close()         { h.pool.Close() }
func (h *Host) Status() Status { h.mu.Lock(); defer h.mu.Unlock(); return h.status }

func (h *Host) snapshot() ([]byte, *config.Config, string, error) {
	b, e := os.ReadFile(h.cfg.ConfigFile)
	if e != nil {
		return nil, nil, "", errors.New("business configuration unavailable")
	}
	var c config.Config
	if yaml.Unmarshal(b, &c) != nil || !c.Backup.Distributed.WebEnabled || c.Backup.Distributed.InstanceID != h.cfg.Instance {
		return nil, nil, "", errors.New("business configuration identity mismatch")
	}
	sum := sha256.Sum256(b)
	return b, &c, hex.EncodeToString(sum[:]), nil
}

func (h *Host) Start(ctx context.Context, command *Command) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.child != nil && command == nil {
		return nil
	}
	_, app, sha, e := h.snapshot()
	if e != nil {
		return e
	}
	tx, control, e := h.controlTx(ctx)
	if e != nil {
		return errors.New("host control unavailable")
	}
	defer tx.Rollback(ctx)
	if command == nil {
		if control.Mode != "active" {
			return errors.New("maintenance blocks automatic launch")
		}
	} else if !matchesOperation(control, *command) || control.Mode != "checking" || command.ConfigSHA != sha {
		return errors.New("target configuration not yet approved or projected")
	}
	fp, e := maintcontrol.Fingerprint(app)
	id := maintcontrol.Identity{Generation: app.Backup.Distributed.Generation, SessionGeneration: app.Backup.Distributed.SessionGeneration, Fingerprint: fp}
	if e != nil || control.Identity != id {
		return errors.New("host target identity mismatch")
	}
	if h.child != nil {
		return nil
	}
	var unresolved int
	// RLS deliberately exposes only this boot. The definer function, installed by
	// the initializer, checks prior boots without giving HOST global row updates.
	if e = tx.QueryRow(ctx, `SELECT rb_host_unresolved($1,$2,$3)`, h.cfg.Instance, h.cfg.PodUID, h.boot).Scan(&unresolved); e != nil || unresolved != 0 {
		return errors.New("previous business run has no exit proof")
	}
	app.Server.Address = "127.0.0.1:18080"
	raw, e := yaml.Marshal(app)
	if e != nil {
		return e
	}
	if e = os.MkdirAll(h.cfg.RuntimeDir, 0700); e != nil {
		return e
	}
	file := filepath.Join(h.cfg.RuntimeDir, "business.yaml")
	if e = os.WriteFile(file, raw, 0600); e != nil {
		return e
	}
	run := uuid.NewString()
	identity, _ := json.Marshal(id)
	if _, e = tx.Exec(ctx, `INSERT INTO rb_business_run(instance_id,pod_uid,boot_id,run_id,config_sha,identity,state) VALUES($1,$2,$3,$4,$5,$6,'launching')`, h.cfg.Instance, h.cfg.PodUID, h.boot, run, sha, identity); e != nil {
		return e
	}
	// Commit BEFORE exec. A crash between these steps leaves an unresolved run,
	// never fabricated evidence that the previous process stopped cleanly.
	if e = tx.Commit(ctx); e != nil {
		return e
	}
	cmd := exec.Command(h.cfg.Binary, "--config", file, "--no-frontend")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	h.status = Status{Protocol: Protocol, PodUID: h.cfg.PodUID, BootID: h.boot, RunID: run, State: "launching", ConfigSHA: sha}
	if e = cmd.Start(); e != nil {
		h.status.State = "unknown"
		return errors.New("fixed business process did not launch")
	}
	h.child = cmd
	h.status.State = "running"
	// Failure to update this observation keeps the durable launching obligation;
	// it never turns a running child into a stopped row.
	if update, _, err := h.controlTx(ctx); err == nil {
		if _, err = update.Exec(ctx, `UPDATE rb_business_run SET state='running' WHERE run_id=$1`, run); err == nil {
			_ = update.Commit(ctx)
		} else {
			_ = update.Rollback(ctx)
		}
	}
	go h.wait(cmd, run)
	return nil
}

func (h *Host) wait(cmd *exec.Cmd, run string) {
	err := cmd.Wait()
	code := cmd.ProcessState.ExitCode()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.child = nil
	h.status.ExitCode = &code
	h.status.State = "exited"
	if err != nil || code != 0 {
		h.status.State = "unknown"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tx, _, e := h.controlTx(ctx)
	if e != nil {
		h.status.State = "unknown"
		return
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, `UPDATE rb_business_run SET state=$2,exit_code=$3,finished_at=now() WHERE run_id=$1`, run, h.status.State, code)
	if e != nil || tx.Commit(ctx) != nil {
		h.status.State = "unknown"
	}
}

func (h *Host) Stop(ctx context.Context, c Command) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	tx, control, e := h.controlTx(ctx)
	if e != nil {
		return errors.New("host control unavailable")
	}
	defer tx.Rollback(ctx)
	if !matchesOperation(control, c) || control.Mode != "draining" {
		return errors.New("stop operation is stale")
	}
	if h.child != nil {
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		if h.status.State == "draining" {
			return errors.New("business process still draining")
		}
		if e = h.child.Process.Signal(os.Interrupt); e != nil {
			return errors.New("cannot signal business process")
		}
		h.status.State = "draining"
		return errors.New("business process still draining")
	}
	if h.status.State == "idle" {
		var unresolved int
		if e = tx.QueryRow(ctx, `SELECT rb_host_unresolved($1,$2,$3)`, h.cfg.Instance, h.cfg.PodUID, h.boot).Scan(&unresolved); e != nil || unresolved != 0 {
			return errors.New("previous boot exit unknown")
		}
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		h.status.State = "stopped"
		h.status.Operation = c.Operation
		h.status.Token = c.Token
		return nil
	}
	if h.status.State == "stopped" && h.status.RunID == "" {
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		h.status.Operation = c.Operation
		h.status.Token = c.Token
		return nil
	}
	if h.status.State != "exited" && h.status.State != "stopped" {
		return errors.New("business exit has not been proved")
	}
	if h.status.ExitCode == nil || *h.status.ExitCode != 0 {
		return errors.New("business process did not exit cleanly")
	}
	_, e = tx.Exec(ctx, `UPDATE rb_business_run SET state='stopped',operation_id=$2,token=$3 WHERE run_id=$1 AND exit_code=0 AND finished_at IS NOT NULL`, h.status.RunID, c.Operation, c.Token)
	if e != nil || tx.Commit(ctx) != nil {
		return errors.New("exit proof persistence failed")
	}
	h.status.State = "stopped"
	h.status.Operation = c.Operation
	h.status.Token = c.Token
	return nil
}
