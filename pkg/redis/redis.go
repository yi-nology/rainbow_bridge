package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
)

// NewClient creates a Redis client based on the provided configuration.
// Returns nil, nil if Redis is not enabled.
func NewClient(cfg config.RedisConfig) (*redis.Client, error) {
	if !cfg.Enabled {
		return nil, nil
	}

	addr := cfg.Address
	if addr == "" {
		addr = "localhost:6379"
	}

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	return client, nil
}
