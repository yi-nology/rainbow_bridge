package maintenance

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type KubeConfig struct {
	Server    string `yaml:"server"`
	TokenFile string `yaml:"token_file"`
	CAFile    string `yaml:"ca_file"`
}
type resource map[string]any

func object(r resource, key string) resource {
	switch m := r[key].(type) {
	case resource:
		return m
	case map[string]any:
		return resource(m)
	default:
		return nil
	}
}
func value(r resource, key string) string { s, _ := r[key].(string); return s }
func metadata(r resource) resource        { return object(r, "metadata") }
func array(r resource, key string) []any  { a, _ := r[key].([]any); return a }
func number(r resource, key string) int32 { v, _ := r[key].(float64); return int32(v) }

type Kube struct {
	client                   *http.Client
	server, token, namespace string
}

func NewKube(c KubeConfig, namespace string) (*Kube, error) {
	if c.Server == "" {
		c.Server = "https://" + os.Getenv("KUBERNETES_SERVICE_HOST") + ":" + os.Getenv("KUBERNETES_SERVICE_PORT")
	}
	u, err := url.Parse(c.Server)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, errors.New("Kubernetes 必须使用可验证的 HTTPS API")
	}
	if c.TokenFile == "" {
		c.TokenFile = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	}
	if c.CAFile == "" {
		c.CAFile = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	}
	token, err := os.ReadFile(c.TokenFile)
	if err != nil {
		return nil, errors.New("无法读取运维 ServiceAccount 凭证")
	}
	ca, err := os.ReadFile(c.CAFile)
	if err != nil {
		return nil, errors.New("无法读取 Kubernetes CA")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(ca) {
		return nil, errors.New("Kubernetes CA 无效")
	}
	tr := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, ResponseHeaderTimeout: 15 * time.Second}
	return &Kube{client: &http.Client{Transport: tr}, server: strings.TrimRight(c.Server, "/"), token: strings.TrimSpace(string(token)), namespace: namespace}, nil
}
func (k *Kube) path(kind, name string) string {
	prefix := "/api/v1/"
	if kind == "deployments" || kind == "replicasets" {
		prefix = "/apis/apps/v1/"
	}
	if kind == "horizontalpodautoscalers" {
		prefix = "/apis/autoscaling/v2/"
	}
	if kind == "jobs" || kind == "cronjobs" {
		prefix = "/apis/batch/v1/"
	}
	p := prefix + "namespaces/" + url.PathEscape(k.namespace) + "/" + kind
	if name != "" {
		p += "/" + url.PathEscape(name)
	}
	return p
}
func (k *Kube) request(ctx context.Context, method, path string, body any) (*http.Response, error) {
	return k.requestHeaders(ctx, method, path, body, nil)
}
func (k *Kube) requestHeaders(ctx context.Context, method, path string, body any, headers map[string]string) (*http.Response, error) {
	var b io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		b = bytes.NewReader(data)
	}
	r, err := http.NewRequestWithContext(ctx, method, k.server+path, b)
	if err != nil {
		return nil, err
	}
	r.Header.Set("Authorization", "Bearer "+k.token)
	r.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		r.Header.Set(key, value)
	}
	res, err := k.client.Do(r)
	if err != nil {
		return nil, errors.New("Kubernetes 请求失败")
	}
	maintenanceProbe := strings.HasSuffix(path, "/ping") && res.StatusCode == 503 && res.Header.Get("X-Rainbow-Maintenance-Protocol") == "1" && res.Header.Get("X-Rainbow-Checking") == "true"
	if (res.StatusCode < 200 || res.StatusCode > 299) && !maintenanceProbe {
		res.Body.Close()
		return nil, fmt.Errorf("Kubernetes 拒绝操作，HTTP %d", res.StatusCode)
	}
	return res, nil
}
func (k *Kube) get(ctx context.Context, kind, name string) (resource, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	res, err := k.request(ctx, "GET", k.path(kind, name), nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var r resource
	err = json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(&r)
	return r, err
}
func (k *Kube) put(ctx context.Context, kind, name string, r resource, uid string) (resource, error) {
	if value(metadata(r), "uid") != uid || value(metadata(r), "resourceVersion") == "" {
		return nil, errors.New("Kubernetes UID/resourceVersion 不匹配")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	res, err := k.request(ctx, "PUT", k.path(kind, name), r)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var result resource
	err = json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(&result)
	return result, err
}
func (k *Kube) Executor(ctx context.Context, instance string) (Executor, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	self := Executor{Pod: os.Getenv("RB_MAINTENANCE_POD"), UID: os.Getenv("RB_MAINTENANCE_POD_UID")}
	if self.Pod == "" || self.UID == "" {
		return self, errors.New("写命令必须在有 Downward API 身份的独占运维 Job 中运行")
	}
	var p resource
	for {
		var err error
		p, err = k.get(ctx, "pods", self.Pod)
		if err != nil {
			return self, err
		}
		if value(metadata(p), "uid") != self.UID {
			return self, errors.New("运维 Pod UID 不匹配")
		}
		phase := value(object(p, "status"), "phase")
		if phase == "Running" {
			break
		}
		if phase != "Pending" {
			return self, errors.New("运维 Job 的 Pod 非运行状态")
		}
		select {
		case <-time.After(200 * time.Millisecond):
		case <-ctx.Done():
			return self, errors.New("等待运维 Pod 运行身份超时")
		}
	}
	refs := array(metadata(p), "ownerReferences")
	if len(refs) != 1 || value(resource(refs[0].(map[string]any)), "kind") != "Job" {
		return self, errors.New("维护执行者必须由独占 Job 管理")
	}
	ref := resource(refs[0].(map[string]any))
	job, err := k.get(ctx, "jobs", value(ref, "name"))
	if err != nil {
		return self, err
	}
	spec := object(job, "spec")
	if value(object(p, "spec"), "restartPolicy") != "Never" || value(object(object(spec, "template"), "spec"), "restartPolicy") != "Never" {
		return self, errors.New("运维 Job 必须使用 restartPolicy: Never")
	}
	if value(metadata(job), "uid") != value(ref, "uid") || value(object(metadata(job), "labels"), "rainbow-bridge.io/instance") != instance || number(spec, "parallelism") != 1 || number(spec, "completions") != 1 || number(spec, "backoffLimit") != 0 || spec["ttlSecondsAfterFinished"] != nil {
		return self, errors.New("运维 Job 必须属于本实例、单次执行且保留终态证明")
	}
	return self, nil
}
func terminated(p resource) bool {
	status := object(p, "status")
	phase := value(status, "phase")
	if phase != "Succeeded" && phase != "Failed" {
		return false
	}
	states := array(status, "containerStatuses")
	if len(states) == 0 {
		return false
	}
	for _, s := range states {
		state := object(resource(s.(map[string]any)), "state")
		if object(state, "terminated") == nil {
			return false
		}
	}
	return true
}
func (k *Kube) ProveExecutorStopped(ctx context.Context, owner Executor) error {
	if owner.Pod == "" || owner.UID == "" {
		return errors.New("旧执行者身份缺失，禁止破坏性接管")
	}
	p, err := k.get(ctx, "pods", owner.Pod)
	if err != nil {
		return errors.New("无法证明旧执行者已退出；不能把 Pod 消失或锁释放当作退出证明")
	}
	if value(metadata(p), "uid") != owner.UID || !terminated(p) {
		return errors.New("旧执行者尚未确认退出，保持维护")
	}
	return nil
}
func (k *Kube) loadWorkloads(ctx context.Context, allowed []Workload) ([]Workload, error) {
	result := make([]Workload, 0, len(allowed))
	for _, w := range allowed {
		r, err := k.get(ctx, "deployments", w.Name)
		if err != nil {
			return nil, err
		}
		if value(metadata(r), "uid") != w.UID {
			return nil, errors.New("Deployment UID 已变化")
		}
		if len(array(metadata(r), "ownerReferences")) != 0 {
			return nil, errors.New("不接管受其他控制器管理的 Deployment")
		}
		annotations := object(metadata(r), "annotations")
		for key := range annotations {
			if strings.Contains(key, "argocd") || strings.Contains(key, "fluxcd") {
				return nil, errors.New("发现未纳入互斥协议的 GitOps 管理归属")
			}
		}
		w.Replicas = number(object(r, "spec"), "replicas")
		if w.Replicas < 1 {
			return nil, errors.New("计划时业务 Deployment 必须正常运行")
		}
		w.Selector = map[string]string{}
		w.TemplateHash = deploymentHash(r)
		for key, v := range object(object(object(r, "spec"), "selector"), "matchLabels") {
			s, ok := v.(string)
			if !ok {
				return nil, errors.New("selector 无效")
			}
			w.Selector[key] = s
		}
		if len(w.Selector) == 0 || len(array(object(object(r, "spec"), "selector"), "matchExpressions")) != 0 {
			return nil, errors.New("首批仅支持明确 matchLabels 的 Deployment")
		}
		result = append(result, w)
	}
	for _, kind := range []string{"horizontalpodautoscalers", "cronjobs"} {
		r, err := k.get(ctx, kind, "")
		if err != nil {
			return nil, err
		}
		if len(array(r, "items")) > 0 {
			return nil, errors.New("namespace 存在未纳入维护协议的 HPA/CronJob")
		}
	}
	return result, nil
}
func (k *Kube) scale(ctx context.Context, l *Lease, w Workload, replicas int32, generation int64) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	r, err := k.get(ctx, "deployments", w.Name)
	if err != nil {
		return err
	}
	if value(metadata(r), "uid") != w.UID {
		return errors.New("Deployment 归属变化")
	}
	if w.TemplateHash == "" || deploymentHash(r) != w.TemplateHash {
		return errors.New("Deployment 配置偏离计划，拒绝覆盖或启动未受控版本")
	}
	spec := object(r, "spec")
	current := number(spec, "replicas")
	if current != 0 && current != w.Replicas {
		return errors.New("副本数被外部操作者修改")
	}
	spec["replicas"] = replicas
	if generation > 0 {
		template := object(spec, "template")
		m := metadata(template)
		a := object(m, "annotations")
		if a == nil {
			a = resource{}
			m["annotations"] = a
		}
		a["rainbow-bridge.io/maintenance-generation"] = fmt.Sprint(generation)
	}
	_, err = k.put(ctx, "deployments", w.Name, r, w.UID)
	return err
}
func (k *Kube) matchingPods(ctx context.Context, workloads []Workload) ([]resource, string, error) {
	r, err := k.get(ctx, "pods", "")
	if err != nil {
		return nil, "", err
	}
	var result []resource
	for _, item := range array(r, "items") {
		p := resource(item.(map[string]any))
		labels := object(metadata(p), "labels")
		for _, w := range workloads {
			match := true
			for key, v := range w.Selector {
				if value(labels, key) != v {
					match = false
					break
				}
			}
			if !match {
				continue
			}
			refs := array(metadata(p), "ownerReferences")
			if len(refs) != 1 {
				return nil, "", errors.New("发现未受控业务 Pod")
			}
			ref := resource(refs[0].(map[string]any))
			if value(ref, "kind") != "ReplicaSet" {
				return nil, "", errors.New("业务 Pod 控制器不受支持")
			}
			rs, e := k.get(ctx, "replicasets", value(ref, "name"))
			if e != nil {
				return nil, "", e
			}
			parents := array(metadata(rs), "ownerReferences")
			if len(parents) != 1 || value(resource(parents[0].(map[string]any)), "uid") != w.UID {
				return nil, "", errors.New("业务 Pod 不属于 allowlist Deployment")
			}
			result = append(result, p)
			break
		}
	}
	return result, value(metadata(r), "resourceVersion"), nil
}

// Stop watches final container states before scaling; absence alone is not proof.
// Proofs are journaled before proceeding, so resume never invents termination.
func (k *Kube) Stop(ctx context.Context, l *Lease) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StopTimeout)
	defer cancel()
	pods, rv, err := k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
	if err != nil {
		return err
	}
	if l.Op.Data.StopProof == nil {
		l.Op.Data.StopProof = map[string]bool{}
	}
	if l.Op.Data.StopDetails == nil {
		l.Op.Data.StopDetails = map[string]PodExitEvidence{}
	}
	for _, p := range pods {
		uid := value(metadata(p), "uid")
		if !l.Op.Data.StopProof[uid] {
			l.Op.Data.StopProof[uid] = businessStopped(p)
		}
		if l.Op.Data.StopProof[uid] {
			if _, ok := l.Op.Data.StopDetails[uid]; !ok {
				l.Op.Data.StopDetails[uid] = podExitEvidence(p)
			}
		}
	}
	if err = l.Save(ctx, "stopping"); err != nil {
		return err
	}
	watch, err := k.request(ctx, "GET", k.path("pods", "")+"?watch=true&resourceVersion="+url.QueryEscape(rv), nil)
	if err != nil {
		return err
	}
	defer watch.Body.Close()
	events := make(chan resource, 16)
	watchErr := make(chan error, 1)
	go func() {
		dec := json.NewDecoder(watch.Body)
		for {
			var event resource
			if e := dec.Decode(&event); e != nil {
				watchErr <- e
				return
			}
			select {
			case events <- object(event, "object"):
			case <-ctx.Done():
				return
			}
		}
	}()
	for _, w := range l.Op.Data.Plan.Workloads {
		if err = k.scale(ctx, l, w, 0, 0); err != nil {
			return err
		}
	}
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()
	for {
		all := true
		for _, stopped := range l.Op.Data.StopProof {
			if !stopped {
				all = false
			}
		}
		if all {
			current, _, e := k.matchingPods(ctx, l.Op.Data.Plan.Workloads)
			if e != nil {
				return e
			}
			if len(current) == 0 {
				return l.Save(ctx, "stopped")
			}
		}
		select {
		case p := <-events:
			uid := value(metadata(p), "uid")
			for _, w := range l.Op.Data.Plan.Workloads {
				match := true
				for key, v := range w.Selector {
					if value(object(metadata(p), "labels"), key) != v {
						match = false
						break
					}
				}
				if match {
					if _, known := l.Op.Data.StopProof[uid]; !known {
						l.Op.Data.StopProof[uid] = false
					}
				}
			}
			if done, known := l.Op.Data.StopProof[uid]; known && !done && terminated(p) {
				l.Op.Data.StopDetails[uid] = podExitEvidence(p)
				l.Op.Data.StopProof[uid] = businessStopped(p)
				if err = l.Save(ctx, "stopping"); err != nil {
					return err
				}
				if !l.Op.Data.StopProof[uid] {
					return errors.New("业务 Pod 非正常退出，在途动作无法证明完成，保持维护")
				}
			}
		case <-ticker.C:
			if err = l.Check(ctx); err != nil {
				return err
			}
		case <-watchErr:
			return errors.New("停服观察流中断，无法证明全部进程已停止，保持维护")
		case <-ctx.Done():
			return errors.New("停服证明超时，禁止强删 Pod 后继续备份")
		}
	}
}
