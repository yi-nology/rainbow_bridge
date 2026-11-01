package maintenance

import (
	"testing"
)

func exitPod(code int32, message string) resource {
	return resource{"status": resource{"phase": "Failed", "containerStatuses": []any{map[string]any{"state": map[string]any{"terminated": map[string]any{"exitCode": float64(code), "message": message}}}}}}
}
func TestBusinessStopRequiresCleanDrainOrPreDatabaseRejection(t *testing.T) {
	for _, test := range []struct {
		code    int32
		message string
		want    bool
	}{{0, "", true}, {137, "", false}, {3, "unfinished request", false}, {78, "untrusted", false}, {78, "rainbow-maintenance-v1:blocked-before-business-db", true}} {
		p := exitPod(test.code, test.message)
		if !terminated(p) {
			t.Fatal("dead executor proof missing")
		}
		if businessStopped(p) != test.want {
			t.Fatalf("business exit code %d accepted incorrectly", test.code)
		}
	}
}
func TestDeploymentHashBindsImageAndIgnoresOnlyOwnedGeneration(t *testing.T) {
	r := resource{"spec": resource{"replicas": float64(2), "template": resource{"metadata": resource{}, "spec": resource{"containers": []any{map[string]any{"image": "pinned@sha256:one"}}}}}}
	before := deploymentHash(r)
	object(r, "spec")["replicas"] = float64(0)
	metadata(object(object(r, "spec"), "template"))["annotations"] = map[string]any{"rainbow-bridge.io/maintenance-generation": "9"}
	if deploymentHash(r) != before {
		t.Fatal("owned scale/generation changed template confirmation")
	}
	array(object(object(object(r, "spec"), "template"), "spec"), "containers")[0].(map[string]any)["image"] = "other"
	if deploymentHash(r) == before {
		t.Fatal("uncontrolled image change accepted")
	}
}
