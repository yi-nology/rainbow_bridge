//go:build !dev
// +build !dev

package static

import (
	"io/fs"
	"testing"
)

// Regression for the fresh-clone build failure: //go:embed all:web needs at
// least one committed file under pkg/static/web, otherwise go build ./... and
// go test ./... fail before any test can run (issue #30). The committed
// .placeholder satisfies the pattern; `all:` keeps it embedded despite the
// leading dot.
func TestEmbeddedWebFSContainsPlaceholder(t *testing.T) {
	fsys, err := WebFS()
	if err != nil {
		t.Fatalf("open embedded web fs: %v", err)
	}
	data, err := fs.ReadFile(fsys, ".placeholder")
	if err != nil {
		t.Fatalf("embedded .placeholder unreadable: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("embedded .placeholder is empty")
	}
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		t.Fatalf("list embedded web fs: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("embedded web fs is empty")
	}
}
