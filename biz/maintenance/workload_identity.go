package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/maintcontrol"
)

func deploymentHash(r resource) string {
	b, _ := json.Marshal(object(r, "spec"))
	var spec resource
	_ = json.Unmarshal(b, &spec)
	delete(spec, "replicas")
	m := metadata(object(spec, "template"))
	a := object(m, "annotations")
	delete(a, "rainbow-bridge.io/maintenance-generation")
	if len(a) == 0 {
		delete(m, "annotations")
	}
	return hashJSON(spec)
}
func (k *Kube) verifyServingProtocol(ctx context.Context, app *config.Config, workloads []Workload, identity maintcontrol.Identity) error {
	pods, _, err := k.matchingPods(ctx, workloads)
	if err != nil {
		return err
	}
	var count int
	for _, w := range workloads {
		count += int(w.Replicas)
	}
	if len(pods) != count {
		return errors.New("计划时实际 Pod 数与 allowlist 副本数不一致")
	}
	for _, p := range pods {
		path := k.businessPath(p, app.Server.BasePath+"/ping")
		r, err := k.request(ctx, "GET", path, nil)
		if err != nil {
			return errors.New("Pod 未证明已接入控制协议")
		}
		got, err := probeIdentity(r)
		if app.Backup.Distributed.WebEnabled && got.Authority != "control-v1" {
			return errors.New("Pod未接入同一控制认证权威")
		}
		if err != nil || got.Checking || got.Generation != identity.Generation || got.Session != identity.SessionGeneration || got.Fingerprint != identity.Fingerprint {
			return errors.New("Pod 的维护协议、连接或代次不一致")
		}
	}
	return nil
}
