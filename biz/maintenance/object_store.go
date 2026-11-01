package maintenance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
	"io"
	"os"
)

const maxPartBytes int64 = 32 << 20

type File struct {
	Key         string
	Bytes, Rows int64
	SHA256      string
}
type Object struct {
	Kind, Key     string
	File          File
	SourceVersion string
}
type Table struct {
	Name           string
	Columns, Types []string
	Files          []File
	Rows           int64
}
type Manifest struct {
	Format, InstanceID, BackupID, Producer string
	Tables                                 []Table
	Objects                                []Object
	CompletedAt                            string
	Bytes                                  int64
}

const Format = "rainbow-maintenance-backup-v1"

type Store struct {
	client  *minio.Client
	backup  string
	scratch func() (scratchFile, error)
}
type scratchFile interface {
	io.WriteCloser
	Name() string
}

func (s *Store) newScratch() (scratchFile, error) {
	if s.scratch != nil {
		return s.scratch()
	}
	return os.CreateTemp("", "rb-maint-object-*")
}

func NewOperatorStore(app *config.Config, c Config) (*Store, error) {
	if c.Minio.Endpoint != app.Storage.Minio.Endpoint || c.Minio.UseSSL != app.Storage.Minio.UseSSL || c.Minio.AccessKey == app.Storage.Minio.AccessKey {
		return nil, errors.New("维护对象存储必须使用同一端点的独立运维身份")
	}
	return NewStore(c.Minio, c.BackupBucket)
}

func NewStore(cfg config.MinioConfig, bucket string) (*Store, error) {
	c, err := minio.New(cfg.Endpoint, &minio.Options{Creds: credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""), Secure: cfg.UseSSL, Region: cfg.Region})
	if err != nil {
		return nil, errors.New("备份对象存储配置无效")
	}
	return &Store{client: c, backup: bucket}, nil
}
func (s *Store) privateBucket(ctx context.Context, bucket string) error {
	exists, err := s.client.BucketExists(ctx, bucket)
	if err != nil || !exists {
		return errors.New("独立备份 bucket 不存在或无权访问")
	}
	policy, err := s.client.GetBucketPolicy(ctx, bucket)
	if err != nil && minio.ToErrorResponse(err).Code != "NoSuchBucketPolicy" {
		return errors.New("不能核实备份 bucket 私有策略")
	}
	if policy != "" {
		return errors.New("首批备份 bucket 必须无公开策略")
	}
	rules, err := s.client.GetBucketLifecycle(ctx, bucket)
	if err != nil && minio.ToErrorResponse(err).Code != "NoSuchLifecycleConfiguration" {
		return errors.New("不能核实备份 bucket 生命周期")
	}
	if rules != nil && len(rules.Rules) > 0 {
		return errors.New("备份 bucket 存在生命周期规则，拒绝误删风险")
	}
	return nil
}
func (s *Store) read(ctx context.Context, bucket, key, version string) (io.ReadCloser, error) {
	o, err := s.client.GetObject(ctx, bucket, key, minio.GetObjectOptions{VersionID: version})
	if err != nil {
		return nil, errors.New("对象读取失败")
	}
	return o, nil
}
func (s *Store) verify(ctx context.Context, bucket string, f File) error {
	if f.Bytes < 0 || f.Bytes > maxPartBytes || len(f.SHA256) != 64 {
		return errors.New("对象长度或摘要无效")
	}
	r, err := s.read(ctx, bucket, f.Key, "")
	if err != nil {
		return err
	}
	defer r.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(r, f.Bytes+1))
	if err != nil || n != f.Bytes || hex.EncodeToString(h.Sum(nil)) != f.SHA256 {
		return errors.New("对象字节数或 SHA256 不匹配")
	}
	return nil
}
func (s *Store) putFile(ctx context.Context, l *Lease, bucket, key, path string) (File, error) {
	f := File{Key: key}
	r, err := os.Open(path)
	if err != nil {
		return f, err
	}
	defer r.Close()
	h := sha256.New()
	f.Bytes, err = io.Copy(h, io.LimitReader(r, maxPartBytes+1))
	if err != nil || f.Bytes > maxPartBytes {
		return f, errors.New("数据分片超过单 PUT 限额")
	}
	f.SHA256 = hex.EncodeToString(h.Sum(nil))
	if _, err = r.Seek(0, 0); err != nil {
		return f, err
	}
	if err = l.Check(ctx); err != nil {
		return f, err
	}
	// Each owner uses a fresh prefix, so an old executor cannot overwrite a winner.
	info, statErr := s.client.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if statErr == nil {
		if info.Size != f.Bytes {
			return f, errors.New("目标对象已存在且不匹配")
		}
		return f, s.verify(ctx, bucket, f)
	}
	if code := minio.ToErrorResponse(statErr).Code; code != "NoSuchKey" && code != "NoSuchObject" && code != "NotFound" {
		return f, errors.New("不能确认目标对象未被占用")
	}
	result, err := s.client.PutObject(ctx, bucket, key, r, f.Bytes, minio.PutObjectOptions{DisableMultipart: true, ContentType: "application/octet-stream"})
	if err != nil || result.Size != f.Bytes {
		return f, errors.New("对象单 PUT 失败")
	}
	if err = l.Check(ctx); err != nil {
		return f, err
	}
	return f, s.verify(ctx, bucket, f)
}
func (s *Store) copyObject(ctx context.Context, l *Lease, sourceBucket, sourceKey, version, targetBucket, targetKey string, size int64, sha string) (File, error) {
	if size < 0 || size > maxPartBytes {
		return File{}, errors.New("资源超过全量备份单对象 32MiB 限额")
	}
	r, err := s.read(ctx, sourceBucket, sourceKey, version)
	if err != nil {
		return File{}, err
	}
	defer r.Close()
	f, err := s.newScratch()
	if err != nil {
		return File{}, err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h, progressWriter{ctx, l}), io.LimitReader(r, size+1))
	if err != nil || n != size || (sha != "" && hex.EncodeToString(h.Sum(nil)) != sha) {
		return File{}, errors.New("源对象缺失或摘要不匹配")
	}
	if err = f.Close(); err != nil {
		return File{}, err
	}
	return s.putFile(ctx, l, targetBucket, targetKey, f.Name())
}
