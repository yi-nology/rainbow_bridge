package redis

import (
	"context"
	"github.com/redis/go-redis/v9"
	"net"
	"strconv"
)

// NamespaceHook isolates caches and Lua lock keys together. Returned SCAN/KEYS
// keys are stripped so a following DEL receives the prefix exactly once.
type namespaceHook struct{ prefix string }

func (h namespaceHook) DialHook(next redis.DialHook) redis.DialHook {
	return func(ctx context.Context, network, addr string) (net.Conn, error) { return next(ctx, network, addr) }
}
func (h namespaceHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		h.keys(cmd)
		err := next(ctx, cmd)
		h.result(cmd)
		return err
	}
}
func (h namespaceHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		for _, c := range cmds {
			h.keys(c)
		}
		err := next(ctx, cmds)
		for _, c := range cmds {
			h.result(c)
		}
		return err
	}
}
func (h namespaceHook) keys(cmd redis.Cmder) {
	a := cmd.Args()
	prefix := func(i int) {
		if i < len(a) {
			a[i] = h.prefix + fmtKey(a[i])
		}
	}
	switch cmd.Name() {
	case "get", "set", "setnx", "getdel", "expire", "pexpire", "pttl", "ttl":
		prefix(1)
	case "del", "unlink", "exists", "mget":
		for i := 1; i < len(a); i++ {
			prefix(i)
		}
	case "scan":
		for i := 2; i+1 < len(a); i++ {
			if fmtKey(a[i]) == "match" || fmtKey(a[i]) == "MATCH" {
				prefix(i + 1)
				return
			}
		}
	case "keys":
		prefix(1)
	case "eval", "evalsha":
		if len(a) > 3 {
			n, _ := strconv.Atoi(fmtKey(a[2]))
			for i := 3; i < 3+n; i++ {
				prefix(i)
			}
		}
	}
}
func fmtKey(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	default:
		return ""
	}
}
func (h namespaceHook) result(cmd redis.Cmder) {
	strip := func(keys []string) {
		for i, k := range keys {
			if len(k) >= len(h.prefix) && k[:len(h.prefix)] == h.prefix {
				keys[i] = k[len(h.prefix):]
			}
		}
	}
	switch c := cmd.(type) {
	case *redis.ScanCmd:
		keys, cursor := c.Val()
		strip(keys)
		c.SetVal(keys, cursor)
	case *redis.StringSliceCmd:
		if cmd.Name() == "keys" {
			keys := c.Val()
			strip(keys)
			c.SetVal(keys)
		}
	}
}
