package service

import (
	"context"
	"errors"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	"github.com/yi-nology/rainbow_bridge/biz/model/common"
)

func requireAssetError(t *testing.T, err error, kind string) *AssetError {
	t.Helper()
	e, ok := AsAssetError(err)
	if !ok || e.ErrorType != kind {
		t.Fatalf("want %s, got %v", kind, err)
	}
	return e
}

func assetDeleteFixture(t *testing.T) (*Service, DeleteAssetInput, string) {
	t.Helper()
	s := newFreezeService(t)
	seedFreezeScope(t, s, "asset_qa", "default")
	a, _, err := s.UploadAsset(adminTestContext(), &FileUploadInput{EnvironmentKey: "asset_qa", PipelineKey: "default", FileName: "qa.png", ContentType: "image/png", Data: []byte("qa-image-bytes")})
	if err != nil {
		t.Fatal(err)
	}
	_, path, err := s.GetAssetFile(adminTestContext(), a.FileId)
	if err != nil {
		t.Fatal(err)
	}
	return s, DeleteAssetInput{FileID: a.FileId, EnvironmentKey: "asset_qa", PipelineKey: "default", ExpectedScopeID: a.ScopeId}, path
}

func TestAssetDeleteLifecycleAndWriteProtection(t *testing.T) {
	s, in, path := assetDeleteFixture(t)
	ctx := adminTestContext()
	if _, err := s.DeleteAsset(context.Background(), in); err == nil {
		t.Fatal("anonymous deletion accepted")
	}
	wrong := in
	wrong.ExpectedScopeID = uuid.NewString()
	if _, err := s.DeleteAsset(ctx, wrong); err == nil {
		t.Fatal("wrong scope accepted")
	}
	seedFreezeScope(t, s, "other_qa", "default")
	other, err := resolveScopeByKeys(ctx, s.logic, "other_qa", "default")
	if err != nil {
		t.Fatal(err)
	}
	wrong.EnvironmentKey = "other_qa"
	wrong.ExpectedScopeID = other.ScopeID
	_, err = s.DeleteAsset(ctx, wrong)
	requireAssetError(t, err, ErrTypeAssetNotFound)
	state := mustLock(t, s, "asset_qa", "default", "test frozen deletion")
	_, err = s.DeleteAsset(ctx, in)
	requireFreezeErrorType(t, err, ErrTypeScopeFrozen)
	if _, err = s.UnlockFreeze(ctx, in.EnvironmentKey, in.PipelineKey, "", stateRevision(state)); err != nil {
		t.Fatal(err)
	}
	result, err := s.DeleteAsset(ctx, in)
	if err != nil || !result.Deleted || result.AlreadyDeleted {
		t.Fatalf("delete: %+v %v", result, err)
	}
	result, err = s.DeleteAsset(ctx, in)
	if err != nil || !result.AlreadyDeleted {
		t.Fatalf("replay: %+v %v", result, err)
	}
	if _, err = os.Stat(path); err != nil {
		t.Fatal("soft delete removed stored file", err)
	}
	rows, err := s.ListAssets(ctx, in.EnvironmentKey, in.PipelineKey)
	if err != nil || len(rows) != 0 {
		t.Fatalf("deleted asset listed: %v %v", rows, err)
	}
	_, _, err = s.GetAssetFile(ctx, in.FileID)
	requireAssetError(t, err, ErrTypeAssetDeleted)
	draft := buildConfig(in.EnvironmentKey, in.PipelineKey, "stale", "image", "asset://"+in.FileID)
	_, err = s.AddConfig(ctx, draft)
	requireAssetError(t, err, ErrTypeAssetDeleted)
	_, err = s.ImportConfigsWithResult(ctx, []*common.ResourceConfig{draft}, true)
	requireAssetError(t, err, ErrTypeAssetDeleted)
	existing, err := s.AddConfig(ctx, buildConfig(in.EnvironmentKey, in.PipelineKey, "existing", "text", "original"))
	if err != nil {
		t.Fatal(err)
	}
	existing.Content = "asset://" + in.FileID
	_, err = s.UpdateConfig(ctx, existing, existing.EditRevision)
	requireAssetError(t, err, ErrTypeAssetDeleted)
	wrong = in
	wrong.FileID = "unknown-resource"
	_, err = s.DeleteAsset(ctx, wrong)
	requireAssetError(t, err, ErrTypeAssetNotFound)
	if _, err = s.DeleteEnvironmentWithIdentity(ctx, in.EnvironmentKey, other.EnvironmentID); err == nil {
		t.Fatal("wrong environment identity accepted")
	}
}

func stateRevision(state *FreezeStatusData) string { return fmtRevision(state.Revision) }

