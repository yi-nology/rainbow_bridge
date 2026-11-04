package service

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"
)

type DeleteAssetInput struct{ FileID, EnvironmentKey, PipelineKey, ExpectedScopeID string }

func (s *Service) DeleteAsset(ctx context.Context, in DeleteAssetInput) (*DeleteAssetResult, error) {
	in.FileID = strings.TrimSpace(in.FileID)
	in.EnvironmentKey = strings.TrimSpace(in.EnvironmentKey)
	in.PipelineKey = strings.TrimSpace(in.PipelineKey)
	in.ExpectedScopeID = strings.TrimSpace(in.ExpectedScopeID)
	if in.FileID == "" || in.EnvironmentKey == "" || in.PipelineKey == "" || in.ExpectedScopeID == "" {
		return nil, scopeInvalidRequest("file_id, environment_key, pipeline_key and expected_scope_id are required")
	}
	if _, err := requireAdminIdentity(ctx); err != nil {
		return nil, err
	}
	result := &DeleteAssetResult{FileID: in.FileID, Deleted: true}
	err := s.withWriteGate(ctx, func(ctx context.Context, l *Logic, _ *gorm.DB) error {
		scope, err := resolveScopeForWrite(ctx, l, in.EnvironmentKey, in.PipelineKey, in.ExpectedScopeID)
		if err != nil {
			return err
		}
		if err = l.ensurePipelineUnlocked(ctx, in.EnvironmentKey, in.PipelineKey); err != nil {
			return err
		}
		asset, err := l.assetDAO.GetByFileIDIncludingDeleted(ctx, l.db, in.FileID)
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && asset.ScopeID != scope.ScopeID) {
			return &AssetError{HTTPStatus: 404, ErrorType: ErrTypeAssetNotFound, Message: "resource not found in this scope"}
		}
		if err != nil {
			return err
		}
		if asset.DeletedAt.Valid {
			result.AlreadyDeleted = true
			return nil
		}
		refs, err := l.assetUsers(ctx, in.FileID)
		if err != nil {
			return err
		}
		if refs.ReferenceCount > 0 {
			return &AssetError{HTTPStatus: 409, ErrorType: ErrTypeAssetInUse, Message: "resource is used by active configurations", References: refs}
		}
		if err = l.protectLegacyAssetSnapshots(ctx, in.FileID); err != nil {
			return err
		}
		return l.assetDAO.SoftDeleteByScopeAndFileID(ctx, l.db, scope.ScopeID, in.FileID)
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
