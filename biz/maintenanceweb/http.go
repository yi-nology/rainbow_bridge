package maintenanceweb

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/yi-nology/rainbow_bridge/biz/service"
	"io"
	"strconv"
	"strings"
	"time"
)

type HTTP struct {
	Store *Store
	Auth  *service.Service
}

func writeError(c *app.RequestContext, e error) {
	var h *HTTPError
	if errors.As(e, &h) {
		data := map[string]any{}
		if h.CurrentRevision != "" {
			data["current_revision"] = h.CurrentRevision
		}
		c.JSON(h.Status, map[string]any{"code": h.Status, "msg": h.Message, "error_type": h.Code, "data": data})
		return
	}
	if a, ok := service.AsAuthError(e); ok {
		c.JSON(a.HTTPStatus, map[string]any{"code": a.Code, "msg": a.Message, "error_type": a.ErrorType})
		return
	}
	c.JSON(503, map[string]any{"code": 503, "msg": "控制服务暂不可用，请保留原请求编号稍后查询", "error_type": "CONTROL_UNAVAILABLE"})
}
func decode(c *app.RequestContext, action string) (Request, error) {
	var r Request
	if !strings.HasPrefix(strings.ToLower(string(c.Request.Header.ContentType())), "application/json") {
		return r, failure(415, "INVALID_REQUEST", "请使用JSON请求")
	}
	if len(c.Request.Body()) > 8192 {
		return r, failure(413, "INVALID_REQUEST", "请求内容过长")
	}
	allowed := map[string]string{"plan": "request_id kind backup_id expected_sha256", "backup": "request_id preview_id plan_fingerprint confirmation reason", "restore": "request_id preview_id plan_fingerprint backup_id manifest_sha256 confirmation reason", "verify": "request_id expected_sha256", "resume": "request_id expected_revision confirmation", "abort": "request_id expected_revision confirmation", "cancel": "request_id expected_revision"}
	var fields map[string]json.RawMessage
	if json.Unmarshal(c.Request.Body(), &fields) != nil {
		return r, failure(400, "INVALID_REQUEST", "请求格式不正确")
	}
	for key := range fields {
		if !contains(strings.Fields(allowed[action]), key) {
			return r, failure(400, "INVALID_REQUEST", "请求包含不支持的字段")
		}
	}
	d := json.NewDecoder(bytes.NewReader(c.Request.Body()))
	d.DisallowUnknownFields()
	if d.Decode(&r) != nil {
		return r, failure(400, "INVALID_REQUEST", "请求格式不正确")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return r, failure(400, "INVALID_REQUEST", "请求格式不正确")
	}
	return r, nil
}
func (h *HTTP) Serve(action string) app.HandlerFunc {
	return func(ctx context.Context, c *app.RequestContext) {
		ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		c.Header("Cache-Control", "no-store")
		write := string(c.Method()) != "GET"
		origin := string(c.GetHeader("Origin"))
		if h.Auth.AuthenticationEnabled() && write && (origin == "" || !h.Auth.OriginAllowed(origin)) {
			writeError(c, failure(403, "AUTH_ORIGIN_DENIED", "请求来源不受信任"))
			return
		}
		identity, e := h.Auth.AdminIdentityForRequest(ctx, service.AuthRequestInput{SessionToken: string(c.Cookie(h.Auth.AuthSettings().CookieName)), CSRFToken: string(c.GetHeader("X-CSRF-Token")), Origin: origin, HasOrigin: origin != ""}, write)
		resultOnly := false
		if h.Auth.AuthenticationEnabled() && e != nil && action == "task" {
			if a, ok := service.AsAuthError(e); ok && a.HTTPStatus == 401 {
				t, te := h.Store.task(ctx, c.Param("task_id"), false)
				if te == nil && t.OperationID != nil && h.Store.resultAccess(ctx, c, *t.OperationID) {
					resultOnly = true
					e = nil
				}
			}
		}
		if e != nil {
			writeError(c, e)
			return
		}
		var data any
		status := 200
		switch action {
		case "discovery":
			data = map[string]any{"mode": "maintenance_web", "supported": true, "maintenance_api_prefix": "/api/v1/maintenance", "contract_version": 1}
		case "capabilities":
			data = h.Store.Capabilities(ctx)
		case "preview":
			data, e = h.Store.Preview(ctx, c.Param("preview_id"))
		case "tasks", "backups":
			limit := 20
			if c.Query("limit") != "" {
				limit, e = strconv.Atoi(c.Query("limit"))
				if e != nil || limit < 1 || limit > 100 {
					writeError(c, failure(400, "INVALID_REQUEST", "每页数量必须为1至100"))
					return
				}
			}
			if action == "tasks" {
				data, e = h.Store.ListTasks(ctx, limit, c.Query("cursor"))
			} else {
				data, e = h.Store.ListBackups(ctx, limit, c.Query("cursor"))
			}
		case "task", "by_request":
			id := c.Param("task_id")
			if action == "by_request" {
				id = c.Param("request_id")
			}
			var t Task
			var op *Operation
			t, op, e = h.Store.Task(ctx, id, action == "by_request")
			if e == nil {
				if resultOnly {
					t.AllowedActions = []string{}
					if op != nil {
						op.AllowedActions = []string{}
					}
				} else if h.Auth.AuthenticationEnabled() && t.OperationID != nil {
					e = h.Store.issueResult(ctx, c, h.Auth, identity, *t.OperationID)
				}
				data = map[string]any{"task": t, "operation": op}
			}
		default:
			r, err := decode(c, action)
			if err != nil {
				writeError(c, err)
				return
			}
			var task Task
			if action == "cancel" {
				task, e = h.Store.Cancel(ctx, c.Param("task_id"), r, identity)
			} else {
				target := ""
				if action == "verify" {
					target = c.Param("backup_id")
				}
				if action == "resume" || action == "abort" {
					target = c.Param("operation_id")
				}
				task, e = h.Store.Accept(ctx, action, target, r, identity)
			}
			status = 202
			data = map[string]any{"task": task}
		}
		if e != nil {
			writeError(c, e)
			return
		}
		msg := "OK"
		if status == 202 {
			msg = "ACCEPTED"
		}
		c.JSON(status, map[string]any{"code": status, "msg": msg, "data": data})
	}
}
