package maintenance

import (
	"time"
)

type PodExitEvidence struct {
	Node                              string
	ContainerIDs, FinishedAt, Reasons []string
	ExitCodes                         []int32
	ObservedAt                        time.Time
}

func podExitEvidence(p resource) PodExitEvidence {
	e := PodExitEvidence{Node: value(object(p, "spec"), "nodeName"), ObservedAt: time.Now().UTC()}
	for _, item := range array(object(p, "status"), "containerStatuses") {
		s := resource(item.(map[string]any))
		t := object(object(s, "state"), "terminated")
		if t != nil {
			e.ContainerIDs = append(e.ContainerIDs, value(s, "containerID"))
			e.ExitCodes = append(e.ExitCodes, number(t, "exitCode"))
			e.FinishedAt = append(e.FinishedAt, value(t, "finishedAt"))
			e.Reasons = append(e.Reasons, value(t, "message"))
		}
	}
	return e
}
func businessStopped(p resource) bool {
	if !terminated(p) {
		return false
	}
	for _, item := range array(object(p, "status"), "containerStatuses") {
		t := object(object(resource(item.(map[string]any)), "state"), "terminated")
		code := number(t, "exitCode")
		if code != 0 && !(code == 78 && value(t, "message") == "rainbow-maintenance-v1:blocked-before-business-db") {
			return false
		}
	}
	return true
}
