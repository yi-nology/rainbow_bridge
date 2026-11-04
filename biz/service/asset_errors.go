package service

import "errors"

const (
	ErrTypeAssetInUse              = "ASSET_IN_USE"
	ErrTypeAssetNotFound           = "ASSET_NOT_FOUND"
	ErrTypeAssetDeleted            = "ASSET_DELETED"
	ErrTypeAssetReferenceInvalid   = "ASSET_REFERENCE_INVALID"
	ErrTypeAssetSnapshotDependency = "ASSET_SNAPSHOT_DEPENDENCY"
)

type AssetReferenceSummary struct {
	EnvironmentKey string `json:"environment_key"`
	PipelineKey    string `json:"pipeline_key"`
	ScopeID        string `json:"scope_id"`
	ResourceKey    string `json:"resource_key"`
	Name           string `json:"name"`
	Alias          string `json:"alias"`
}

type DeleteAssetResult struct {
	FileID         string `json:"file_id"`
	Deleted        bool   `json:"deleted"`
	AlreadyDeleted bool   `json:"already_deleted"`
}

type AssetReferenceData struct {
	ReferenceCount      int                     `json:"reference_count"`
	References          []AssetReferenceSummary `json:"references"`
	ReferencesTruncated bool                    `json:"references_truncated"`
}

type AssetError struct {
	HTTPStatus int
	ErrorType  string
	Message    string
	References *AssetReferenceData
}

func (e *AssetError) Error() string { return e.Message }
func AsAssetError(err error) (*AssetError, bool) {
	var e *AssetError
	ok := errors.As(err, &e)
	return e, ok
}
func assetDeletedError() error {
	return &AssetError{HTTPStatus: 410, ErrorType: ErrTypeAssetDeleted, Message: "resource has been deleted; select or upload another resource"}
}
