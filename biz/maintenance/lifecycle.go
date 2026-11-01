package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/yi-nology/rainbow_bridge/pkg/businesshost"
	"io"
	"net/url"
	"os"
	"strings"
	"time"
)

type lifecycle interface {
	Stop(context.Context, *Lease) error
	Start(context.Context, *Lease) error
}
type deploymentLifecycle struct{ k *Kube }

func (d deploymentLifecycle) Stop(ctx context.Context, l *Lease) error { return d.k.Stop(ctx, l) }
func (d deploymentLifecycle) Start(ctx context.Context, l *Lease) error {
	for _, w := range l.Op.Data.Plan.Workloads {
		if e := d.k.scale(ctx, l, w, w.Replicas, l.Op.Data.Target.Generation); e != nil {
			return e
		}
	}
	return nil
}

func (k *Kube) lifecycle(c Config) (lifecycle, error) {
	if c.ExecutionMode != "pod_sidecar" {
		k.hostKey = nil
		return deploymentLifecycle{k}, nil
	}
	key, e := os.ReadFile(c.HostKeyFile)
	if e != nil || len(key) < 32 {
		return nil, errors.New("内部生命周期凭据不可用")
	}
	k.hostKey = key
	return sidecarLifecycle{k}, nil
}

func (k *Kube) businessPath(p resource, suffix string) string {
	port := ":8080"
	prefix := ""
	if len(k.hostKey) > 0 {
		port = ":19090"
		prefix = "/v1/business"
		join := "?"
		if strings.Contains(suffix, "?") {
			join = "&"
		}
		suffix += join + "rb_pod_uid=" + url.QueryEscape(value(metadata(p), "uid"))
	}
	return k.path("pods", value(metadata(p), "name")+port) + "/proxy" + prefix + suffix
}

type sidecarLifecycle struct{ k *Kube }

func (s sidecarLifecycle) command(ctx context.Context, l *Lease, p resource, action string) (businesshost.Status, error) {
	var status businesshost.Status
	c := businesshost.Command{Instance: l.cfg.InstanceID, PodUID: value(metadata(p), "uid"), Operation: l.Op.ID, Token: l.Op.Token, Action: action, ConfigSHA: l.Op.Data.AppliedConfigHash}
	r, e := s.k.request(ctx, "POST", s.k.path("pods", value(metadata(p), "name")+":19090")+"/proxy/v1/command", c)
	if e != nil {
		return status, e
	}
	defer r.Body.Close()
	e = json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&status)
	if e != nil || status.Protocol != businesshost.Protocol || status.PodUID != c.PodUID || status.BootID == "" {
		return status, errors.New("业务host协议或身份不匹配")
	}
	return status, nil
}

func (s sidecarLifecycle) Stop(ctx context.Context, l *Lease) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StopTimeout)
	defer cancel()
	if l.Op.Data.SidecarMembers == nil {
		l.Op.Data.SidecarMembers = map[string]businesshost.Status{}
	}
	if e := l.Save(ctx, "stopping"); e != nil {
		return e
	}
	for {
		if e := l.Check(ctx); e != nil {
			return e
		}
		pods, _, e := s.k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
		if e != nil {
			return e
		}
		all := len(pods) > 0
		for _, p := range pods {
			status, e := s.command(ctx, l, p, "stop")
			if e != nil || status.State != "stopped" || status.Operation != l.Op.ID || status.Token != l.Op.Token {
				all = false
				continue
			}
			l.Op.Data.SidecarMembers[status.PodUID] = status
		}
		if e = l.Save(ctx, "stopping"); e != nil {
			return e
		}
		// This includes vanished old Pods and prior host boots. Absence/heartbeat
		// expiration never turns launching/running/unknown into exit proof.
		var unresolved int
		if e = l.conn.QueryRow(ctx, `SELECT rb_host_unresolved_all($1)`, l.cfg.InstanceID).Scan(&unresolved); e != nil {
			return errors.New("持久业务run证明不可用")
		}
		if all && unresolved == 0 {
			current, _, e := s.k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
			if e != nil {
				return e
			}
			stable := len(current) == len(pods)
			for _, p := range current {
				if _, ok := l.Op.Data.SidecarMembers[value(metadata(p), "uid")]; !ok {
					stable = false
				}
			}
			if stable {
				return l.Save(ctx, "stopped")
			}
		}
		select {
		case <-ctx.Done():
			return errors.New("业务子进程停止证明超时，保持维护")
		case <-time.After(300 * time.Millisecond):
		}
	}
}

func (s sidecarLifecycle) Start(ctx context.Context, l *Lease) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StartTimeout)
	defer cancel()
	for {
		if e := l.Check(ctx); e != nil {
			return e
		}
		pods, _, e := s.k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
		if e != nil {
			return e
		}
		all := len(pods) > 0
		for _, p := range pods {
			status, e := s.command(ctx, l, p, "start")
			if e != nil || status.State != "running" || status.ConfigSHA != l.Op.Data.AppliedConfigHash {
				all = false
			}
		}
		if all {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("实际Secret投射或业务启动尚未就绪，保持检查态")
		case <-time.After(500 * time.Millisecond):
		}
	}
}
