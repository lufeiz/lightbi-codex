package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

type DashboardHandler struct {
	DB     *gorm.DB
	Config config.Config
}

type publishedDashboard struct {
	Chart       models.Chart                `json:"chart"`
	Version     *models.ChartVersion        `json:"version,omitempty"`
	ShareLink   *dashboardShareLinkDTO      `json:"shareLink,omitempty"`
	RuntimeRows map[string][]map[string]any `json:"runtimeRows"`
	Embed       bool                        `json:"embed"`
}

type chartVersionDTO struct {
	ID          uint             `json:"id"`
	ChartID     uint             `json:"chartId"`
	WorkspaceID uint             `json:"workspaceId"`
	ProjectID   uint             `json:"projectId"`
	Version     int              `json:"version"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Type        models.ChartType `json:"type"`
	Config      datatypes.JSON   `json:"config"`
	PublishedBy uint             `json:"publishedBy"`
	Publisher   *UserDTO         `json:"publisher,omitempty"`
	CreatedAt   time.Time        `json:"createdAt"`
}

type dashboardShareLinkRequest struct {
	Name       string     `json:"name"`
	Enabled    *bool      `json:"enabled"`
	AllowEmbed bool       `json:"allowEmbed"`
	ExpiresAt  *time.Time `json:"expiresAt"`
}

type dashboardShareLinkDTO struct {
	ID          uint       `json:"id"`
	ChartID     uint       `json:"chartId"`
	Name        string     `json:"name"`
	Token       string     `json:"token,omitempty"`
	TokenPrefix string     `json:"tokenPrefix"`
	Enabled     bool       `json:"enabled"`
	AllowEmbed  bool       `json:"allowEmbed"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type exportRequest struct {
	Format   models.ExportFormat `json:"format"`
	WidgetID string              `json:"widgetId"`
}

type exportResponse struct {
	Format    models.ExportFormat `json:"format"`
	Filename  string              `json:"filename"`
	MimeType  string              `json:"mimeType"`
	Content   string              `json:"content,omitempty"`
	RenderURL string              `json:"renderUrl,omitempty"`
	RowCount  int                 `json:"rowCount"`
}

type subscriptionRequest struct {
	Name      string                       `json:"name"`
	Format    models.SubscriptionFormat    `json:"format"`
	Frequency models.SubscriptionFrequency `json:"frequency"`
	Enabled   *bool                        `json:"enabled"`
	NextRunAt *time.Time                   `json:"nextRunAt"`
}

func (h DashboardHandler) Published(c *gin.Context) {
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dashboard not found")
		return
	}
	if !requireChartRead(c, h.DB, &chart) {
		return
	}
	if chart.Status != models.ChartStatusPublished {
		Fail(c, http.StatusNotFound, "dashboard is not published")
		return
	}
	version := latestChartVersion(h.DB, chart.ID)
	OK(c, publishedDashboard{Chart: chart, Version: version, RuntimeRows: h.runtimeRowsForChart(c, chart)})
}

func (h DashboardHandler) PublicShare(c *gin.Context) {
	h.publicDashboard(c, false)
}

func (h DashboardHandler) PublicEmbed(c *gin.Context) {
	h.publicDashboard(c, true)
}

func (h DashboardHandler) publicDashboard(c *gin.Context, embed bool) {
	link, ok := h.shareLinkByToken(c, c.Param("token"), embed)
	if !ok {
		return
	}
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&chart, link.ChartID).Error; err != nil || chart.Status != models.ChartStatusPublished {
		Fail(c, http.StatusNotFound, "dashboard not found")
		return
	}
	version := latestChartVersion(h.DB, chart.ID)
	dto := toShareLinkDTO(link, "")
	OK(c, publishedDashboard{Chart: chart, Version: version, ShareLink: &dto, RuntimeRows: h.runtimeRowsForChart(c, chart), Embed: embed})
}

func (h DashboardHandler) Versions(c *gin.Context) {
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var versions []models.ChartVersion
	if err := h.DB.Preload("Publisher").Where("chart_id = ?", chart.ID).Order("version DESC").Find(&versions).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list chart versions failed")
		return
	}
	out := make([]chartVersionDTO, 0, len(versions))
	for _, version := range versions {
		out = append(out, toChartVersionDTO(version))
	}
	OK(c, out)
}

func (h DashboardHandler) Version(c *gin.Context) {
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var version models.ChartVersion
	if err := h.DB.Preload("Publisher").Where("chart_id = ? AND id = ?", chart.ID, c.Param("versionId")).First(&version).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart version not found")
		return
	}
	OK(c, toChartVersionDTO(version))
}

