package maintenance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/yi-nology/rainbow_bridge/biz/backup"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"github.com/yi-nology/rainbow_bridge/pkg/database"
	"io"
	"os"
	"strings"
	"time"
)

func BuildBackup(ctx context.Context, l *Lease, app *config.Config, store *Store) error {
	ctx, cancel := context.WithTimeout(ctx, l.cfg.StreamTimeout)
	defer cancel()
	// Every executor attempt has its own prefix. Partial prefixes are retained
	// explicitly and never considered available by listing the bucket.
	l.Op.Data.Prefix = fmt.Sprintf("backups/%s/%s/", l.Op.Data.BackupID, uuid.NewString())
	l.Op.Data.AttemptPrefixes = append(l.Op.Data.AttemptPrefixes, l.Op.Data.Prefix)
	l.resetProgress()
	if err := l.Save(ctx, "copying"); err != nil {
		return err
	}
	m := Manifest{Format: Format, InstanceID: l.cfg.InstanceID, BackupID: l.Op.Data.BackupID, Producer: "maintenance-backup-v1", Objects: []Object{}}
	db, err := connectDB(ctx, l.cfg.AdminDSN, l.Op.Data.Plan.Database)
	if err != nil {
		return err
	}
	defer closePG(db)
	m.Tables, err = ExportLogical(ctx, db, store, l, l.Op.Data.Prefix)
	if err != nil {
		return err
	}
	readCfg := *app
	readCfg.Backup.Distributed.Enabled = false
	adminCfg := readCfg.Database
	adminCfg.Postgres.DSN, err = DatabaseDSN(l.cfg.AdminDSN, l.Op.Data.Plan.Database)
	if err != nil {
		return err
	}
	g, err := database.Open(adminCfg)
	if err != nil {
		return errors.New("业务清单连接失败")
	}
	sqlDB, _ := g.DB()
	defer sqlDB.Close()
	svc := service.NewService(g, nil, app.Server.BasePath, &readCfg)
	defer svc.CloseDistributedControl()
	seen := map[string]Object{}
	err = svc.WalkMaintenanceObjects(ctx, func(source service.MaintenanceObject) error {
		if len(m.Objects) >= 100000 {
			return errors.New("对象清单超过 100000 项限额")
		}
		id := source.Kind + "/" + source.Key
		if old, exists := seen[id]; exists {
			if old.File.Bytes != source.Size || (source.SHA256 != "" && old.File.SHA256 != source.SHA256) {
				return errors.New("同一个源 key 的业务声明冲突")
			}
			return nil
		}
		stat, e := store.client.StatObject(ctx, source.Bucket, source.Key, minio.StatObjectOptions{})
		if e != nil || stat.Size != source.Size || stat.ETag == "" {
			return errors.New("源资源不存在或长度不匹配")
		}
		key := fmt.Sprintf("%sobjects/%06d", l.Op.Data.Prefix, len(m.Objects))
		f, e := store.copyObject(ctx, l, source.Bucket, source.Key, stat.VersionID, store.backup, key, source.Size, source.SHA256)
		if e != nil {
			return e
		}
		after, e := store.client.StatObject(ctx, source.Bucket, source.Key, minio.StatObjectOptions{})
		if e != nil || after.ETag != stat.ETag || after.VersionID != stat.VersionID || after.Size != stat.Size {
			return errors.New("源资源复制期间发生变化")
		}
		o := Object{Kind: source.Kind, Key: source.Key, File: f, SourceVersion: stat.VersionID}
		m.Objects = append(m.Objects, o)
		l.Op.Data.Progress.Objects++
		seen[id] = o
		return nil
	})
	if err != nil {
		return err
	}
	for _, t := range m.Tables {
		for _, f := range t.Files {
			m.Bytes += f.Bytes
		}
	}
	for _, o := range m.Objects {
		m.Bytes += o.File.Bytes
	}
	m.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	b, err := json.Marshal(m)
	if err != nil || int64(len(b)) > maxPartBytes {
		return errors.New("完成清单超过限额")
	}
	if err = verifyManifest(ctx, store, l.cfg.InstanceID, l.Op.Data.BackupID, l.Op.Data.Prefix, &m); err != nil {
		return err
	}
	f, err := os.CreateTemp("", "rb-maint-manifest-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	manifest, err := store.putFile(ctx, l, store.backup, l.Op.Data.Prefix+"manifest.json", f.Name())
	if err != nil {
		return err
	}
	l.Op.Data.ManifestSHA = manifest.SHA256
	if err = l.Save(ctx, "manifest_written"); err != nil {
		return err
	}
	return publishBackup(ctx, l)
}
func publishBackup(ctx context.Context, l *Lease) error {
	if err := l.Check(ctx); err != nil {
		return err
	}
	tag, err := l.conn.Exec(ctx, `INSERT INTO rb_maintenance_backup(backup_id,instance_id,operation_id,prefix,manifest_sha,state) VALUES($1,$2,$3,$4,$5,'available') ON CONFLICT(backup_id) DO UPDATE SET prefix=EXCLUDED.prefix,manifest_sha=EXCLUDED.manifest_sha,state='available' WHERE rb_maintenance_backup.state='pending' AND rb_maintenance_backup.operation_id=EXCLUDED.operation_id`, l.Op.Data.BackupID, l.cfg.InstanceID, l.Op.ID, l.Op.Data.Prefix, l.Op.Data.ManifestSHA)
	if err != nil {
		return errors.New("备份索引提交失败")
	}
	if tag.RowsAffected() != 1 {
		var same bool
		if l.conn.QueryRow(ctx, `SELECT operation_id=$2 AND prefix=$3 AND manifest_sha=$4 AND state='available' FROM rb_maintenance_backup WHERE backup_id=$1`, l.Op.Data.BackupID, l.Op.ID, l.Op.Data.Prefix, l.Op.Data.ManifestSHA).Scan(&same) != nil || !same {
			return errors.New("备份索引提交冲突")
		}
	}
	return l.Save(ctx, "available")
}
func LoadManifest(ctx context.Context, cfg Config, store *Store, id string) (*Manifest, string, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, "", errors.New("backup-id 必须是 UUID")
	}
	c, err := openControl(ctx, cfg.ControlDSN)
	if err != nil {
		return nil, "", errors.New("控制索引不可用")
	}
	defer c.Close(ctx)
	var prefix, sha string
	if c.QueryRow(ctx, `SELECT prefix,manifest_sha FROM rb_maintenance_backup WHERE backup_id=$1 AND instance_id=$2 AND state='available'`, id, cfg.InstanceID).Scan(&prefix, &sha) != nil {
		return nil, "", errors.New("备份不存在或尚未 available")
	}
	if !strings.HasPrefix(prefix, "backups/"+id+"/") || strings.Contains(prefix, "..") {
		return nil, "", errors.New("控制索引前缀无效")
	}
	r, err := store.read(ctx, store.backup, prefix+"manifest.json", "")
	if err != nil {
		return nil, "", err
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(r, maxPartBytes+1))
	if err != nil || int64(len(b)) > maxPartBytes || digest(b) != sha {
		return nil, "", errors.New("完成清单损坏或超过限额")
	}
	var m Manifest
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if dec.Decode(&m) != nil {
		return nil, "", errors.New("完成清单格式无效")
	}
	if err = verifyManifest(ctx, store, cfg.InstanceID, id, prefix, &m); err != nil {
		return nil, "", err
	}
	return &m, sha, nil
}
func verifyManifest(ctx context.Context, s *Store, instance, id, prefix string, m *Manifest) error {
	if m.Format != Format || m.InstanceID != instance || m.BackupID != id || m.CompletedAt == "" || len(m.Objects) > 100000 {
		return errors.New("备份格式、实例或完整性标识不匹配")
	}
	allow := backup.BusinessTableAllowlist()
	if len(m.Tables) != len(allow) {
		return errors.New("备份业务表集合不完整")
	}
	seen := map[string]bool{}
	var bytes int64
	for i, t := range m.Tables {
		spec := allow[i]
		if t.Name != spec.Name || strings.Join(t.Columns, "\x00") != strings.Join(spec.Columns, "\x00") || len(t.Types) != len(t.Columns) || len(t.Files) == 0 {
			return errors.New("表和列不在固定 allowlist")
		}
		for _, typ := range t.Types {
			if !allowedTypes[typ] {
				return errors.New("备份字段类型不支持")
			}
		}
		var rows int64
		for j, f := range t.Files {
			if f.Key != fmt.Sprintf("%sdata/%s/%06d.ndjson", prefix, t.Name, j) || f.Rows < 0 {
				return errors.New("数据分片集合无效")
			}
			if err := s.verify(ctx, s.backup, f); err != nil {
				return err
			}
			r, err := s.read(ctx, s.backup, f.Key, "")
			if err != nil {
				return err
			}
			n, e := copyRows(ctx, r, io.Discard, len(t.Columns))
			r.Close()
			if e != nil || n != f.Rows {
				return errors.New("数据分片逻辑行校验失败")
			}
			rows += n
			bytes += f.Bytes
		}
		if rows != t.Rows {
			return errors.New("业务表行数不符")
		}
	}
	for i, o := range m.Objects {
		if (o.Kind != "original" && o.Kind != "snapshot") || o.Key == "" || strings.Contains(o.Key, "://") || strings.HasPrefix(o.Key, "/") || strings.Contains("/"+o.Key+"/", "/../") || o.File.Key != fmt.Sprintf("%sobjects/%06d", prefix, i) {
			return errors.New("对象映射无效")
		}
		id := o.Kind + "/" + o.Key
		if seen[id] {
			return errors.New("对象清单重复")
		}
		seen[id] = true
		if err := s.verify(ctx, s.backup, o.File); err != nil {
			return err
		}
		bytes += o.File.Bytes
	}
	if bytes != m.Bytes {
		return errors.New("备份总字节数不符")
	}
	return nil
}
