package maintenance

import (
	"archive/zip"
	"context"
	"errors"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"io"
	"os"
)

func (k *Kube) checkZIP(ctx context.Context, path string, headers map[string]string, assets int64) error {
	r, err := k.requestHeaders(ctx, "GET", path, nil, headers)
	if err != nil {
		return errors.New("候选静态归档读取失败")
	}
	defer r.Body.Close()
	f, err := os.CreateTemp("", "rb-maint-runtime-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	const limit = int64(model.ReleaseMaxPayloadByte + model.ReleaseMaxTotalByte + 64<<20)
	n, err := io.Copy(f, io.LimitReader(r.Body, limit+1))
	if err != nil || n > limit {
		return errors.New("候选归档读取失败或超过发布限额")
	}
	z, err := zip.NewReader(f, n)
	if err != nil || int64(len(z.File)) < assets+1 {
		return errors.New("候选归档集合不完整")
	}
	var expanded int64
	for _, entry := range z.File {
		source, err := entry.Open()
		if err != nil {
			return err
		}
		count, e := io.Copy(io.Discard, io.LimitReader(source, limit-expanded+1))
		source.Close()
		expanded += count
		if e != nil || expanded > limit {
			return errors.New("候选归档 CRC 或解压限额校验失败")
		}
	}
	return nil
}