func TestAssetReferencesCompatibility(t *testing.T) {
	s, in, _ := assetDeleteFixture(t)
	ctx := adminTestContext()
	settings := s.AuthSettings()
	settings.TrustedOrigins = []string{"https://qa.example:8443"}
	s.SetAuthSettings(settings)
	seedFreezeScope(t, s, "cross_scope", "default")
	for i, example := range []struct{ typ, content string }{
		{"text", "asset://" + in.FileID + "?q=1#x"},
		{"richtext", `<img src="/rainbow-bridge/api/v1/asset/file/` + in.FileID + `/qa.png?q=1#x">`},
		{"object", `{"nested":[{"pic":"asset://` + in.FileID + `"}]}`},
		{"text", "https://qa.example:8443/rainbow-bridge/api/v1/asset/file/" + in.FileID + "/qa.png?x=1#x"},
	} {
		cfg, err := s.AddConfig(ctx, buildConfig("cross_scope", "default", fmtRevision(int64(i)), example.typ, example.content))
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.DeleteAsset(ctx, in)
		e := requireAssetError(t, err, ErrTypeAssetInUse)
		if e.References.ReferenceCount != 1 || len(e.References.References) != 1 || e.References.References[0].ResourceKey != cfg.ResourceKey {
			t.Fatalf("wrong references: %+v", e.References)
		}
		if err = s.DeleteConfig(ctx, cfg.EnvironmentKey, cfg.PipelineKey, cfg.ResourceKey); err != nil {
			t.Fatal(err)
		}
	}
	for _, text := range []string{in.FileID, "asset://" + in.FileID + "-similar", "https://external.example/rainbow-bridge/api/v1/asset/file/" + in.FileID + "/qa.png", "release-asset://" + in.FileID} {
		ids, err := s.logic.assetReferences.IDs(&model.Config{Type: "text", Content: text})
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			if id == in.FileID {
				t.Fatalf("false positive: %s", text)
			}
		}
	}
	// Fail closed on malformed historical structured content, with a locator.
	bad := &model.Config{ResourceKey: uuid.NewString(), Alias: "bad", EnvironmentKey: in.EnvironmentKey, PipelineKey: in.PipelineKey, ScopeID: in.ExpectedScopeID, Type: "object", Content: "{"}
	if err := s.logic.configDAO.Create(ctx, s.logic.db, bad); err != nil {
		t.Fatal(err)
	}
	_, err := s.DeleteAsset(ctx, in)
	e := requireAssetError(t, err, ErrTypeAssetReferenceInvalid)
	if !strings.Contains(e.Message, bad.ResourceKey) {
		t.Fatal("missing config locator")
	}
	if err = s.DeleteConfig(ctx, in.EnvironmentKey, in.PipelineKey, bad.ResourceKey); err != nil {
		t.Fatal(err)
	}
	if _, err = s.DeleteAsset(ctx, in); err != nil {
		t.Fatal(err)
	}
}

func fmtRevision(n int64) string { return strconv.FormatInt(n, 10) }

func TestAssetDeleteReferenceSummaryLimit(t *testing.T) {
	s, in, _ := assetDeleteFixture(t)
	ctx := adminTestContext()
	for i := 0; i < 21; i++ {
		if _, err := s.AddConfig(ctx, buildConfig(in.EnvironmentKey, in.PipelineKey, "ref"+fmtRevision(int64(i)), "text", "asset://"+in.FileID+" asset://"+in.FileID)); err != nil {
			t.Fatal(err)
		}
	}
	_, err := s.DeleteAsset(ctx, in)
	e := requireAssetError(t, err, ErrTypeAssetInUse)
	if e.References.ReferenceCount != 21 || len(e.References.References) != 20 || !e.References.ReferencesTruncated {
		t.Fatalf("bad summary: %+v", e.References)
	}
}

func TestAssetDeleteKeepsSnapshotCopies(t *testing.T) {
	f := newReleaseFixture(t)
	ctx := adminTestContext()
	version, err := f.create(t, "asset-delete-qa", "1", "")
	if err != nil {
		t.Fatal(err)
	}
	detail, err := f.svc.ReleaseDetail(ctx, "qa_prod", "main", version.Meta.Version)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Assets) == 0 {
		t.Fatal("no snapshot image")
	}
	locked, err := f.svc.FreezeStatus(ctx, "qa_prod", "main")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.svc.UnlockFreeze(ctx, "qa_prod", "main", "", fmtRevision(locked.Revision)); err != nil {
		t.Fatal(err)
	}
	configs, err := f.svc.ListConfigs(ctx, "qa_prod", "main", "", "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, cfg := range configs {
		if cfg.Type == "image" {
			if err = f.svc.DeleteConfig(ctx, "qa_prod", "main", cfg.ResourceKey); err != nil {
				t.Fatal(err)
			}
		}
	}
	scope, err := resolveScopeByKeys(ctx, f.svc.logic, "qa_prod", "main")
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.svc.DeleteAsset(ctx, DeleteAssetInput{FileID: f.fileA, EnvironmentKey: "qa_prod", PipelineKey: "main", ExpectedScopeID: scope.ScopeID})
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = f.svc.GetAssetFile(ctx, f.fileA)
	requireAssetError(t, err, ErrTypeAssetDeleted)
	if _, err = os.Stat(f.fileAPath); errors.Is(err, os.ErrNotExist) {
		t.Fatal("original payload removed")
	}
	_, payload, err := f.svc.ReleaseAssetDownload(ctx, version.Meta.SnapshotID, detail.Assets[0].AssetID)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != "PNG-A-BYTES" {
		t.Fatalf("snapshot changed: %q", payload)
	}
}
