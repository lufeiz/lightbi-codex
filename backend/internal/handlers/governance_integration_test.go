package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/router"
	"lightbi/backend/internal/services"
)

func TestGovernancePublishShareAndPermissionFlow(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	viewerResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.viewer, map[string]any{
		"name":      "viewer chart",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(validChartConfig()),
	})
	if viewerResp.Code != http.StatusForbidden {
		t.Fatalf("expected viewer create to be forbidden, got %d", viewerResp.Code)
	}

	createResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "销售总览",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(validChartConfig()),
	})
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create chart status = %d, body = %s", createResp.Code, createResp.Body.String())
	}
	chartID := responseID(t, createResp.Body.Bytes())

	publishResp := requestJSON(engine, http.MethodPost, "/api/charts/"+strconv.Itoa(chartID)+"/publish", tokens.editor, nil)
	if publishResp.Code != http.StatusOK {
		t.Fatalf("publish chart status = %d, body = %s", publishResp.Code, publishResp.Body.String())
	}
	var versionCount int64
	if err := db.Model(&models.ChartVersion{}).Where("chart_id = ?", chartID).Count(&versionCount).Error; err != nil || versionCount != 1 {
		t.Fatalf("expected one chart version, count=%d err=%v", versionCount, err)
	}
	var auditCount int64
	if err := db.Model(&models.AuditLog{}).Where("object_type = ? AND object_id = ? AND action = ?", "chart", chartID, "chart.publish").Count(&auditCount).Error; err != nil || auditCount != 1 {
		t.Fatalf("expected publish audit log, count=%d err=%v", auditCount, err)
	}

	shareResp := requestJSON(engine, http.MethodPost, "/api/charts/"+strconv.Itoa(chartID)+"/share-links", tokens.editor, map[string]any{
		"name":       "公开链接",
		"enabled":    true,
		"allowEmbed": true,
	})
	if shareResp.Code != http.StatusCreated {
		t.Fatalf("create share link status = %d, body = %s", shareResp.Code, shareResp.Body.String())
	}
	token := responseString(t, shareResp.Body.Bytes(), "token")
	if token == "" {
		t.Fatal("expected share token to be returned once")
	}
	if publicResp := requestJSON(engine, http.MethodGet, "/api/public/shares/"+token, "", nil); publicResp.Code != http.StatusOK {
		t.Fatalf("public share status = %d, body = %s", publicResp.Code, publicResp.Body.String())
	} else {
		body := publicResp.Body.String()
		if strings.Contains(body, `"creator"`) || strings.Contains(body, `"email"`) || !strings.Contains(body, `"runtimeStatus"`) {
			t.Fatalf("public share DTO leaked internal fields or missed runtimeStatus: %s", body)
		}
	}
	if embedResp := requestJSON(engine, http.MethodGet, "/api/public/embeds/"+token, "", nil); embedResp.Code != http.StatusOK {
		t.Fatalf("public embed status = %d, body = %s", embedResp.Code, embedResp.Body.String())
	}
}

func TestRequestIDHeaderIsReturned(t *testing.T) {
	engine, _, _ := setupGovernanceRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("X-Request-ID", "trace-test-123")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("health status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("X-Request-ID"); got != "trace-test-123" {
		t.Fatalf("expected incoming request id to be returned, got %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if got := rec.Header().Get("X-Request-ID"); got == "" {
		t.Fatal("expected generated request id header")
	}
}

func TestPublishWithPayloadSnapshotsCurrentConfig(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	createResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "发布事务",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(validChartConfigWithTitle("旧标题")),
	})
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create chart status = %d, body = %s", createResp.Code, createResp.Body.String())
	}
	chartID := responseID(t, createResp.Body.Bytes())

	publishResp := requestJSON(engine, http.MethodPost, "/api/charts/"+strconv.Itoa(chartID)+"/publish", tokens.editor, map[string]any{
		"name":      "发布事务",
		"type":      "line",
		"projectId": 1,
		"status":    "published",
		"config":    json.RawMessage(validChartConfigWithTitle("实时收入")),
	})
	if publishResp.Code != http.StatusOK {
		t.Fatalf("publish with payload status = %d, body = %s", publishResp.Code, publishResp.Body.String())
	}

	var version models.ChartVersion
	if err := db.Where("chart_id = ?", chartID).Order("version DESC").First(&version).Error; err != nil {
		t.Fatalf("read chart version: %v", err)
	}
	if !strings.Contains(string(version.Config), "实时收入") {
		t.Fatalf("expected latest version to snapshot publish payload, got %s", string(version.Config))
	}
}

