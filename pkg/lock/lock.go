package lock

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// DistributedLock implements a global exclusive lock backed by Redis.
type DistributedLock struct {
	client         *redis.Client
	lockKey        string
	lockTTL        time.Duration
	acquireTimeout time.Duration
}

// New creates a DistributedLock.
//   - key: the Redis key used for the lock (e.g. "rainbow_bridge:write_lock")
//   - ttl: how long the lock is held before auto-expiry (prevents deadlock)
//   - acquireTimeout: max time to wait when trying to acquire the lock
func New(client *redis.Client, key string, ttl, acquireTimeout time.Duration) *DistributedLock {
	return &DistributedLock{
		client:         client,
		lockKey:        key,
		lockTTL:        ttl,
		acquireTimeout: acquireTimeout,
	}
}

// Acquire attempts to obtain the lock, blocking with exponential backoff
// until success or timeout. Returns a unique lockID used for Release.
func (l *DistributedLock) Acquire(ctx context.Context) (string, error) {
	lockID := uuid.New().String()
	deadline := time.Now().Add(l.acquireTimeout)
	backoff := 50 * time.Millisecond

	for {
		ok, err := l.client.SetNX(ctx, l.lockKey, lockID, l.lockTTL).Result()
		if err != nil {
			return "", fmt.Errorf("redis setnx: %w", err)
		}
		if ok {
			return lockID, nil
		}

		if time.Now().After(deadline) {
			return "", fmt.Errorf("timeout acquiring write lock after %s", l.acquireTimeout)
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(backoff):
		}

		// exponential backoff, max 500ms
		backoff *= 2
		if backoff > 500*time.Millisecond {
			backoff = 500 * time.Millisecond
		}
	}
}

// releaseScript atomically checks that the lock value matches before deleting,
// preventing a client from releasing a lock it no longer owns.
var releaseScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`)

// Release releases the lock only if it is still owned by the given lockID.
func (l *DistributedLock) Release(ctx context.Context, lockID string) error {
	_, err := releaseScript.Run(ctx, l.client, []string{l.lockKey}, lockID).Result()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("release lock: %w", err)
	}
	return nil
}
