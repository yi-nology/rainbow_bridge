package maintenance

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"gopkg.in/yaml.v3"
)

func (k *Kube) appConfig(ctx context.Context, c Config) (*config.Config, []byte, error) {
	r, err := k.get(ctx, "secrets", c.ConfigSecret)
	if err != nil {
		return nil, nil, err
	}
	if value(metadata(r), "uid") != c.ConfigSecretUID {
		return nil, nil, errors.New("应用配置 Secret UID 变化")
	}
	b, err := base64.StdEncoding.DecodeString(value(object(r, "data"), "config.yaml"))
	if err != nil {
		return nil, nil, errors.New("应用配置 Secret 无效")
	}
	var app config.Config
	if yaml.Unmarshal(b, &app) != nil {
		return nil, nil, errors.New("应用配置解析失败")
	}
	return &app, b, nil
}
func (k *Kube) saveOldConfig(ctx context.Context, l *Lease) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	cfg := l.cfg
	app, b, err := k.appConfig(ctx, cfg)
	if err != nil {
		return err
	}
	_ = app
	if digest(b) != l.Op.Data.Plan.ConfigHash {
		return errors.New("停服前配置已变化，拒绝继续")
	}
	r := resource{"apiVersion": "v1", "kind": "Secret", "immutable": true, "metadata": resource{"name": l.Op.Data.OldSecret, "namespace": cfg.Namespace, "labels": resource{"rainbow-bridge.io/instance": cfg.InstanceID, "rainbow-bridge.io/operation": l.Op.ID}}, "type": "Opaque", "data": resource{"config.yaml": base64.StdEncoding.EncodeToString(b)}}
	// A replay must prove both exact bytes and ownership; it cannot overwrite.
	if existing, e := k.get(ctx, "secrets", l.Op.Data.OldSecret); e == nil {
		labels := object(metadata(existing), "labels")
		if value(labels, "rainbow-bridge.io/operation") != l.Op.ID || value(object(existing, "data"), "config.yaml") != value(object(r, "data"), "config.yaml") {
			return errors.New("旧配置副本冲突")
		}
		return nil
	}
	res, err := k.request(ctx, "POST", k.path("secrets", ""), r)
	if err != nil {
		return err
	}
	res.Body.Close()
	return nil
}
func (k *Kube) oldConfig(ctx context.Context, l *Lease) ([]byte, error) {
	r, err := k.get(ctx, "secrets", l.Op.Data.OldSecret)
	if err != nil {
		return nil, err
	}
	if value(object(metadata(r), "labels"), "rainbow-bridge.io/operation") != l.Op.ID {
		return nil, errors.New("旧配置副本归属不符")
	}
	b, err := base64.StdEncoding.DecodeString(value(object(r, "data"), "config.yaml"))
	if err != nil || digest(b) != l.Op.Data.Plan.ConfigHash {
		return nil, errors.New("旧配置副本校验失败")
	}
	return b, nil
}
func patchConfig(raw []byte, dsn, original, snapshots string, generation, session int64) ([]byte, *config.Config, error) {
	var node yaml.Node
	if yaml.Unmarshal(raw, &node) != nil || len(node.Content) != 1 {
		return nil, nil, errors.New("配置节点无效")
	}
	set := func(path []string, v any) error {
		current := node.Content[0]
		for i, key := range path {
			if current.Kind != yaml.MappingNode {
				return errors.New("配置节点必须为映射")
			}
			var next *yaml.Node
			for j := 0; j < len(current.Content); j += 2 {
				if current.Content[j].Value == key {
					next = current.Content[j+1]
					break
				}
			}
			if next == nil {
				next = &yaml.Node{Kind: yaml.MappingNode}
				current.Content = append(current.Content, &yaml.Node{Kind: yaml.ScalarNode, Value: key}, next)
			}
			if i == len(path)-1 {
				return next.Encode(v)
			}
			current = next
		}
		return nil
	}
	changes := []struct {
		path []string
		v    any
	}{{[]string{"database", "postgres", "dsn"}, dsn}, {[]string{"storage", "minio", "bucket"}, original}, {[]string{"release_storage", "bucket"}, snapshots}, {[]string{"backup", "distributed", "generation"}, generation}, {[]string{"backup", "distributed", "session_generation"}, session}}
	for _, change := range changes {
		if err := set(change.path, change.v); err != nil {
			return nil, nil, err
		}
	}
	b, err := yaml.Marshal(&node)
	if err != nil {
		return nil, nil, err
	}
	var cfg config.Config
	if yaml.Unmarshal(b, &cfg) != nil {
		return nil, nil, errors.New("目标配置无效")
	}
	return b, &cfg, nil
}
func (k *Kube) applyConfig(ctx context.Context, l *Lease, want []byte) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	r, err := k.get(ctx, "secrets", l.cfg.ConfigSecret)
	if err != nil {
		return err
	}
	if value(metadata(r), "uid") != l.cfg.ConfigSecretUID || value(metadata(r), "uid") != l.Op.Data.Plan.ConfigUID {
		return errors.New("应用配置 Secret UID 变化，拒绝切换或幂等成功")
	}
	current, e := base64.StdEncoding.DecodeString(value(object(r, "data"), "config.yaml"))
	if e != nil {
		return e
	}
	currentHash := digest(current)
	if currentHash == digest(want) {
		return nil
	}
	allowed := currentHash == l.Op.Data.Plan.ConfigHash || currentHash == l.Op.Data.AppliedConfigHash
	for _, hash := range l.Op.Data.AllowedConfigHashes {
		if currentHash == hash {
			allowed = true
			break
		}
	}
	if !allowed {
		return errors.New("应用配置被外部修改，禁止覆盖")
	}
	object(r, "data")["config.yaml"] = base64.StdEncoding.EncodeToString(want)
	_, err = k.put(ctx, "secrets", l.cfg.ConfigSecret, r, l.cfg.ConfigSecretUID)
	return err
}
