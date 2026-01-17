// Package api provides API request/response models for resource management.
package api

// ResourceConfig represents a configuration item.
type ResourceConfig struct {
	ResourceKey string `json:"resource_key,omitempty"`
	Alias       string `json:"alias,omitempty"`
	Name        string `json:"name,omitempty"`
	BusinessKey string `json:"business_key,omitempty"`
	Content     string `json:"content,omitempty"`
	Type        string `json:"type,omitempty"`
	Remark      string `json:"remark,omitempty"`
	IsPerm      bool   `json:"is_perm,omitempty"`
}

// Getter methods for ResourceConfig
func (x *ResourceConfig) GetResourceKey() string {
	if x != nil {
		return x.ResourceKey
	}
	return ""
}

func (x *ResourceConfig) GetAlias() string {
	if x != nil {
		return x.Alias
	}
	return ""
}

func (x *ResourceConfig) GetName() string {
	if x != nil {
		return x.Name
	}
	return ""
}

func (x *ResourceConfig) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *ResourceConfig) GetContent() string {
	if x != nil {
		return x.Content
	}
	return ""
}

func (x *ResourceConfig) GetType() string {
	if x != nil {
		return x.Type
	}
	return ""
}

func (x *ResourceConfig) GetRemark() string {
	if x != nil {
		return x.Remark
	}
	return ""
}

func (x *ResourceConfig) GetIsPerm() bool {
	if x != nil {
		return x.IsPerm
	}
	return false
}

// FileAsset represents an uploaded file asset.
type FileAsset struct {
	FileId      string `json:"file_id,omitempty"`
	BusinessKey string `json:"business_key,omitempty"`
	FileName    string `json:"file_name,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	FileSize    int64  `json:"file_size,omitempty"`
	Url         string `json:"url,omitempty"`
	Remark      string `json:"remark,omitempty"`
}

// Getter methods for FileAsset
func (x *FileAsset) GetFileId() string {
	if x != nil {
		return x.FileId
	}
	return ""
}

func (x *FileAsset) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *FileAsset) GetFileName() string {
	if x != nil {
		return x.FileName
	}
	return ""
}

func (x *FileAsset) GetContentType() string {
	if x != nil {
		return x.ContentType
	}
	return ""
}

func (x *FileAsset) GetFileSize() int64 {
	if x != nil {
		return x.FileSize
	}
	return 0
}

func (x *FileAsset) GetUrl() string {
	if x != nil {
		return x.Url
	}
	return ""
}

func (x *FileAsset) GetRemark() string {
	if x != nil {
		return x.Remark
	}
	return ""
}

// CreateOrUpdateConfigRequest is the request for creating or updating a config.
type CreateOrUpdateConfigRequest struct {
	Config *ResourceConfig `json:"config"`
}

func (x *CreateOrUpdateConfigRequest) GetConfig() *ResourceConfig {
	if x != nil {
		return x.Config
	}
	return nil
}

// ResourceDeleteRequest is the request for deleting a config.
type ResourceDeleteRequest struct {
	BusinessKey string `json:"business_key"`
	ResourceKey string `json:"resource_key"`
}

func (x *ResourceDeleteRequest) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *ResourceDeleteRequest) GetResourceKey() string {
	if x != nil {
		return x.ResourceKey
	}
	return ""
}

// ResourceQueryRequest is the request for querying configs.
type ResourceQueryRequest struct {
	BusinessKey string `json:"business_key"`
	Type        string `json:"type,omitempty"`
	MinVersion  string `json:"min_version,omitempty"`
	MaxVersion  string `json:"max_version,omitempty"`
	IsLatest    bool   `json:"is_latest,omitempty"`
}

func (x *ResourceQueryRequest) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *ResourceQueryRequest) GetType() string {
	if x != nil {
		return x.Type
	}
	return ""
}

func (x *ResourceQueryRequest) GetMinVersion() string {
	if x != nil {
		return x.MinVersion
	}
	return ""
}

func (x *ResourceQueryRequest) GetMaxVersion() string {
	if x != nil {
		return x.MaxVersion
	}
	return ""
}

func (x *ResourceQueryRequest) GetIsLatest() bool {
	if x != nil {
		return x.IsLatest
	}
	return false
}

// ResourceDetailRequest is the request for getting config detail.
type ResourceDetailRequest struct {
	BusinessKey string `json:"business_key"`
	ResourceKey string `json:"resource_key"`
}

func (x *ResourceDetailRequest) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *ResourceDetailRequest) GetResourceKey() string {
	if x != nil {
		return x.ResourceKey
	}
	return ""
}

// ResourceExportRequest is the request for exporting configs.
type ResourceExportRequest struct {
	BusinessKey   string `json:"business_key"`
	IncludeSystem bool   `json:"include_system,omitempty"`
}

func (x *ResourceExportRequest) GetBusinessKey() string {
	if x != nil {
		return x.BusinessKey
	}
	return ""
}

func (x *ResourceExportRequest) GetIncludeSystem() bool {
	if x != nil {
		return x.IncludeSystem
	}
	return false
}

// ResourceImportRequest is the request for importing configs.
type ResourceImportRequest struct {
	Configs   []*ResourceConfig `json:"configs"`
	Overwrite bool              `json:"overwrite,omitempty"`
}

func (x *ResourceImportRequest) GetConfigs() []*ResourceConfig {
	if x != nil {
		return x.Configs
	}
	return nil
}

func (x *ResourceImportRequest) GetOverwrite() bool {
	if x != nil {
		return x.Overwrite
	}
	return false
}

// OperateResponse is the standard response for operations.
type OperateResponse struct {
	Code   int             `json:"code"`
	Msg    string          `json:"msg,omitempty"`
	Error  string          `json:"error,omitempty"`
	Config *ResourceConfig `json:"config,omitempty"`
}

// ResourceListResponse is the response containing a list of configs.
type ResourceListResponse struct {
	List []*ResourceConfig `json:"list"`
}

// ResourceDetailResponse is the response containing config detail.
type ResourceDetailResponse struct {
	Detail *ResourceConfig `json:"detail"`
}

// FileAssetListResponse is the response containing a list of file assets.
type FileAssetListResponse struct {
	Assets []*FileAsset `json:"assets"`
}

// BusinessKeyListResponse is the response containing a list of business keys.
type BusinessKeyListResponse struct {
	List []string `json:"list"`
}

// ConfigSummary contains summary information for import/export operations.
type ConfigSummary struct {
	Total        int                 `json:"total"`
	BusinessKeys []string            `json:"businessKeys"`
	Items        []ConfigSummaryItem `json:"items"`
}

// ConfigSummaryItem represents a single item in the config summary.
type ConfigSummaryItem struct {
	ResourceKey string `json:"resourceKey"`
	BusinessKey string `json:"businessKey"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Type        string `json:"type"`
}

// OperateResponseWithSummary extends OperateResponse with a summary.
type OperateResponseWithSummary struct {
	Code    int            `json:"code"`
	Msg     string         `json:"msg,omitempty"`
	Error   string         `json:"error,omitempty"`
	Summary *ConfigSummary `json:"summary,omitempty"`
}
