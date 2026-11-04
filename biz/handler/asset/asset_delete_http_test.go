package asset_test

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	"github.com/glebarez/sqlite"
	"github.com/yi-nology/rainbow_bridge/biz/dal/model"
	assethandler "github.com/yi-nology/rainbow_bridge/biz/handler/asset"
	envpb "github.com/yi-nology/rainbow_bridge/biz/model/environment"
	assetrouter "github.com/yi-nology/rainbow_bridge/biz/router/asset"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestAssetDeleteHTTPContract(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "asset-http.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	defer conn.Close()
	if err = db.AutoMigrate(&model.Environment{}, &model.Pipeline{}, &model.Config{}, &model.Asset{}, &model.ConfigWriteGate{}, &model.ConfigFreezeState{}, &model.ConfigFreezeEvent{}, &model.ConfigReleaseVersion{}); err != nil {
		t.Fatal(err)
	}
	s := service.NewService(db, nil, "", nil)
	ctx := service.WithAdminIdentity(context.Background(), service.AdminIdentity{UserID: 1, Username: "admin", Role: "admin"})
	if err = s.EnsureFreezeBootstrap(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.AddEnvironment(ctx, &envpb.Environment{EnvironmentKey: "qa", EnvironmentName: "qa", IsActive: true}); err != nil {
		t.Fatal(err)
	}
	pl, err := s.GetPipeline(ctx, "qa", "default")
	if err != nil {
		t.Fatal(err)
	}
	a := &model.Asset{FileID: "qa-delete-http", ScopeID: pl.ScopeId, EnvironmentKey: "qa", PipelineKey: "default", FileName: "qa.png"}
	if err = db.Create(a).Error; err != nil {
		t.Fatal(err)
	}
	assethandler.SetService(s)
	h := server.New()
	h.Use(func(_ context.Context, c *app.RequestContext) { c.Next(ctx) })
	assetrouter.Register(h)
	body := `{"file_id":"qa-delete-http","environment_key":"qa","pipeline_key":"default","expected_scope_id":"` + pl.ScopeId + `"}`
	for _, already := range []bool{false, true} {
		r := ut.PerformRequest(h.Engine, "POST", "/api/v1/asset/delete", &ut.Body{Body: strings.NewReader(body), Len: len(body)}, ut.Header{Key: "Content-Type", Value: "application/json"})
		var data struct {
			Code int            `json:"code"`
			Data map[string]any `json:"data"`
		}
		if json.Unmarshal(r.Body.Bytes(), &data) != nil || r.Code != 200 || data.Code != 200 || data.Data["deleted"] != true || data.Data["already_deleted"] != already {
			t.Fatalf("delete: %d %s", r.Code, r.Body.String())
		}
	}
	r := ut.PerformRequest(h.Engine, "GET", "/api/v1/asset/file/qa-delete-http/qa.png", nil)
	if r.Code != 410 || !strings.Contains(r.Body.String(), "ASSET_DELETED") {
		t.Fatalf("file: %d %s", r.Code, r.Body.String())
	}
}
