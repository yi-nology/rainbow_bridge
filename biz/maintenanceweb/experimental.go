package maintenanceweb

import (
	"path"
	"strings"
)

// The experiment uses a pinned cached base image plus a clearly separate candidate.
// These settings are deployment-owned and cannot be supplied by HTTP clients.
func (s *Store) withArtifacts(job map[string]any) map[string]any {
	if s.Config.ArtifactDir == "" {
		return job
	}
	p := object(object(object(job, "spec"), "template"), "spec")
	p["nodeSelector"] = map[string]string{"kubernetes.io/hostname": s.Config.NodeName}
	p["volumes"] = append(p["volumes"].([]any), map[string]any{"name": "candidate", "hostPath": map[string]string{"path": s.Config.ArtifactDir, "type": "Directory"}})
	co := p["containers"].([]any)[0].(map[string]any)
	co["volumeMounts"] = append(co["volumeMounts"].([]any), map[string]any{"name": "candidate", "mountPath": "/lab", "readOnly": true})
	return job
}
func (c Config) validArtifacts() bool {
	return c.ArtifactDir == "" || (strings.HasPrefix(c.Namespace, "rb-web-") && strings.HasPrefix(c.ArtifactDir, "/var/tmp/rb-maint-") && path.Clean(c.ArtifactDir) == c.ArtifactDir && c.NodeName != "")
}