func TestProjectObjectAccessIsScoped(t *testing.T) {
	engine, _, tokens := setupGovernanceRouter(t)

	resp := requestJSON(engine, http.MethodGet, "/api/charts/99", tokens.viewer, nil)
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected cross-project read to be forbidden, got %d body=%s", resp.Code, resp.Body.String())
	}
}

func TestChartGroupAndTagReferencesAreProjectScoped(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	foreignGroup := models.ChartGroup{
		WorkspaceID: 1,
		ProjectID:   2,
		OwnerID:     1,
		Name:        "隔离目录",
		CreatedBy:   1,
		UpdatedBy:   1,
	}
	if err := db.Create(&foreignGroup).Error; err != nil {
		t.Fatalf("create foreign group: %v", err)
	}
	foreignTag := models.ChartTag{
		WorkspaceID: 1,
		ProjectID:   2,
		OwnerID:     1,
		Name:        "隔离标签",
		Color:       "#1677ff",
		CreatedBy:   1,
		UpdatedBy:   1,
	}
	if err := db.Create(&foreignTag).Error; err != nil {
		t.Fatalf("create foreign tag: %v", err)
	}

	groupResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "跨项目目录",
		"type":      "line",
		"projectId": 1,
		"groupId":   foreignGroup.ID,
		"config":    json.RawMessage(validChartConfig()),
	})
	if groupResp.Code != http.StatusBadRequest {
		t.Fatalf("expected cross-project group to be rejected, got %d body=%s", groupResp.Code, groupResp.Body.String())
	}

	tagResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "跨项目标签",
		"type":      "line",
		"projectId": 1,
		"tagIds":    []uint{foreignTag.ID},
		"config":    json.RawMessage(validChartConfig()),
	})
	if tagResp.Code != http.StatusBadRequest {
		t.Fatalf("expected cross-project tag to be rejected, got %d body=%s", tagResp.Code, tagResp.Body.String())
	}
}

func TestChartDatasetReferencesAreProjectScoped(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	foreignDataset := models.Dataset{
		WorkspaceID:  1,
		ProjectID:    2,
		OwnerID:      1,
		Name:         "隔离数据集",
		Type:         models.DatasetTypeStandard,
		SourceName:   "Mock",
		QueryTimeout: 10,
		RowLimit:     500,
		Dimensions:   datatypes.JSON([]byte(`[{"name":"month","label":"月份","type":"string"}]`)),
		Measures:     datatypes.JSON([]byte(`[{"name":"revenue","label":"收入","type":"number"}]`)),
		Rows:         datatypes.JSON([]byte(`[{"month":"2026-06","revenue":120}]`)),
	}
	if err := db.Create(&foreignDataset).Error; err != nil {
		t.Fatalf("create foreign dataset: %v", err)
	}

	resp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "跨项目数据集",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(validChartConfigWithDataset(foreignDataset.ID)),
	})
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected cross-project dataset to be rejected, got %d body=%s", resp.Code, resp.Body.String())
	}
}

func TestChartDatasetFieldReferencesMustExist(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	dataset := models.Dataset{
		WorkspaceID:  1,
		ProjectID:    1,
		OwnerID:      1,
		Name:         "字段校验数据集",
		Type:         models.DatasetTypeStandard,
		SourceName:   "Mock",
		QueryTimeout: 10,
		RowLimit:     500,
		Dimensions:   datatypes.JSON([]byte(`[{"name":"month","label":"月份","type":"string"}]`)),
		Measures:     datatypes.JSON([]byte(`[{"name":"revenue","label":"收入","type":"number"}]`)),
		Rows:         datatypes.JSON([]byte(`[{"month":"2026-06","revenue":120}]`)),
	}
	if err := db.Create(&dataset).Error; err != nil {
		t.Fatalf("create dataset: %v", err)
	}

	resp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "字段不存在",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(chartConfigWithDatasetFields(dataset.ID, []string{"month"}, []string{"missing_revenue"})),
	})
	if resp.Code != http.StatusBadRequest || !strings.Contains(resp.Body.String(), "missing_revenue") {
		t.Fatalf("expected missing field to be rejected with reason, got %d body=%s", resp.Code, resp.Body.String())
	}
}

func TestDraftDatasetPreviewDoesNotPersistDataset(t *testing.T) {
	engine, db, tokens := setupGovernanceRouter(t)

	resp := requestJSON(engine, http.MethodPost, "/api/datasets/preview", tokens.editor, map[string]any{
		"dataset": map[string]any{
			"projectId":  1,
			"name":       "草稿预览",
			"type":       "standard",
			"sourceName": "draft",
			"dimensions": []map[string]any{{"name": "region", "label": "区域", "type": "string"}},
			"measures":   []map[string]any{{"name": "revenue", "label": "收入", "type": "number"}},
			"rowLimit":   20,
		},
		"query": map[string]any{
			"dimensions": []string{"region"},
			"metrics":    []map[string]any{{"field": "revenue", "aggregation": "sum", "alias": "revenue"}},
			"limit":      20,
		},
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("draft preview status = %d body=%s", resp.Code, resp.Body.String())
	}
	var count int64
	if err := db.Model(&models.Dataset{}).Where("name = ?", "草稿预览").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("draft preview should not persist dataset, count=%d err=%v", count, err)
	}
}