func (h DashboardHandler) Rollback(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var req struct {
		VersionID uint `json:"versionId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.VersionID == 0 {
		Fail(c, http.StatusBadRequest, "versionId is required")
		return
	}
	var version models.ChartVersion
	if err := h.DB.Where("chart_id = ? AND id = ?", chart.ID, req.VersionID).First(&version).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart version not found")
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&chart).Updates(map[string]any{
			"name":        version.Name,
			"description": version.Description,
			"type":        version.Type,
			"config":      version.Config,
			"updated_by":  user.ID,
		}).Error; err != nil {
			return err
		}
		audit(tx, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.rollback", "chart", chart.ID, "回滚仪表盘版本", map[string]any{"versionId": version.ID, "version": version.Version})
		return nil
	})
	if err != nil {
		Fail(c, http.StatusInternalServerError, "rollback chart failed")
		return
	}
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, chart.ID)
	OK(c, chart)
}

func (h DashboardHandler) AuditLogs(c *gin.Context) {
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var logs []models.AuditLog
	if err := h.DB.Preload("Actor").Where("object_type = ? AND object_id = ?", "chart", chart.ID).Order("created_at DESC").Limit(200).Find(&logs).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list audit logs failed")
		return
	}
	OK(c, logs)
}

func (h DashboardHandler) ListShareLinks(c *gin.Context) {
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var links []models.DashboardShareLink
	if err := h.DB.Where("chart_id = ?", chart.ID).Order("updated_at DESC").Find(&links).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list share links failed")
		return
	}
	out := make([]dashboardShareLinkDTO, 0, len(links))
	for _, link := range links {
		out = append(out, toShareLinkDTO(link, ""))
	}
	OK(c, out)
}

func (h DashboardHandler) CreateShareLink(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	if chart.Status != models.ChartStatusPublished {
		Fail(c, http.StatusBadRequest, "dashboard must be published before sharing")
		return
	}
	var req dashboardShareLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid share link payload")
		return
	}
	if req.Name == "" {
		req.Name = "分享链接"
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	token, err := newShareToken()
	if err != nil {
		Fail(c, http.StatusInternalServerError, "create share token failed")
		return
	}
	link := models.DashboardShareLink{
		ChartID:     chart.ID,
		WorkspaceID: chart.WorkspaceID,
		ProjectID:   chart.ProjectID,
		Name:        req.Name,
		TokenHash:   hashToken(token),
		TokenPrefix: tokenPrefix(token),
		Enabled:     enabled,
		AllowEmbed:  req.AllowEmbed,
		ExpiresAt:   req.ExpiresAt,
		CreatedBy:   user.ID,
		UpdatedBy:   user.ID,
	}
	if err := h.DB.Create(&link).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create share link failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.share.create", "chart", chart.ID, "创建分享链接", map[string]any{"shareLinkId": link.ID})
	Created(c, toShareLinkDTO(link, token))
}

func (h DashboardHandler) UpdateShareLink(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var link models.DashboardShareLink
	if err := h.DB.Where("chart_id = ? AND id = ?", chart.ID, c.Param("linkId")).First(&link).Error; err != nil {
		Fail(c, http.StatusNotFound, "share link not found")
		return
	}
	var req dashboardShareLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid share link payload")
		return
	}
	updates := map[string]any{"name": req.Name, "allow_embed": req.AllowEmbed, "expires_at": req.ExpiresAt, "updated_by": user.ID}
	if req.Name == "" {
		delete(updates, "name")
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if err := h.DB.Model(&link).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update share link failed")
		return
	}
	h.DB.First(&link, link.ID)
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.share.update", "chart", chart.ID, "更新分享链接", map[string]any{"shareLinkId": link.ID})
	OK(c, toShareLinkDTO(link, ""))
}

func (h DashboardHandler) DeleteShareLink(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var link models.DashboardShareLink
	if err := h.DB.Where("chart_id = ? AND id = ?", chart.ID, c.Param("linkId")).First(&link).Error; err != nil {
		Fail(c, http.StatusNotFound, "share link not found")
		return
	}
	if err := h.DB.Delete(&link).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete share link failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.share.delete", "chart", chart.ID, "删除分享链接", map[string]any{"shareLinkId": link.ID})
	OK(c, gin.H{"deleted": true})
}

func (h DashboardHandler) Export(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var req exportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid export payload")
		return
	}
	if req.Format == "" {
		req.Format = models.ExportFormatCSV
	}
	if !models.ValidExportFormat(req.Format) {
		Fail(c, http.StatusBadRequest, "invalid export format")
		return
	}
	response, err := h.exportChart(c, chart, req)
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.export", "chart", chart.ID, "导出仪表盘", map[string]any{"format": req.Format})
	OK(c, response)
}

func (h DashboardHandler) ListSubscriptions(c *gin.Context) {
	chart, ok := h.chartWithRead(c)
	if !ok {
		return
	}
	var subscriptions []models.DashboardSubscription
	if err := h.DB.Where("chart_id = ?", chart.ID).Order("updated_at DESC").Find(&subscriptions).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list subscriptions failed")
		return
	}
	OK(c, subscriptions)
}

func (h DashboardHandler) CreateSubscription(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var req subscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid subscription payload")
		return
	}
	subscription, valid := subscriptionFromRequest(c, req, chart, user.ID)
	if !valid {
		return
	}
	if err := h.DB.Create(&subscription).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create subscription failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.subscription.create", "chart", chart.ID, "创建订阅", map[string]any{"subscriptionId": subscription.ID})
	Created(c, subscription)
}

func (h DashboardHandler) UpdateSubscription(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var subscription models.DashboardSubscription
	if err := h.DB.Where("chart_id = ? AND id = ?", chart.ID, c.Param("subscriptionId")).First(&subscription).Error; err != nil {
		Fail(c, http.StatusNotFound, "subscription not found")
		return
	}
	var req subscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid subscription payload")
		return
	}
	next, valid := subscriptionFromRequest(c, req, chart, subscription.CreatedBy)
	if !valid {
		return
	}
	updates := map[string]any{
		"name":        next.Name,
		"format":      next.Format,
		"frequency":   next.Frequency,
		"enabled":     next.Enabled,
		"next_run_at": next.NextRunAt,
		"updated_by":  user.ID,
	}
	if err := h.DB.Model(&subscription).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update subscription failed")
		return
	}
	h.DB.First(&subscription, subscription.ID)
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.subscription.update", "chart", chart.ID, "更新订阅", map[string]any{"subscriptionId": subscription.ID})
	OK(c, subscription)
}

func (h DashboardHandler) DeleteSubscription(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	chart, ok := h.chartWithWrite(c)
	if !ok {
		return
	}
	var subscription models.DashboardSubscription
	if err := h.DB.Where("chart_id = ? AND id = ?", chart.ID, c.Param("subscriptionId")).First(&subscription).Error; err != nil {
		Fail(c, http.StatusNotFound, "subscription not found")
		return
	}
	if err := h.DB.Delete(&subscription).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete subscription failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.subscription.delete", "chart", chart.ID, "删除订阅", map[string]any{"subscriptionId": subscription.ID})
	OK(c, gin.H{"deleted": true})
}

func (h DashboardHandler) RunSubscription(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var subscription models.DashboardSubscription
	if err := h.DB.First(&subscription, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "subscription not found")
		return
	}
	if !canWriteProject(h.DB, user, subscription.ProjectID) {
		Fail(c, http.StatusForbidden, "subscription permission denied")
		return
	}
	var chart models.Chart
	if err := h.DB.First(&chart, subscription.ChartID).Error; err != nil {
		Fail(c, http.StatusNotFound, "dashboard not found")
		return
	}
	response, err := h.exportChart(c, chart, exportRequest{Format: models.ExportFormat(subscription.Format)})
	now := time.Now()
	status := "success"
	result := map[string]any{}
	if err != nil {
		status = "failed"
		result["error"] = err.Error()
	} else {
		result["filename"] = response.Filename
		result["format"] = response.Format
		result["rowCount"] = response.RowCount
		result["renderUrl"] = response.RenderURL
	}
	raw, _ := json.Marshal(result)
	nextRunAt := nextSubscriptionRun(subscription.Frequency, now)
	_ = h.DB.Model(&subscription).Updates(map[string]any{
		"last_run_at": &now,
		"last_status": status,
		"last_result": datatypes.JSON(raw),
		"next_run_at": nextRunAt,
		"updated_by":  user.ID,
	}).Error
	h.DB.First(&subscription, subscription.ID)
	audit(h.DB, user.ID, subscription.WorkspaceID, subscription.ProjectID, "chart.subscription.run", "chart", subscription.ChartID, "运行订阅", map[string]any{"subscriptionId": subscription.ID, "status": status})
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	OK(c, subscription)
}

func (h DashboardHandler) chartWithRead(c *gin.Context) (models.Chart, bool) {
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dashboard not found")
		return chart, false
	}
	if !requireChartRead(c, h.DB, &chart) {
		return chart, false
	}
	return chart, true
}

func (h DashboardHandler) chartWithWrite(c *gin.Context) (models.Chart, bool) {
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dashboard not found")
		return chart, false
	}
	if !requireChartWrite(c, h.DB, &chart) {
		return chart, false
	}
	return chart, true
}

func (h DashboardHandler) shareLinkByToken(c *gin.Context, token string, embed bool) (models.DashboardShareLink, bool) {
	var link models.DashboardShareLink
	if token == "" {
		Fail(c, http.StatusNotFound, "share link not found")
		return link, false
	}
	if err := h.DB.Where("token_hash = ? AND enabled = ?", hashToken(token), true).First(&link).Error; err != nil {
		Fail(c, http.StatusNotFound, "share link not found")
		return link, false
	}
	if link.ExpiresAt != nil && time.Now().After(*link.ExpiresAt) {
		Fail(c, http.StatusNotFound, "share link expired")
		return link, false
	}
	if embed && !link.AllowEmbed {
		Fail(c, http.StatusForbidden, "embed is disabled")
		return link, false
	}
	return link, true
}

func (h DashboardHandler) exportChart(c *gin.Context, chart models.Chart, req exportRequest) (exportResponse, error) {
	if req.Format == models.ExportFormatPNG {
		return exportResponse{
			Format:    models.ExportFormatPNG,
			Filename:  safeFilename(chart.Name) + ".png",
			MimeType:  "image/png",
			RenderURL: fmt.Sprintf("/dashboards/%d?export=png", chart.ID),
		}, nil
	}

	rows, columns, err := h.rowsForExport(c, chart, req.WidgetID)
	if err != nil {
		return exportResponse{}, err
	}
	var builder strings.Builder
	writer := csv.NewWriter(&builder)
	if len(columns) > 0 {
		_ = writer.Write(columns)
	}
	for _, row := range rows {
		record := make([]string, 0, len(columns))
		for _, column := range columns {
			record = append(record, fmt.Sprint(row[column]))
		}
		_ = writer.Write(record)
	}
	writer.Flush()
	return exportResponse{
		Format:   models.ExportFormatCSV,
		Filename: safeFilename(chart.Name) + ".csv",
		MimeType: "text/csv;charset=utf-8",
		Content:  builder.String(),
		RowCount: len(rows),
	}, nil
}

func (h DashboardHandler) rowsForExport(c *gin.Context, chart models.Chart, widgetID string) ([]map[string]any, []string, error) {
	var doc struct {
		Widgets []struct {
			ID     string `json:"id"`
			Config struct {
				DatasetID *uint                        `json:"datasetId"`
				Query     services.DatasetQueryRequest `json:"query"`
			} `json:"config"`
		} `json:"widgets"`
	}
	if err := json.Unmarshal(chart.Config, &doc); err != nil {
		return nil, nil, fmt.Errorf("invalid dashboard config")
	}
	for _, widget := range doc.Widgets {
		if widgetID != "" && widget.ID != widgetID {
			continue
		}
		if widget.Config.DatasetID == nil {
			continue
		}
		response, err := services.ExecuteDatasetQuery(c.Request.Context(), h.DB, h.Config, *widget.Config.DatasetID, widget.Config.Query)
		if err != nil {
			return nil, nil, err
		}
		columns := make([]string, 0, len(response.Columns))
		for _, column := range response.Columns {
			columns = append(columns, column.Name)
		}
		if len(columns) == 0 && len(response.Rows) > 0 {
			for column := range response.Rows[0] {
				columns = append(columns, column)
			}
		}
		return response.Rows, columns, nil
	}
	return nil, nil, fmt.Errorf("no queryable widget found")
}

func (h DashboardHandler) runtimeRowsForChart(c *gin.Context, chart models.Chart) map[string][]map[string]any {
	rows := map[string][]map[string]any{}
	var doc struct {
		Widgets []struct {
			ID     string `json:"id"`
			Config struct {
				DatasetID *uint                        `json:"datasetId"`
				Query     services.DatasetQueryRequest `json:"query"`
			} `json:"config"`
		} `json:"widgets"`
	}
	if err := json.Unmarshal(chart.Config, &doc); err != nil {
		return rows
	}
	for _, widget := range doc.Widgets {
		if widget.Config.DatasetID == nil {
			continue
		}
		response, err := services.ExecuteDatasetQuery(c.Request.Context(), h.DB, h.Config, *widget.Config.DatasetID, widget.Config.Query)
		if err != nil {
			continue
		}
		rows[widget.ID] = response.Rows
	}
	return rows
}

func snapshotChartVersion(db *gorm.DB, chart models.Chart, userID uint) (models.ChartVersion, error) {
	var maxVersion int
	_ = db.Model(&models.ChartVersion{}).Where("chart_id = ?", chart.ID).Select("COALESCE(MAX(version), 0)").Scan(&maxVersion).Error
	version := models.ChartVersion{
		ChartID:     chart.ID,
		WorkspaceID: chart.WorkspaceID,
		ProjectID:   chart.ProjectID,
		Version:     maxVersion + 1,
		Name:        chart.Name,
		Description: chart.Description,
		Type:        chart.Type,
		Config:      chart.Config,
		PublishedBy: userID,
	}
	return version, db.Create(&version).Error
}

func latestChartVersion(db *gorm.DB, chartID uint) *models.ChartVersion {
	var version models.ChartVersion
	if err := db.Preload("Publisher").Where("chart_id = ?", chartID).Order("version DESC").First(&version).Error; err != nil {
		return nil
	}
	return &version
}

func toChartVersionDTO(version models.ChartVersion) chartVersionDTO {
	var publisher *UserDTO
	if version.Publisher.ID != 0 {
		dto := ToUserDTO(version.Publisher)
		publisher = &dto
	}
	return chartVersionDTO{
		ID:          version.ID,
		ChartID:     version.ChartID,
		WorkspaceID: version.WorkspaceID,
		ProjectID:   version.ProjectID,
		Version:     version.Version,
		Name:        version.Name,
		Description: version.Description,
		Type:        version.Type,
		Config:      version.Config,
		PublishedBy: version.PublishedBy,
		Publisher:   publisher,
		CreatedAt:   version.CreatedAt,
	}
}

func toShareLinkDTO(link models.DashboardShareLink, token string) dashboardShareLinkDTO {
	return dashboardShareLinkDTO{
		ID:          link.ID,
		ChartID:     link.ChartID,
		Name:        link.Name,
		Token:       token,
		TokenPrefix: link.TokenPrefix,
		Enabled:     link.Enabled,
		AllowEmbed:  link.AllowEmbed,
		ExpiresAt:   link.ExpiresAt,
		CreatedAt:   link.CreatedAt,
		UpdatedAt:   link.UpdatedAt,
	}
}

func newShareToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func tokenPrefix(token string) string {
	if len(token) <= 10 {
		return token
	}
	return token[:10]
}

func subscriptionFromRequest(c *gin.Context, req subscriptionRequest, chart models.Chart, createdBy uint) (models.DashboardSubscription, bool) {
	if req.Name == "" {
		req.Name = "仪表盘订阅"
	}
	if req.Format == "" {
		req.Format = models.SubscriptionFormatCSV
	}
	if req.Frequency == "" {
		req.Frequency = models.SubscriptionFrequencyManual
	}
	if !models.ValidSubscriptionFormat(req.Format) || !models.ValidSubscriptionFrequency(req.Frequency) {
		Fail(c, http.StatusBadRequest, "invalid subscription format or frequency")
		return models.DashboardSubscription{}, false
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	return models.DashboardSubscription{
		ChartID:     chart.ID,
		WorkspaceID: chart.WorkspaceID,
		ProjectID:   chart.ProjectID,
		Name:        req.Name,
		Format:      req.Format,
		Frequency:   req.Frequency,
		Enabled:     enabled,
		NextRunAt:   req.NextRunAt,
		LastResult:  datatypes.JSON([]byte("{}")),
		CreatedBy:   createdBy,
		UpdatedBy:   createdBy,
	}, true
}

func nextSubscriptionRun(frequency models.SubscriptionFrequency, from time.Time) *time.Time {
	var next time.Time
	switch frequency {
	case models.SubscriptionFrequencyDaily:
		next = from.Add(24 * time.Hour)
	case models.SubscriptionFrequencyWeekly:
		next = from.Add(7 * 24 * time.Hour)
	default:
		return nil
	}
	return &next
}

func safeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "dashboard"
	}
	var builder strings.Builder
	for _, r := range value {
		if r == '-' || r == '_' || r == '.' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r > 127 {
			builder.WriteRune(r)
		}
	}
	if builder.Len() == 0 {
		return "dashboard-" + strconv.FormatInt(time.Now().Unix(), 10)
	}
	return builder.String()
}
