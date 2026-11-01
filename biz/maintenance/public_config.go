package maintenance

import (
	"context"
	"github.com/yi-nology/rainbow_bridge/pkg/config"
)

// ApplicationConfig is operator-only. Callers must never print its secret bytes.
func ApplicationConfig(ctx context.Context, k *Kube, c Config) (*config.Config, []byte, error) {
	return k.appConfig(ctx, c)
}
