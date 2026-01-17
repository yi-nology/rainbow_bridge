package resource_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/yi-nology/rainbow_bridge/biz/model/api"
	resourcemodel "github.com/yi-nology/rainbow_bridge/biz/model/resource"
	resourceservice "github.com/yi-nology/rainbow_bridge/biz/service/resource"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestService(t *testing.T, basePath ...string) (*resourceservice.Service, func()) {
	t.Helper()
	tmp := t.TempDir()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir temp: %v", err)
	}

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", uuid.NewString())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&resourcemodel.Config{}, &resourcemodel.Asset{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	pathPrefix := ""
	if len(basePath) > 0 {
		pathPrefix = basePath[0]
	}
	svc := resourceservice.NewService(db, pathPrefix)
	cleanup := func() { _ = os.Chdir(cwd) }
	return svc, cleanup
}

func TestConfigLifecycle(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	create := &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "biz-1",
		Alias:       "conf",
		Content:     `{"foo":"bar"}`,
	}}
	cfg, err := svc.AddConfig(ctx, create)
	if err != nil {
		t.Fatalf("AddConfig: %v", err)
	}
	if cfg.GetResourceKey() == "" {
		t.Fatalf("expected resource key assigned")
	}

	list, err := svc.ListConfigs(ctx, &api.ResourceQueryRequest{BusinessKey: "biz-1"})
	if err != nil {
		t.Fatalf("ListConfigs: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 config, got %d", len(list))
	}

	update := &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: cfg.GetBusinessKey(),
		ResourceKey: cfg.GetResourceKey(),
		Alias:       cfg.GetAlias(),
		Content:     `{"foo":"baz"}`,
	}}
	_, err = svc.UpdateConfig(ctx, update)
	if err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}

	detail, err := svc.GetConfigDetail(ctx, &api.ResourceDetailRequest{
		BusinessKey: cfg.GetBusinessKey(),
		ResourceKey: cfg.GetResourceKey(),
	})
	if err != nil {
		t.Fatalf("GetConfigDetail: %v", err)
	}
	if detail.GetContent() != `{"foo":"baz"}` {
		t.Fatalf("unexpected content %s", detail.GetContent())
	}

	if err := svc.DeleteConfig(ctx, &api.ResourceDeleteRequest{
		BusinessKey: cfg.GetBusinessKey(),
		ResourceKey: cfg.GetResourceKey(),
	}); err != nil {
		t.Fatalf("DeleteConfig: %v", err)
	}
}

func TestAssetUploadAndServe(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	data := []byte("hello world")
	asset, ref, err := svc.UploadAsset(ctx, &resourceservice.FileUploadInput{
		BusinessKey: "biz-asset",
		FileName:    "hello.txt",
		Data:        data,
	})
	if err != nil {
		t.Fatalf("UploadAsset: %v", err)
	}
	if !regexp.MustCompile(`^asset://`).MatchString(ref) {
		t.Fatalf("expected asset reference, got %s", ref)
	}

	entity, path, err := svc.GetAssetFile(ctx, asset.GetFileId())
	if err != nil {
		t.Fatalf("GetAssetFile: %v", err)
	}
	if entity.FileName != "hello.txt" {
		t.Fatalf("unexpected file name %s", entity.FileName)
	}
	stored, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read stored file: %v", err)
	}
	if !bytes.Equal(stored, data) {
		t.Fatalf("stored data mismatch")
	}

	assetList, err := svc.ListAssets(ctx, "biz-asset")
	if err != nil {
		t.Fatalf("ListAssets: %v", err)
	}
	if len(assetList) != 1 {
		t.Fatalf("expected 1 asset, got %d", len(assetList))
	}
	if assetList[0].GetFileId() != asset.GetFileId() {
		t.Fatalf("unexpected asset id %s", assetList[0].GetFileId())
	}
}

func TestBasePathDecoratesURLs(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t, "/rainbow-bridge")
	defer cleanup()

	data := []byte("logo")
	asset, _, err := svc.UploadAsset(ctx, &resourceservice.FileUploadInput{
		BusinessKey: "prefixed",
		FileName:    "logo.png",
		Data:        data,
	})
	if err != nil {
		t.Fatalf("UploadAsset: %v", err)
	}
	if url := asset.GetUrl(); !strings.HasPrefix(url, "/rainbow-bridge/api/v1/files/") {
		t.Fatalf("asset url should include base path, got %s", url)
	}

	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "prefixed",
		Alias:       "logo",
		Type:        "image",
		Content:     fmt.Sprintf("asset://%s", asset.GetFileId()),
	}})
	if err != nil {
		t.Fatalf("AddConfig: %v", err)
	}

	list, err := svc.ListConfigs(ctx, &api.ResourceQueryRequest{BusinessKey: "prefixed"})
	if err != nil {
		t.Fatalf("ListConfigs: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 config, got %d", len(list))
	}
	if content := list[0].GetContent(); !strings.HasPrefix(content, "/rainbow-bridge/api/v1/files/") {
		t.Fatalf("config content should include base path, got %s", content)
	}
}

