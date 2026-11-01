// Package maintenanceweb is the durable HTTP control plane. Engine plans are private.
package maintenanceweb

import "time"

const ContractVersion = 1

type Issue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type Counts struct {
	Environments    *string `json:"environments"`
	Pipelines       *string `json:"pipelines"`
	Configs         *string `json:"configs"`
	Assets          *string `json:"assets"`
	Versions        *string `json:"versions"`
	DeletedVersions *string `json:"deleted_versions"`
	FreezeEvents    *string `json:"freeze_events"`
	ReleaseEvents   *string `json:"release_events"`
	ConfigsDeleted  *string `json:"configs_deleted"`
	AssetsDeleted   *string `json:"assets_deleted"`
}
type Progress struct {
	CompletedObjects *string `json:"completed_objects"`
	TotalObjects     *string `json:"total_objects"`
	CompletedBytes   *string `json:"completed_bytes"`
	TotalBytes       *string `json:"total_bytes"`
}
type Result struct {
	BackupID          *string `json:"backup_id"`
	PreviewID         *string `json:"preview_id"`
	BusinessAvailable *bool   `json:"business_available"`
	ReauthRequired    *bool   `json:"reauth_required"`
}
type TaskError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}
type Task struct {
	TaskID         string     `json:"task_id"`
	RequestID      string     `json:"request_id"`
	Kind           string     `json:"kind"`
	State          string     `json:"state"`
	Phase          string     `json:"phase"`
	Revision       string     `json:"revision"`
	OperationID    *string    `json:"operation_id"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	StartedAt      *time.Time `json:"started_at"`
	FinishedAt     *time.Time `json:"finished_at"`
	Actor          string     `json:"actor"`
	Reason         string     `json:"reason"`
	ParentTaskID   *string    `json:"parent_task_id"`
	Result         *Result    `json:"result"`
	Error          *TaskError `json:"error"`
	AllowedActions []string   `json:"allowed_actions"`
	Progress       Progress   `json:"progress"`
}
type Operation struct {
	OperationID       string   `json:"operation_id"`
	Kind              string   `json:"kind"`
	State             string   `json:"state"`
	Revision          string   `json:"revision"`
	MaintenanceActive bool     `json:"maintenance_active"`
	BusinessAvailable bool     `json:"business_available"`
	WritesOpened      bool     `json:"writes_opened"`
	AllowedActions    []string `json:"allowed_actions"`
	BlockingReasons   []Issue  `json:"blocking_reasons"`
}
type Preview struct {
	PreviewID       string    `json:"preview_id"`
	State           string    `json:"state"`
	Kind            string    `json:"kind"`
	ExpiresAt       time.Time `json:"expires_at"`
	TargetLabel     string    `json:"target_label"`
	BackupID        *string   `json:"backup_id"`
	ManifestSHA256  *string   `json:"manifest_sha256"`
	Counts          *Counts   `json:"counts"`
	Bytes           *string   `json:"bytes"`
	Warnings        []Issue   `json:"warnings"`
	Issues          []Issue   `json:"issues"`
	PlanFingerprint string    `json:"plan_fingerprint"`
	Revision        string    `json:"revision"`
}
type Verification struct {
	State     string     `json:"state"`
	CheckedAt *time.Time `json:"checked_at"`
	Message   *string    `json:"message"`
}
type Backup struct {
	BackupID       string       `json:"backup_id"`
	CreatedAt      time.Time    `json:"created_at"`
	ConsistentAt   time.Time    `json:"consistent_at"`
	ManifestSHA256 string       `json:"manifest_sha256"`
	SizeBytes      string       `json:"size_bytes"`
	Counts         Counts       `json:"counts"`
	Reason         string       `json:"reason"`
	Actor          string       `json:"actor"`
	Verification   Verification `json:"verification"`
	Restorable     bool         `json:"restorable"`
}
type Capabilities struct {
	Mode            string          `json:"mode"`
	ContractVersion int             `json:"contract_version"`
	Supported       bool            `json:"supported"`
	Ready           bool            `json:"ready"`
	Reasons         []Issue         `json:"reasons"`
	Actions         map[string]bool `json:"actions"`
	Maintenance     struct {
		Active            bool    `json:"active"`
		BusinessAvailable bool    `json:"business_available"`
		OperationID       *string `json:"operation_id"`
	} `json:"maintenance"`
	Limits struct {
		PlanTTLSeconds      int `json:"plan_ttl_seconds"`
		TaskDeadlineSeconds int `json:"task_deadline_seconds"`
	} `json:"limits"`
}

// These are the only accepted browser mutation fields. Unknown fields are rejected.
type Request struct {
	RequestID        string `json:"request_id"`
	Kind             string `json:"kind,omitempty"`
	BackupID         string `json:"backup_id,omitempty"`
	ExpectedSHA256   string `json:"expected_sha256,omitempty"`
	PreviewID        string `json:"preview_id,omitempty"`
	PlanFingerprint  string `json:"plan_fingerprint,omitempty"`
	ManifestSHA256   string `json:"manifest_sha256,omitempty"`
	Confirmation     string `json:"confirmation,omitempty"`
	Reason           string `json:"reason,omitempty"`
	ExpectedRevision string `json:"expected_revision,omitempty"`
}
type HTTPError struct {
	Status          int
	Code, Message   string
	CurrentRevision string
}

func (e *HTTPError) Error() string { return e.Message }
func failure(status int, code, message string) error {
	return &HTTPError{Status: status, Code: code, Message: message}
}
