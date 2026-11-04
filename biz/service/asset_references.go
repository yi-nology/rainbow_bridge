package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

var assetAbsoluteURL = regexp.MustCompile(`(?i)https?://[^\s"'<>()]+`)

// Reuse the migration token parser and JSON walker; copied trusted-origin URLs
// are additionally recognized here without changing migration rewrite rules.
type assetReferencePolicy struct {
	basePath      string
	originAllowed func(string) bool
}

func (p assetReferencePolicy) IDs(cfg *model.Config) ([]string, error) {
	ids := []string{}
	seen := map[string]bool{}
	collect := func(text string) error {
		add := func(occurrences []managedReferenceOccurrence) {
			for _, occ := range occurrences {
				if !seen[occ.fileID] {
					seen[occ.fileID] = true
					ids = append(ids, occ.fileID)
				}
			}
		}
		add(scanManagedReferences(text, p.basePath))
		for _, raw := range assetAbsoluteURL.FindAllString(text, -1) {
			u, err := url.Parse(raw)
			if err != nil || u.User != nil || p.originAllowed == nil || !p.originAllowed(strings.ToLower(u.Scheme)+"://"+u.Host) {
				continue
			}
			occ := scanManagedReferences(u.EscapedPath(), p.basePath)
			if len(occ) == 1 && occ[0].start == 0 {
				add(occ)
			}
		}
		return nil
	}
	if isStructuredConfigType(cfg.Type) {
		var payload any
		if err := DecodeConfigJSON([]byte(cfg.Content), &payload); err != nil {
			return nil, &AssetError{HTTPStatus: 400, ErrorType: ErrTypeAssetReferenceInvalid, Message: fmt.Sprintf("cannot inspect resource references in config %s/%s/%s", cfg.EnvironmentKey, cfg.PipelineKey, cfg.ResourceKey)}
		}
		if err := walkConfigStrings(payload, collect); err != nil {
			return nil, err
		}
	} else if err := collect(cfg.Content); err != nil {
		return nil, err
	}
	return ids, nil
}

// Called inside the same write gate as deletion. Unknown legacy references keep
// their existing behavior; only an explicitly deleted known resource is rejected.
func (l *Logic) validateAssetReferences(ctx context.Context, cfg *model.Config) error {
	ids, err := l.assetReferences.IDs(cfg)
	if err != nil {
		return err
	}
	for _, id := range ids {
		asset, err := l.assetDAO.GetByFileIDIncludingDeleted(ctx, l.db, id)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return err
		}
		if asset.DeletedAt.Valid {
			return assetDeletedError()
		}
	}
	return nil
}

func (l *Logic) assetUsers(ctx context.Context, fileID string) (*AssetReferenceData, error) {
	var configs []model.Config
	err := l.db.WithContext(ctx).Table("resource_config AS c").Select("c.*").
		Joins("JOIN pipeline p ON p.scope_id=c.scope_id AND p.deleted_at IS NULL").
		Joins("JOIN environment e ON e.environment_id=p.environment_id AND e.deleted_at IS NULL").
		Where("c.deleted_at IS NULL").Order("c.environment_key, c.pipeline_key, c.resource_key, c.id").Find(&configs).Error
	if err != nil {
		return nil, err
	}
	data := &AssetReferenceData{References: []AssetReferenceSummary{}}
	for i := range configs {
		cfg := &configs[i]
		ids, err := l.assetReferences.IDs(cfg)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if id != fileID {
				continue
			}
			data.ReferenceCount++
			if len(data.References) < 20 {
				data.References = append(data.References, AssetReferenceSummary{EnvironmentKey: cfg.EnvironmentKey, PipelineKey: cfg.PipelineKey, ScopeID: cfg.ScopeID, ResourceKey: cfg.ResourceKey, Name: cfg.Name, Alias: cfg.Alias})
			}
			break
		}
	}
	data.ReferencesTruncated = data.ReferenceCount > len(data.References)
	return data, nil
}

// Committed snapshots normally hold release-asset:// copies. Preserve any legacy
// snapshot still containing a direct original-resource link rather than break it.
func (l *Logic) protectLegacyAssetSnapshots(ctx context.Context, fileID string) error {
	var versions []model.ConfigReleaseVersion
	if err := l.db.WithContext(ctx).Where("deleted_at IS NULL").Find(&versions).Error; err != nil {
		return err
	}
	for _, version := range versions {
		var payload releasePayload
		if DecodeConfigJSON([]byte(version.Payload), &payload) != nil {
			return &AssetError{HTTPStatus: 409, ErrorType: ErrTypeAssetSnapshotDependency, Message: "snapshot " + version.SnapshotID + " cannot be inspected; deletion blocked"}
		}
		for _, cfg := range payload.Configs {
			ids, err := l.assetReferences.IDs(&model.Config{Type: cfg.Type, Content: cfg.Content, ResourceKey: cfg.ResourceKey})
			if err != nil {
				return err
			}
			for _, id := range ids {
				if id == fileID {
					return &AssetError{HTTPStatus: 409, ErrorType: ErrTypeAssetSnapshotDependency, Message: "snapshot " + version.SnapshotID + " still depends on the original resource"}
				}
			}
		}
	}
	return nil
}