func TestExportImportArchive(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	asset, ref, err := svc.UploadAsset(ctx, &resourceservice.FileUploadInput{
		BusinessKey: "biz-archive",
		FileName:    "data.bin",
		Data:        []byte("payload"),
	})
	if err != nil {
		t.Fatalf("UploadAsset: %v", err)
	}

	// Create config referencing the asset
	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "biz-archive",
		Alias:       "cfg",
		Content:     fmt.Sprintf(`{"file":"%s"}`, ref),
	}})
	if err != nil {
		t.Fatalf("AddConfig: %v", err)
	}

	archive, name, err := svc.ExportConfigsArchive(ctx, &api.ResourceExportRequest{BusinessKey: "biz-archive"})
	if err != nil {
		t.Fatalf("ExportConfigsArchive: %v", err)
	}
	if name == "" {
		t.Fatalf("expected archive name")
	}

	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatalf("zip reader: %v", err)
	}

	var cfgs []*api.ResourceConfig
	foundAsset := false
	for _, f := range reader.File {
		clean := filepath.Clean(f.Name)
		switch clean {
		case "configs.json":
			rc, _ := f.Open()
			payload, _ := io.ReadAll(rc)
			rc.Close()
			if err := json.Unmarshal(payload, &cfgs); err != nil {
				t.Fatalf("unmarshal configs: %v", err)
			}
		default:
			if strings.HasPrefix(clean, "files/") && strings.HasSuffix(clean, asset.GetFileName()) {
				foundAsset = true
			}
		}
	}
	if len(cfgs) != 1 {
		t.Fatalf("expected configs exported")
	}
	if !foundAsset {
		t.Fatalf("asset not included in archive")
	}

	// Import into new service
	other, cleanupOther := newTestService(t)
	defer cleanupOther()
	imported, err := other.ImportConfigsArchive(ctx, archive, false)
	if err != nil {
		t.Fatalf("ImportConfigsArchive: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected summary from import")
	}
	list, err := other.ListConfigs(ctx, &api.ResourceQueryRequest{BusinessKey: "biz-archive"})
	if err != nil {
		t.Fatalf("ListConfigs: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected imported config")
	}
	if !strings.Contains(list[0].GetContent(), asset.GetFileId()) {
		t.Fatalf("imported config missing asset reference")
	}
}

func TestGetRealtimeStaticConfig(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	_, err := svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "system",
		Alias:       "business_select",
		Name:        "默认业务",
		Type:        "text",
		Content:     "biz-realtime",
	}})
	if err != nil {
		t.Fatalf("seed business_select: %v", err)
	}
	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "system",
		Alias:       "system_keys",
		Name:        "系统选项",
		Type:        "config",
		Content:     `{"biz-realtime":"实时业务"}`,
	}})
	if err != nil {
		t.Fatalf("seed system_keys: %v", err)
	}
	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "biz-realtime",
		Alias:       "greeting",
		Name:        "问候语",
		Type:        "text",
		Content:     "hello",
	}})
	if err != nil {
		t.Fatalf("seed business config: %v", err)
	}

	payload, err := svc.GetRealtimeStaticConfig(ctx)
	if err != nil {
		t.Fatalf("GetRealtimeStaticConfig: %v", err)
	}

	selectKey, _ := payload["business_select"].(string)
	if selectKey != "biz-realtime" {
		t.Fatalf("unexpected business_select %q", selectKey)
	}

	bizKeys, ok := payload["business_keys"].([]string)
	if !ok {
		t.Fatalf("business_keys not []string: %T", payload["business_keys"])
	}
	if len(bizKeys) != 2 {
		t.Fatalf("expected 2 business keys, got %d", len(bizKeys))
	}

	systemData, ok := payload["system"].(map[string]any)
	if !ok {
		t.Fatalf("system data missing or wrong type")
	}
	if _, ok := systemData["business_select"]; !ok {
		t.Fatalf("system payload missing business_select entry")
	}

	bizData, ok := payload["biz-realtime"].(map[string]any)
	if !ok {
		t.Fatalf("biz payload missing")
	}
	entry, ok := bizData["greeting"].(map[string]any)
	if !ok {
		t.Fatalf("greeting entry missing")
	}
	if entry["content"] != "hello" {
		t.Fatalf("unexpected greeting content %v", entry["content"])
	}
}

