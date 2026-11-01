package maintenanceweb

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type cluster struct {
	client                   *http.Client
	server, token, namespace string
}

func newCluster(c Config) (*cluster, error) {
	v := c.Kubernetes
	if v.Server == "" {
		v.Server = "https://" + os.Getenv("KUBERNETES_SERVICE_HOST") + ":" + os.Getenv("KUBERNETES_SERVICE_PORT")
	}
	u, e := url.Parse(v.Server)
	if e != nil || u.Scheme != "https" || u.Host == "" {
		return nil, errors.New("Kubernetes连接必须使用HTTPS")
	}
	if v.TokenFile == "" {
		v.TokenFile = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	}
	if v.CAFile == "" {
		v.CAFile = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	}
	b, e := os.ReadFile(v.TokenFile)
	if e != nil {
		return nil, errors.New("控制服务凭证不可读取")
	}
	ca, e := os.ReadFile(v.CAFile)
	if e != nil {
		return nil, e
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, errors.New("集群CA无效")
	}
	return &cluster{client: &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}}, server: strings.TrimRight(v.Server, "/"), token: strings.TrimSpace(string(b)), namespace: c.Namespace}, nil
}
func (k *cluster) request(ctx context.Context, method, path string, v any) (map[string]any, int, error) {
	var body io.Reader
	if v != nil {
		b, e := json.Marshal(v)
		if e != nil {
			return nil, 0, e
		}
		body = bytes.NewReader(b)
	}
	r, e := http.NewRequestWithContext(ctx, method, k.server+path, body)
	if e != nil {
		return nil, 0, e
	}
	r.Header.Set("Authorization", "Bearer "+k.token)
	r.Header.Set("Content-Type", "application/json")
	res, e := k.client.Do(r)
	if e != nil {
		return nil, 0, errors.New("集群接口暂不可用")
	}
	defer res.Body.Close()
	b, e := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	var out map[string]any
	if e != nil || json.Unmarshal(b, &out) != nil {
		return nil, res.StatusCode, errors.New("集群响应格式错误")
	}
	return out, res.StatusCode, nil
}
func (k *cluster) jobPath(name string) string {
	p := "/apis/batch/v1/namespaces/" + url.PathEscape(k.namespace) + "/jobs"
	if name != "" {
		p += "/" + url.PathEscape(name)
	}
	return p
}
func (s *Store) jobTemplate(id, name string) map[string]any {
	labels := map[string]string{"rainbow-bridge.io/instance": s.Config.InstanceID, "rainbow-bridge.io/task": id}
	job := map[string]any{"apiVersion": "batch/v1", "kind": "Job", "metadata": map[string]any{"name": name, "namespace": s.Config.Namespace, "labels": labels}, "spec": map[string]any{"backoffLimit": 0, "parallelism": 1, "completions": 1, "activeDeadlineSeconds": 7200, "template": map[string]any{"metadata": map[string]any{"labels": labels}, "spec": map[string]any{"restartPolicy": "Never", "serviceAccountName": s.Config.ExecutorServiceAccount, "securityContext": map[string]any{"runAsNonRoot": true, "runAsUser": 10001, "fsGroup": 10001}, "containers": []any{map[string]any{"name": "executor", "image": s.Config.ExecutorImage, "imagePullPolicy": "IfNotPresent", "command": []string{s.Config.ExecutorCommand}, "args": []string{"--web-task", id, "--web-config", "/worker/worker.yaml", "--config", "/operator/maintenance.yaml"}, "env": []any{map[string]any{"name": "RB_MAINTENANCE_POD", "valueFrom": map[string]any{"fieldRef": map[string]string{"fieldPath": "metadata.name"}}}, map[string]any{"name": "RB_MAINTENANCE_POD_UID", "valueFrom": map[string]any{"fieldRef": map[string]string{"fieldPath": "metadata.uid"}}}}, "resources": map[string]any{"requests": map[string]string{"cpu": "100m", "memory": "128Mi"}, "limits": map[string]string{"cpu": "1", "memory": "768Mi"}}, "securityContext": map[string]any{"allowPrivilegeEscalation": false, "capabilities": map[string]any{"drop": []string{"ALL"}}}, "volumeMounts": []any{map[string]any{"name": "operator", "mountPath": "/operator", "readOnly": true}, map[string]any{"name": "worker", "mountPath": "/worker", "readOnly": true}}}}, "volumes": []any{map[string]any{"name": "operator", "secret": map[string]any{"secretName": s.Config.ExecutorSecret, "defaultMode": 288}}, map[string]any{"name": "worker", "secret": map[string]any{"secretName": s.Config.WorkerSecret, "defaultMode": 288}}}}}}}
	if s.Config.ExecutionMode == "pod_sidecar" {
		pod := object(object(object(job, "spec"), "template"), "spec")
		pod["volumes"] = append(pod["volumes"].([]any), map[string]any{"name": "host-auth", "secret": map[string]any{"secretName": s.Config.HostSecret, "defaultMode": 288}})
		co := pod["containers"].([]any)[0].(map[string]any)
		co["volumeMounts"] = append(co["volumeMounts"].([]any), map[string]any{"name": "host-auth", "mountPath": "/host-auth", "readOnly": true})
	}
	return s.withArtifacts(job)
}
func object(v map[string]any, key string) map[string]any { m, _ := v[key].(map[string]any); return m }
func textValue(v map[string]any, key string) string      { x, _ := v[key].(string); return x }
func (k *cluster) ensureJob(ctx context.Context, s *Store, t privateTask) (string, error) {
	want := s.jobTemplate(t.TaskID, t.JobName)
	if hash(want) != t.TemplateHash {
		return "", errors.New("固定Job模板变化，拒绝执行旧任务")
	}
	existing, status, e := k.request(ctx, "GET", k.jobPath(t.JobName), nil)
	if e != nil {
		return "", e
	}
	if status == 404 {
		existing, status, e = k.request(ctx, "POST", k.jobPath(""), want)
		if e != nil {
			return "", e
		}
		if status == 409 {
			existing, status, e = k.request(ctx, "GET", k.jobPath(t.JobName), nil)
		}
	}
	if e != nil || status < 200 || status >= 300 {
		return "", errors.New("Job受理尚未确认")
	}
	meta := object(existing, "metadata")
	labels := object(meta, "labels")
	if textValue(labels, "rainbow-bridge.io/instance") != s.Config.InstanceID || textValue(labels, "rainbow-bridge.io/task") != t.TaskID {
		return "", errors.New("同名Job归属不一致")
	}
	// Server default fields are ignored; all client-controlled execution fields must match.
	spec := object(existing, "spec")
	wantSpec := object(want, "spec")
	for _, key := range []string{"parallelism", "completions", "backoffLimit", "activeDeadlineSeconds"} {
		if !jsonSubset(wantSpec[key], spec[key]) {
			return "", errors.New("Job单次执行约束不一致")
		}
	}
	pod := object(object(spec, "template"), "spec")
	wpod := object(object(object(want, "spec"), "template"), "spec")
	for _, key := range []string{"serviceAccountName", "restartPolicy", "containers", "volumes", "securityContext"} {
		if !jsonSubset(wpod[key], pod[key]) {
			return "", errors.New("Job执行模板不一致: " + key)
		}
	}
	if spec["ttlSecondsAfterFinished"] != nil {
		return "", errors.New("Job停止证明不可自动清理")
	}
	return textValue(meta, "uid"), nil
}
func jsonSubset(want, got any) bool {
	// Templates contain typed maps/slices; normalize once so API-added defaults
	// (for example Downward API fieldRef.apiVersion) are treated consistently.
	b, err := json.Marshal(want)
	if err != nil {
		return false
	}
	var normalized any
	if json.Unmarshal(b, &normalized) != nil {
		return false
	}
	return normalizedSubset(normalized, got)
}
func normalizedSubset(want, got any) bool {
	switch w := want.(type) {
	case map[string]any:
		g, ok := got.(map[string]any)
		if !ok {
			return false
		}
		for k, v := range w {
			if !normalizedSubset(v, g[k]) {
				return false
			}
		}
		return true
	case []any:
		g, ok := got.([]any)
		if !ok || len(w) != len(g) {
			return false
		}
		for i, v := range w {
			if !normalizedSubset(v, g[i]) {
				return false
			}
		}
		return true
	default:
		a, _ := json.Marshal(want)
		b, _ := json.Marshal(got)
		return bytes.Equal(a, b)
	}
}
