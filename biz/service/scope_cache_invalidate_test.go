package service

import (
	"context"
	"strings"
	"testing"

	redisclient "github.com/redis/go-redis/v9"
)

// TestInvalidateScopeCachesUsesBoundedScan 钉住 issue #34:范围删除后的缓存失效
// 必须与普通写入路径(invalidateConfigCaches)遵守同一条纪律——有界 SCAN,绝不
// 对共享 Redis 发阻塞式 KEYS(redis.go 对 DeleteByPatternScan 的逐字承诺)。
func TestInvalidateScopeCachesUsesBoundedScan(t *testing.T) {
	hook := &importCacheHook{}
	client := redisclient.NewClient(&redisclient.Options{Addr: "unused"})
	client.AddHook(hook)
	defer client.Close()

	logic := NewLogic(nil, client)
	logic.invalidateScopeCaches(context.Background(), "scope-1", "dev", "main")

	scans, keys := 0, 0
	joined := strings.Join(hook.calls, "; ")
	for _, call := range hook.calls {
		switch strings.Fields(call)[0] {
		case "scan":
			scans++
		case "keys":
			keys++
		}
	}
	if keys != 0 {
		t.Fatalf("scope invalidation issued blocking KEYS %d time(s): %v", keys, hook.calls)
	}
	if scans != 4 {
		t.Fatalf("expected one bounded SCAN per pattern (4), got %d: %v", scans, hook.calls)
	}
	// The fixture's fake SCAN replies with one matched key per pattern; each
	// batch is deleted, plus the two map keys.
	for _, want := range []string{
		"del rainbow_bridge:config:map:scope:scope-1",
		"del rainbow_bridge:config:map:dev:main",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing map-key delete %q: %v", want, hook.calls)
		}
	}
}
