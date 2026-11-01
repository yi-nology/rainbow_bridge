package maintenanceweb

import (
	"encoding/json"
	"github.com/cloudwego/hertz/pkg/app"
	"strings"
	"testing"
)

func TestMutationInputRejectsExecutionParameters(t *testing.T) {
	for _, body := range []string{`{"request_id":"x","kind":"backup","image":"evil"}`, `{"request_id":"x","kind":"backup","namespace":"production"}`, `{"request_id":"x","kind":"backup","command":["sh"]}`, `{"request_id":"x","kind":"backup","reason":"not allowed on plan"}`, `{"request_id":"x","kind":"backup"} {}`} {
		c := app.NewContext(0)
		c.Request.Header.Set("Content-Type", "application/json")
		c.Request.SetBodyString(body)
		if _, e := decode(c, "plan"); e == nil {
			t.Fatalf("accepted unsafe body %s", body)
		}
	}
}
func TestPublicViewsHaveNoEngineLocators(t *testing.T) {
	b, e := json.Marshal(Task{TaskID: "id", Progress: Progress{}, AllowedActions: []string{}})
	if e != nil {
		t.Fatal(e)
	}
	for _, field := range []string{"DSN", "CandidateDB", "Secret", "Bucket", "engine_request", "JobName", "Plan", "Token"} {
		if strings.Contains(string(b), field) {
			t.Fatalf("internal field leaked: %s", field)
		}
	}
}
func TestFixedTemplateBindsExecutionAndPreservesStopProof(t *testing.T) {
	s := &Store{Config: Config{InstanceID: "instance", Namespace: "test", ExecutorImage: "image@sha256:digest", ExecutorCommand: "/executor", ExecutorServiceAccount: "executor", ExecutorSecret: "op", WorkerSecret: "worker"}}
	j := s.jobTemplate("task", "job")
	b, _ := json.Marshal(j)
	var got map[string]any
	_ = json.Unmarshal(b, &got)
	if !jsonSubset(j, got) {
		t.Fatal("server JSON roundtrip changed template")
	}
	podDefaults := object(object(object(got, "spec"), "template"), "spec")
	container := podDefaults["containers"].([]any)[0].(map[string]any)
	for _, env := range container["env"].([]any) {
		object(object(env.(map[string]any), "valueFrom"), "fieldRef")["apiVersion"] = "v1"
	}
	if !jsonSubset(j, got) {
		t.Fatal("legitimate Kubernetes fieldRef default rejected")
	}
	spec := object(got, "spec")
	if spec["backoffLimit"] != float64(0) || spec["ttlSecondsAfterFinished"] != nil {
		t.Fatal("proof destroyed")
	}
	pod := object(object(spec, "template"), "spec")
	pod["serviceAccountName"] = "other"
	if jsonSubset(object(object(object(j, "spec"), "template"), "spec"), pod) {
		t.Fatal("wrong execution identity accepted")
	}
}
