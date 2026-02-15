package middleware

import (
	"context"
	"log"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/pkg/lock"
)

var globalWriteLock *lock.DistributedLock

// InitWriteLock sets the global distributed write lock instance.
// When set, all write endpoints will serialize through this lock.
func InitWriteLock(l *lock.DistributedLock) {
	globalWriteLock = l
}

// WriteLockMw returns a middleware slice that acquires the global write lock.
// If the lock is not initialized (Redis disabled), returns nil so requests
// pass through without any locking overhead.
func WriteLockMw() []app.HandlerFunc {
	if globalWriteLock == nil {
		return nil
	}
	return []app.HandlerFunc{writeLockHandler()}
}

func writeLockHandler() app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		lockID, err := globalWriteLock.Acquire(ctx)
		if err != nil {
			log.Printf("[WriteLock] failed to acquire lock: %v", err)
			c.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"code": http.StatusServiceUnavailable,
				"msg":  "service busy, please retry later",
			})
			c.Abort()
			return
		}
		defer func() {
			if releaseErr := globalWriteLock.Release(ctx, lockID); releaseErr != nil {
				log.Printf("[WriteLock] failed to release lock: %v", releaseErr)
			}
		}()
		c.Next(ctx)
	}
}
