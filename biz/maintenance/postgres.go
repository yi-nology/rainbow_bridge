package maintenance

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

func openControl(ctx context.Context, dsn string) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("控制连接格式无效")
	}
	cfg.ConnectTimeout = 3 * time.Second
	c, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("独立控制连接失败")
	}
	return c, nil
}
func closePG(c *pgx.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	c.Close(ctx)
}
