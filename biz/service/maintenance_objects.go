package service

import (
	"context"
	"errors"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"strings"
)

// MaintenanceObject is an independent byte-copy input, not a publicly supplied URL.
type MaintenanceObject struct {
	Kind, Bucket, Key, SHA256 string
	Size                      int64
}

// WalkMaintenanceObjects includes soft-deleted scopes and snapshots. It does not
// use the editor's current bytes to reconstruct any historical snapshot.
func (s *Service) WalkMaintenanceObjects(ctx context.Context, consume func(MaintenanceObject) error) error {
	if s.config == nil || s.config.Storage.Type != "minio" || s.config.ReleaseStorage.Type != "minio" {
		return errors.New("全量维护备份仅支持原始资源和历史快照均为 MinIO")
	}
	rows, err := s.logic.db.WithContext(ctx).Unscoped().Model(&model.Asset{}).Order("id").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var a model.Asset
		if err = s.logic.db.ScanRows(rows, &a); err != nil {
			return err
		}
		if a.Path == "" || strings.HasPrefix(a.Path, "/") || strings.Contains(a.Path, "://") || strings.Contains(a.Path, "\\") || strings.Contains("/"+a.Path+"/", "/../") {
			return errors.New("原始资源 locator 不是受控 MinIO key")
		}
		if err = consume(MaintenanceObject{Kind: "original", Bucket: s.config.Storage.Minio.Bucket, Key: a.Path, Size: a.FileSize}); err != nil {
			return err
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	rows.Close()
	versions, err := s.logic.db.WithContext(ctx).Unscoped().Model(&model.ConfigReleaseVersion{}).Order("id").Rows()
	if err != nil {
		return err
	}
	defer versions.Close()
	for versions.Next() {
		var row model.ConfigReleaseVersion
		if err = s.logic.db.ScanRows(versions, &row); err != nil {
			return err
		}
		if row.StorageBackend != "minio" || row.StorageBucket != s.config.ReleaseStorage.Bucket {
			return errors.New("发现 local、未知或未声明的历史快照存储，拒绝漏备")
		}
		st, err := s.snapshotStore(ctx, s.logic, &row)
		if err != nil {
			return err
		}
		if err = s.verifyReleaseComplete(ctx, s.logic, st, &row); err != nil {
			return err
		}
		assets, err := s.logic.releaseDAO.ListAssets(ctx, s.logic.db, row.SnapshotID)
		if err != nil {
			return err
		}
		manifest, err := objectManifest(&row, assets)
		if err != nil {
			return err
		}
		if err = consume(MaintenanceObject{Kind: "snapshot", Bucket: row.StorageBucket, Key: row.StoragePrefix + "manifest.json", Size: int64(len(manifest)), SHA256: payloadDigest(string(manifest))}); err != nil {
			return err
		}
		for _, a := range assets {
			if err = consume(MaintenanceObject{Kind: "snapshot", Bucket: row.StorageBucket, Key: row.StoragePrefix + "assets/" + a.AssetID + ".bin", Size: a.Size, SHA256: a.Sha256}); err != nil {
				return err
			}
		}
	}
	return versions.Err()
}