func TestProjectPermissionMatrix(t *testing.T) {
	engine, _, tokens := setupGovernanceRouter(t)

	createResp := requestJSON(engine, http.MethodPost, "/api/charts", tokens.editor, map[string]any{
		"name":      "权限矩阵",
		"type":      "line",
		"projectId": 1,
		"config":    json.RawMessage(validChartConfig()),
	})
	if createResp.Code != http.StatusCreated {
		t.Fatalf("editor create chart status = %d body=%s", createResp.Code, createResp.Body.String())
	}
	chartID := responseID(t, createResp.Body.Bytes())

	viewerDenied := []struct {
		name    string
		method  string
		path    string
		payload any
	}{
		{
			name:   "create chart",
			method: http.MethodPost,
			path:   "/api/charts",
			payload: map[string]any{
				"name":      "viewer chart",
				"type":      "line",
				"projectId": 1,
				"config":    json.RawMessage(validChartConfig()),
			},
		},
		{
			name:   "update chart",
			method: http.MethodPut,
			path:   "/api/charts/" + strconv.Itoa(chartID),
			payload: map[string]any{
				"name":   "viewer update",
				"type":   "line",
				"config": json.RawMessage(validChartConfig()),
			},
		},
		{name: "delete chart", method: http.MethodDelete, path: "/api/charts/" + strconv.Itoa(chartID)},
		{name: "publish chart", method: http.MethodPost, path: "/api/charts/" + strconv.Itoa(chartID) + "/publish"},
		{name: "create group", method: http.MethodPost, path: "/api/chart-groups", payload: map[string]any{"name": "viewer group", "projectId": 1}},
		{name: "create tag", method: http.MethodPost, path: "/api/chart-tags", payload: map[string]any{"name": "viewer tag", "projectId": 1, "color": "#1677ff"}},
		{
			name:    "create data source",
			method:  http.MethodPost,
			path:    "/api/data-sources",
			payload: map[string]any{"projectId": 1, "name": "viewer ds", "type": "mysql", "host": "127.0.0.1", "port": 3306, "databaseName": "bi", "username": "readonly", "password": "secret"},
		},
		{
			name:    "create dataset",
			method:  http.MethodPost,
			path:    "/api/datasets",
			payload: map[string]any{"projectId": 1, "name": "viewer dataset", "type": "standard", "sourceName": "mock", "dimensions": []any{}, "measures": []any{}, "rows": []any{}},
		},
	}

	for _, item := range viewerDenied {
		resp := requestJSON(engine, item.method, item.path, tokens.viewer, item.payload)
		if resp.Code != http.StatusForbidden {
			t.Fatalf("%s: expected viewer forbidden, got %d body=%s", item.name, resp.Code, resp.Body.String())
		}
	}

	if resp := requestJSON(engine, http.MethodGet, "/api/charts/"+strconv.Itoa(chartID), tokens.viewer, nil); resp.Code != http.StatusOK {
		t.Fatalf("expected viewer read to be allowed, got %d body=%s", resp.Code, resp.Body.String())
	}
}

type governanceTokens struct {
	admin  string
	editor string
	viewer string
}