func TestExportSystemSelectedStaticBundle(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	// Seed system configs
	_, err := svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "system",
		Alias:       "business_select",
		Name:        "默认业务",
		Type:        "text",
		Content:     "biz-main",
	}})
	if err != nil {
		t.Fatalf("seed business_select: %v", err)
	}

	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "system",
		Alias:       "system_copy",
		Name:        "系统文案",
		Type:        "text",
		Content:     "hello-system",
	}})
	if err != nil {
		t.Fatalf("seed system config: %v", err)
	}

	// Seed selected business configs
	_, err = svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
		BusinessKey: "biz-main",
		Alias:       "welcome",
		Name:        "欢迎语",
		Type:        "text",
		Content:     "hello",
	}})
	if err != nil {
		t.Fatalf("seed business config: %v", err)
	}

	bundle, name, err := svc.ExportSystemSelectedStaticBundle(ctx)
	if err != nil {
		t.Fatalf("ExportSystemSelectedStaticBundle: %v", err)
	}
	if len(bundle) == 0 {
		t.Fatalf("expected bundle data")
	}
	if name == "" {
		t.Fatalf("expected bundle name")
	}

	payload := readStaticConfig(t, bundle)
	systemData := getStaticSection(t, payload, "system")
	entry := getStaticEntry(t, systemData, "business_select")
	if content := entry["content"]; content != "biz-main" {
		t.Fatalf("unexpected business_select content %v", content)
	}

	bizData := getStaticSection(t, payload, "biz-main")
	if _, ok := bizData["welcome"]; !ok {
		t.Fatalf("expected welcome entry for biz-main")
	}
}

func TestExportStaticBundleAll(t *testing.T) {
	ctx := context.Background()
	svc, cleanup := newTestService(t)
	defer cleanup()

	seed := []struct {
		business string
		alias    string
		content  string
	}{
		{"system", "business_select", "biz-a"},
		{"system", "system_copy", "hello"},
		{"biz-a", "alpha", "A"},
		{"biz-b", "beta", "B"},
	}
	for _, item := range seed {
		_, err := svc.AddConfig(ctx, &api.CreateOrUpdateConfigRequest{Config: &api.ResourceConfig{
			BusinessKey: item.business,
			Alias:       item.alias,
			Name:        item.alias,
			Type:        "text",
			Content:     item.content,
		}})
		if err != nil {
			t.Fatalf("seed config (%s/%s): %v", item.business, item.alias, err)
		}
	}

	bundle, name, err := svc.ExportStaticBundleAll(ctx)
	if err != nil {
		t.Fatalf("ExportStaticBundleAll: %v", err)
	}
	if len(bundle) == 0 {
		t.Fatalf("expected bundle data")
	}
	if name == "" {
		t.Fatalf("expected bundle name")
	}

	payload := readStaticConfig(t, bundle)
	for _, key := range []string{"system", "biz-a", "biz-b"} {
		if _, ok := payload[key]; !ok {
			t.Fatalf("expected section %s in payload", key)
		}
	}
}

func readStaticConfig(t *testing.T, data []byte) map[string]any {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip.NewReader: %v", err)
	}
	var payload map[string]any
	for _, f := range reader.File {
		if filepath.Clean(f.Name) != "static/config.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open static config: %v", err)
		}
		bytesData, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("read static config: %v", err)
		}
		if err := json.Unmarshal(bytesData, &payload); err != nil {
			t.Fatalf("unmarshal static config: %v", err)
		}
		break
	}
	if payload == nil {
		t.Fatalf("static config not found in bundle")
	}
	return payload
}

func getStaticSection(t *testing.T, payload map[string]any, section string) map[string]any {
	t.Helper()
	raw, ok := payload[section]
	if !ok {
		t.Fatalf("section %s missing", section)
	}
	m, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("section %s is not an object", section)
	}
	return m
}

func getStaticEntry(t *testing.T, section map[string]any, alias string) map[string]any {
	t.Helper()
	raw, ok := section[alias]
	if !ok {
		t.Fatalf("entry %s missing", alias)
	}
	m, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("entry %s is not an object", alias)
	}
	return m
}
