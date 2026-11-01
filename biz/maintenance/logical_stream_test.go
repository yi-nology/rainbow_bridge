package maintenance

import (
	"context"
	"strings"
	"testing"
)

func TestLogicalRowsPreserveTextNullAndIntegerPrecision(t *testing.T) {
	input := "[\"9223372036854775807\",null,\"\\\\N\",\"a\\nb\\\"c\",\"2026-10-30 00:01:02.123456+00\"]\n"
	var out strings.Builder
	n, err := copyRows(context.Background(), strings.NewReader(input), &out, 5)
	want := "\"9223372036854775807\",\\N,\"\\N\",\"a\nb\"\"c\",\"2026-10-30 00:01:02.123456+00\"\n"
	if err != nil || n != 1 || out.String() != want {
		t.Fatalf("precision/null roundtrip failed: rows=%d err=%v CSV=%q", n, err, out.String())
	}
}
func TestLogicalRowsRejectNumbersMissingFieldsAndOversize(t *testing.T) {
	for _, input := range []string{"[9007199254740993,null]\n", "[\"x\"]\n", "null\n", "{\"sql\":\"DROP TABLE asset\"}\n", "[\"" + strings.Repeat("x", maxRowBytes) + "\",null]\n"} {
		if _, err := copyRows(context.Background(), strings.NewReader(input), &strings.Builder{}, 2); err == nil {
			t.Fatal("invalid logical row accepted")
		}
	}
}
func TestLogicalRowsRespectCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := copyRows(ctx, strings.NewReader("[\"a\"]\n"), &strings.Builder{}, 1); err == nil {
		t.Fatal("canceled restore accepted")
	}
}