func setupGovernanceRouter(t *testing.T) (*gin.Engine, *gorm.DB, governanceTokens) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.Project{},
		&models.ProjectMember{},
		&models.RefreshToken{},
		&models.DataSource{},
		&models.Dataset{},
		&models.DatasetQueryCache{},
		&models.DatasetQueryLog{},
		&models.ChartGroup{},
		&models.ChartTag{},
		&models.Chart{},
		&models.ChartVersion{},
		&models.AuditLog{},
		&models.DashboardShareLink{},
		&models.DashboardSubscription{},
		&models.SchemaMigration{},
	); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	admin := createTestUser(t, db, "admin", models.RoleAdmin)
	editor := createTestUser(t, db, "editor", models.RoleEditor)
	viewer := createTestUser(t, db, "viewer", models.RoleViewer)
	workspace := models.Workspace{ID: 1, Name: "默认工作空间", CreatedBy: admin.ID, UpdatedBy: admin.ID}
	project := models.Project{ID: 1, WorkspaceID: 1, Name: "默认项目", OwnerID: admin.ID, CreatedBy: admin.ID, UpdatedBy: admin.ID}
	otherProject := models.Project{ID: 2, WorkspaceID: 1, Name: "隔离项目", OwnerID: admin.ID, CreatedBy: admin.ID, UpdatedBy: admin.ID}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&otherProject).Error; err != nil {
		t.Fatalf("create other project: %v", err)
	}
	for _, member := range []models.ProjectMember{
		{ProjectID: project.ID, UserID: admin.ID, Role: models.WorkspaceRoleOwner, CreatedBy: admin.ID, UpdatedBy: admin.ID},
		{ProjectID: project.ID, UserID: editor.ID, Role: models.WorkspaceRoleEditor, CreatedBy: admin.ID, UpdatedBy: admin.ID},
		{ProjectID: project.ID, UserID: viewer.ID, Role: models.WorkspaceRoleViewer, CreatedBy: admin.ID, UpdatedBy: admin.ID},
	} {
		if err := db.Create(&member).Error; err != nil {
			t.Fatalf("create project member: %v", err)
		}
	}
	crossProjectChart := models.Chart{ID: 99, WorkspaceID: workspace.ID, ProjectID: otherProject.ID, OwnerID: admin.ID, Name: "隔离", Type: models.ChartTypeLine, Status: models.ChartStatusPublished, Config: datatypes.JSON(validChartConfig()), CreatedBy: admin.ID, UpdatedBy: admin.ID}
	if err := db.Create(&crossProjectChart).Error; err != nil {
		t.Fatalf("create cross project chart: %v", err)
	}

	cfg := config.Config{
		AppEnv:             "test",
		JWTAccessSecret:    "test-access-secret",
		JWTRefreshSecret:   "test-refresh-secret",
		AccessTTL:          time.Hour,
		RefreshTTL:         time.Hour,
		CORSOrigins:        []string{"http://localhost:3000"},
		DataSourceKey:      "test-data-source-key",
		RegisterMode:       "disabled",
		QueryMaxConcurrent: 8,
	}
	jwt := services.NewJWTService(cfg)
	adminToken, _ := jwt.GenerateAccessToken(admin)
	editorToken, _ := jwt.GenerateAccessToken(editor)
	viewerToken, _ := jwt.GenerateAccessToken(viewer)
	return router.Setup(cfg, db), db, governanceTokens{admin: adminToken, editor: editorToken, viewer: viewerToken}
}

func createTestUser(t *testing.T, db *gorm.DB, username string, role models.UserRole) models.User {
	t.Helper()
	hash, err := services.HashPassword("LightBI@123456")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	user := models.User{Username: username, DisplayName: username, PasswordHash: hash, Role: role, Status: models.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func requestJSON(engine *gin.Engine, method string, path string, token string, payload any) *httptest.ResponseRecorder {
	var body *bytes.Reader
	if payload != nil {
		raw, _ := json.Marshal(payload)
		body = bytes.NewReader(raw)
	} else {
		body = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func validChartConfig() []byte {
	return validChartConfigWithTitle("收入")
}

func validChartConfigWithTitle(title string) []byte {
	raw, _ := json.Marshal(map[string]any{
		"version": 2,
		"widgets": []map[string]any{{
			"id":     "w1",
			"type":   "metricCard",
			"x":      0,
			"y":      0,
			"width":  320,
			"height": 180,
			"config": map[string]any{
				"title":         title,
				"dimensions":    []string{"month"},
				"measures":      []string{"revenue"},
				"showLabel":     true,
				"showTooltip":   true,
				"showScrollbar": false,
			},
		}},
	})
	return raw
}

func validChartConfigWithDataset(datasetID uint) []byte {
	return chartConfigWithDatasetFields(datasetID, []string{"month"}, []string{"revenue"})
}

func chartConfigWithDatasetFields(datasetID uint, dimensions []string, measures []string) []byte {
	raw, _ := json.Marshal(map[string]any{
		"version": 2,
		"widgets": []map[string]any{{
			"id":     "w1",
			"type":   "metricCard",
			"x":      0,
			"y":      0,
			"width":  320,
			"height": 180,
			"config": map[string]any{
				"title":         "收入",
				"datasetId":     datasetID,
				"dimensions":    dimensions,
				"measures":      measures,
				"showLabel":     true,
				"showTooltip":   true,
				"showScrollbar": false,
			},
		}},
	})
	return raw
}

func responseID(t *testing.T, raw []byte) int {
	t.Helper()
	var parsed struct {
		Data struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("parse response id: %v", err)
	}
	return parsed.Data.ID
}

func responseString(t *testing.T, raw []byte, key string) string {
	t.Helper()
	var parsed struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("parse response string: %v", err)
	}
	value, _ := parsed.Data[key].(string)
	return value
}
