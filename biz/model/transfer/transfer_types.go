package transfer

// ==================== Export Tree ====================

// ExportTreeConfig represents a config in the export tree.
type ExportTreeConfig struct {
	ResourceKey string `json:"resource_key"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Type        string `json:"type"`
}

// ExportTreePipeline represents a pipeline in the export tree.
type ExportTreePipeline struct {
	PipelineKey  string              `json:"pipeline_key"`
	PipelineName string              `json:"pipeline_name"`
	Description  string              `json:"description"`
	IsActive     bool                `json:"is_active"`
	ConfigCount  int32               `json:"config_count"`
	Configs      []*ExportTreeConfig `json:"configs,omitempty"`
}

// ExportTreeEnvironment represents an environment in the export tree.
type ExportTreeEnvironment struct {
	EnvironmentKey  string                `json:"environment_key"`
	EnvironmentName string                `json:"environment_name"`
	Description     string                `json:"description"`
	IsActive        bool                  `json:"is_active"`
	Pipelines       []*ExportTreePipeline `json:"pipelines"`
}

// ExportTreeData is the data wrapper for export tree.
type ExportTreeData struct {
	Environments []*ExportTreeEnvironment `json:"environments"`
}

// ExportTreeResponse is the response for export tree.
type ExportTreeResponse struct {
	Code  int32           `json:"code"`
	Msg   string          `json:"msg"`
	Error string          `json:"error,omitempty"`
	Data  *ExportTreeData `json:"data,omitempty"`
}

// ==================== Selective Export ====================

// ExportSelection represents a selection for export.
type ExportSelection struct {
	EnvironmentKey string   `json:"environment_key"`
	PipelineKey    string   `json:"pipeline_key,omitempty"`  // empty means all pipelines in this environment
	ResourceKeys   []string `json:"resource_keys,omitempty"` // empty means all configs in this pipeline
}

// ExportSelectiveRequest is used to export selected configurations.
type ExportSelectiveRequest struct {
	Format     string             `json:"format"` // "zip" or "tar.gz"
	Selections []*ExportSelection `json:"selections"`
}

// ==================== Import Preview ====================

// ImportPreviewConfig represents a config in the import preview.
type ImportPreviewConfig struct {
	ResourceKey string `json:"resource_key"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Type        string `json:"type"`
	Status      string `json:"status"` // "new", "exists", "conflict"
}

// ImportPreviewPipeline represents a pipeline in the import preview.
type ImportPreviewPipeline struct {
	PipelineKey  string                 `json:"pipeline_key"`
	PipelineName string                 `json:"pipeline_name"`
	Status       string                 `json:"status"` // "new", "exists"
	Configs      []*ImportPreviewConfig `json:"configs"`
}

// ImportPreviewEnvironment represents an environment in the import preview.
type ImportPreviewEnvironment struct {
	EnvironmentKey  string                   `json:"environment_key"`
	EnvironmentName string                   `json:"environment_name"`
	Status          string                   `json:"status"` // "new", "exists"
	Pipelines       []*ImportPreviewPipeline `json:"pipelines"`
}

// ImportPreviewSummary contains summary counts for import preview.
type ImportPreviewSummary struct {
	TotalEnvironments int32 `json:"total_environments"`
	TotalPipelines    int32 `json:"total_pipelines"`
	TotalConfigs      int32 `json:"total_configs"`
	NewCount          int32 `json:"new_count"`
	ExistingCount     int32 `json:"existing_count"`
	ConflictCount     int32 `json:"conflict_count"`
}

// ImportPreviewData is the data wrapper for import preview.
type ImportPreviewData struct {
	Format       string                      `json:"format"`
	Environments []*ImportPreviewEnvironment `json:"environments"`
	Summary      *ImportPreviewSummary       `json:"summary"`
}

// ImportPreviewResponse is the response for import preview.
type ImportPreviewResponse struct {
	Code  int32              `json:"code"`
	Msg   string             `json:"msg"`
	Error string             `json:"error,omitempty"`
	Data  *ImportPreviewData `json:"data,omitempty"`
}

// ==================== Selective Import ====================

// ImportSelectiveRequest is used to import selected configurations.
type ImportSelectiveRequest struct {
	Overwrite  bool               `json:"overwrite"`
	Selections []*ExportSelection `json:"selections"`
}
