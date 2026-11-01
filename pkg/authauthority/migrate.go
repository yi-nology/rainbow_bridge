// Package authauthority provides explicit deployment-time authentication migration.
package authauthority

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"gorm.io/gorm"
)

const Schema = `CREATE TABLE IF NOT EXISTS rb_auth_authority (
 instance_id uuid PRIMARY KEY REFERENCES rb_maintenance_instance(instance_id),
 schema_version integer NOT NULL,state text NOT NULL,session_epoch bigint NOT NULL,
 source_fingerprint text NOT NULL,migrated_at timestamptz NOT NULL DEFAULT now())`

// Migrate runs while the source application is fenced and all source sessions stopped.
// A committed marker makes restarts idempotent without importing stale credentials again.
func Migrate(ctx context.Context, source, control *gorm.DB, instance, sourceRole string) error {
	var fenced bool
	var sessions int64
	if source.WithContext(ctx).Raw(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=? AND NOT rolcanlogin AND NOT rolsuper AND shobj_description(oid,'pg_authid')=?)`, sourceRole, "rainbow-maintenance:"+instance).Scan(&fenced).Error != nil || !fenced {
		return errors.New("认证迁移必须先禁止独占应用角色登录")
	}
	if source.WithContext(ctx).Raw(`SELECT count(*) FROM pg_stat_activity WHERE usename=?`, sourceRole).Scan(&sessions).Error != nil || sessions != 0 {
		return errors.New("认证迁移仍有应用连接")
	}
	var users []model.AuthUser
	if err := source.WithContext(ctx).Order("id").Find(&users).Error; err != nil || len(users) == 0 {
		return errors.New("当前账号读取失败，禁止生成默认账号")
	}
	if err := control.WithContext(ctx).AutoMigrate(&model.AuthUser{}, &model.AuthSession{}); err != nil {
		return err
	}
	if err := control.WithContext(ctx).Exec(Schema).Error; err != nil {
		return err
	}
	// Explicit fields: PasswordHash is deliberately excluded by the public JSON model.
	fingerprint := func(rows []model.AuthUser) string {
		var values []any
		for _, u := range rows {
			values = append(values, []any{u.ID, u.Username, u.PasswordHash, u.Role, u.Disabled, u.CredentialVersion, u.CreatedAt, u.UpdatedAt})
		}
		b, _ := json.Marshal(values)
		h := sha256.Sum256(b)
		return hex.EncodeToString(h[:])
	}
	return control.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(`SELECT pg_advisory_xact_lock(hashtextextended(?,1))`, instance).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Raw(`SELECT count(*) FROM rb_auth_authority WHERE instance_id=? AND schema_version=1 AND state='active'`, instance).Scan(&count).Error; err != nil {
			return err
		}
		if count == 1 {
			return nil
		} // Authority already committed: never resync from a business backup.
		var existing []model.AuthUser
		if err := tx.Order("id").Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) > 0 && fingerprint(existing) != fingerprint(users) {
			return errors.New("控制库已有不一致账号，拒绝覆盖")
		}
		if len(existing) == 0 {
			if err := tx.Create(&users).Error; err != nil {
				return err
			}
		}
		if err := tx.Exec(`DELETE FROM auth_sessions`).Error; err != nil {
			return err
		}
		if err := tx.Exec(`SELECT setval(pg_get_serial_sequence('auth_users','id'),GREATEST((SELECT max(id) FROM auth_users),1),true)`).Error; err != nil {
			return err
		}
		return tx.Exec(`INSERT INTO rb_auth_authority(instance_id,schema_version,state,session_epoch,source_fingerprint) VALUES(?,1,'active',1,?)`, instance, fingerprint(users)).Error
	})
}
