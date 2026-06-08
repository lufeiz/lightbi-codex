package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
)

type ChartHandler struct {
	DB *gorm.DB
}

type chartRequest struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Type        models.ChartType   `json:"type"`
	Status      models.ChartStatus `json:"status"`
	WorkspaceID *uint              `json:"workspaceId"`
	ProjectID   *uint              `json:"projectId"`
	GroupID     *uint              `json:"groupId"`
	TagIDs      []uint             `json:"tagIds"`
	Config      json.RawMessage    `json:"config"`
}

type chartListResponse struct {
	Items    []models.Chart `json:"items"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}

type chartPublishResponse struct {
	Chart   models.Chart    `json:"chart"`
	Version chartVersionDTO `json:"version"`
}

func (h ChartHandler) List(c *gin.Context) {
	page := parsePositiveInt(c.Query("page"), 1)
	pageSize := parsePositiveInt(c.Query("pageSize"), 12)
	if pageSize > 100 {
		pageSize = 100
	}

	query := addProjectFilter(c, h.DB, h.DB.Model(&models.Chart{}), "charts.project_id")
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("charts.name LIKE ? OR charts.description LIKE ?", like, like)
	}
	if chartType := models.ChartType(c.Query("type")); chartType != "" {
		query = query.Where("charts.type = ?", chartType)
	}
	if status := models.ChartStatus(c.Query("status")); status != "" {
		query = query.Where("charts.status = ?", status)
	}
	if createdBy, ok := parseUint(c.Query("createdBy")); ok {
		query = query.Where("charts.created_by = ?", createdBy)
	}
	if groupID, ok := parseUint(c.Query("groupId")); ok {
		query = query.Where("charts.group_id IN ?", h.groupWithDescendants(groupID))
	}
	if tagIDs := parseUintList(c.Query("tagIds")); len(tagIDs) > 0 {
		subQuery := h.DB.Table("chart_tag_relations").
			Select("chart_id").
			Where("chart_tag_id IN ?", tagIDs)
		query = query.Where("charts.id IN (?)", subQuery)
	}
	if from, ok := parseTime(c.Query("updatedFrom")); ok {
		query = query.Where("charts.updated_at >= ?", from)
	}
	if to, ok := parseTime(c.Query("updatedTo")); ok {
		query = query.Where("charts.updated_at <= ?", to)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "count charts failed")
		return
	}

	sortBy := normalizeSortBy(c.Query("sortBy"))
	sortOrder := "DESC"
	if strings.EqualFold(c.Query("sortOrder"), "asc") {
		sortOrder = "ASC"
	}

	var charts []models.Chart
	if err := query.
		Preload("Tags").
		Preload("Group").
		Preload("Creator").
		Order(sortBy + " " + sortOrder).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&charts).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list charts failed")
		return
	}

	OK(c, chartListResponse{Items: charts, Total: total, Page: page, PageSize: pageSize})
}

func (h ChartHandler) Creators(c *gin.Context) {
	projectIDs := accessibleProjectIDs(c, h.DB, 0)
	if len(projectIDs) == 0 {
		OK(c, []UserDTO{})
		return
	}
	var users []models.User
	err := h.DB.
		Joins("JOIN charts ON charts.created_by = users.id AND charts.deleted_at IS NULL").
		Where("users.status = ?", models.UserStatusActive).
		Where("charts.project_id IN ?", projectIDs).
		Group("users.id").
		Order("users.display_name ASC").
		Find(&users).Error
	if err != nil {
		Fail(c, http.StatusInternalServerError, "list chart creators failed")
		return
	}
	OK(c, ToUserDTOs(users))
}

func (h ChartHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req chartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid chart payload")
		return
	}
	if req.Name == "" {
		Fail(c, http.StatusBadRequest, "chart name is required")
		return
	}
	if !models.ValidChartType(req.Type) {
		Fail(c, http.StatusBadRequest, "invalid chart type")
		return
	}
	workspaceID, projectID := requestScopeFromRaw(req.WorkspaceID, req.ProjectID)
	scope, ok := resolveAssetScope(c, h.DB, workspaceID, projectID)
	if !ok {
		return
	}
	if !canWriteProject(h.DB, user, scope.ProjectID) {
		Fail(c, http.StatusForbidden, "project permission denied")
		return
	}
	if req.Status == "" {
		req.Status = models.ChartStatusDraft
	}
	if !models.ValidChartStatus(req.Status) {
		Fail(c, http.StatusBadRequest, "invalid chart status")
		return
	}
	config, ok := normalizeConfig(req.Config)
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid chart config json")
		return
	}
	if err := h.validateConfigDatasetScope(config, scope.ProjectID); err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	if req.GroupID != nil && !h.groupExists(*req.GroupID, scope.ProjectID) {
		Fail(c, http.StatusBadRequest, "group not found")
		return
	}
	tags, ok := h.loadTags(req.TagIDs, scope.ProjectID)
	if !ok {
		Fail(c, http.StatusBadRequest, "tag not found")
		return
	}

	chart := models.Chart{
		WorkspaceID: scope.WorkspaceID,
		ProjectID:   scope.ProjectID,
		OwnerID:     user.ID,
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		Status:      req.Status,
		GroupID:     req.GroupID,
		Config:      config,
		Tags:        tags,
		CreatedBy:   user.ID,
		UpdatedBy:   user.ID,
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&chart).Error; err != nil {
			return err
		}
		if req.Status == models.ChartStatusPublished {
			version, err := snapshotChartVersion(tx, chart, user.ID)
			if err != nil {
				return err
			}
			audit(tx, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.publish", "chart", chart.ID, "发布仪表盘", map[string]any{"status": req.Status, "version": version.Version})
		}
		return nil
	})
	if err != nil {
		Fail(c, http.StatusBadRequest, "create chart failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.create", "chart", chart.ID, "创建仪表盘", nil)
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&chart, chart.ID)
	Created(c, chart)
}

func (h ChartHandler) Get(c *gin.Context) {
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if !requireChartRead(c, h.DB, &chart) {
		return
	}
	OK(c, chart)
}

func (h ChartHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var chart models.Chart
	if err := h.DB.Preload("Tags").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if !requireChartWrite(c, h.DB, &chart) {
		return
	}

	var req chartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid chart payload")
		return
	}
	if req.Name == "" {
		Fail(c, http.StatusBadRequest, "chart name is required")
		return
	}
	if !models.ValidChartType(req.Type) {
		Fail(c, http.StatusBadRequest, "invalid chart type")
		return
	}
	if req.Status == "" {
		req.Status = chart.Status
	}
	if !models.ValidChartStatus(req.Status) {
		Fail(c, http.StatusBadRequest, "invalid chart status")
		return
	}
	config, ok := normalizeConfig(req.Config)
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid chart config json")
		return
	}
	if err := h.validateConfigDatasetScope(config, chart.ProjectID); err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	if req.GroupID != nil && !h.groupExists(*req.GroupID, chart.ProjectID) {
		Fail(c, http.StatusBadRequest, "group not found")
		return
	}
	tags, ok := h.loadTags(req.TagIDs, chart.ProjectID)
	if !ok {
		Fail(c, http.StatusBadRequest, "tag not found")
		return
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&chart).Updates(map[string]interface{}{
			"name":        req.Name,
			"description": req.Description,
			"type":        req.Type,
			"status":      req.Status,
			"group_id":    req.GroupID,
			"config":      config,
			"updated_by":  user.ID,
		}).Error; err != nil {
			return err
		}
		if err := tx.Model(&chart).Association("Tags").Replace(tags); err != nil {
			return err
		}
		if chart.Status != models.ChartStatusPublished && req.Status == models.ChartStatusPublished {
			next := chart
			next.Name = req.Name
			next.Description = req.Description
			next.Type = req.Type
			next.Status = req.Status
			next.GroupID = req.GroupID
			next.Config = config
			next.UpdatedBy = user.ID
			version, err := snapshotChartVersion(tx, next, user.ID)
			if err != nil {
				return err
			}
			audit(tx, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.publish", "chart", chart.ID, "发布仪表盘", map[string]any{"status": req.Status, "version": version.Version})
		}
		return nil
	})
	if err != nil {
		Fail(c, http.StatusBadRequest, "update chart failed")
		return
	}

	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.update", "chart", chart.ID, "更新仪表盘", nil)
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, chart.ID)
	OK(c, chart)
}

func (h ChartHandler) Delete(c *gin.Context) {
	var chart models.Chart
	if err := h.DB.First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	user, _ := middleware.CurrentUser(c)
	if !requireChartWrite(c, h.DB, &chart) {
		return
	}
	if err := h.DB.Delete(&chart).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete chart failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.delete", "chart", chart.ID, "删除仪表盘", nil)
	OK(c, gin.H{"deleted": true})
}

func (h ChartHandler) Copy(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var chart models.Chart
	if err := h.DB.Preload("Tags").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if !requireChartWrite(c, h.DB, &chart) {
		return
	}

	copied := models.Chart{
		WorkspaceID: chart.WorkspaceID,
		ProjectID:   chart.ProjectID,
		OwnerID:     user.ID,
		Name:        chart.Name + " 副本",
		Description: chart.Description,
		Type:        chart.Type,
		Status:      models.ChartStatusDraft,
		GroupID:     chart.GroupID,
		Config:      chart.Config,
		Tags:        chart.Tags,
		CreatedBy:   user.ID,
		UpdatedBy:   user.ID,
	}
	if err := h.DB.Create(&copied).Error; err != nil {
		Fail(c, http.StatusBadRequest, "copy chart failed")
		return
	}
	audit(h.DB, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.copy", "chart", chart.ID, "复制仪表盘", map[string]any{"copiedChartId": copied.ID})
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&copied, copied.ID)
	Created(c, copied)
}

func (h ChartHandler) Publish(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var chart models.Chart
	if err := h.DB.Preload("Tags").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if !requireChartWrite(c, h.DB, &chart) {
		return
	}

	req, hasPayload, ok := optionalChartRequest(c)
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid chart payload")
		return
	}
	next := chart
	var tags []models.ChartTag
	if hasPayload {
		if req.Name == "" {
			Fail(c, http.StatusBadRequest, "chart name is required")
			return
		}
		if !models.ValidChartType(req.Type) {
			Fail(c, http.StatusBadRequest, "invalid chart type")
			return
		}
		config, ok := normalizeConfig(req.Config)
		if !ok {
			Fail(c, http.StatusBadRequest, "invalid chart config json")
			return
		}
		if err := h.validateConfigDatasetScope(config, chart.ProjectID); err != nil {
			Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		if req.GroupID != nil && !h.groupExists(*req.GroupID, chart.ProjectID) {
			Fail(c, http.StatusBadRequest, "group not found")
			return
		}
		var loaded bool
		tags, loaded = h.loadTags(req.TagIDs, chart.ProjectID)
		if !loaded {
			Fail(c, http.StatusBadRequest, "tag not found")
			return
		}
		next.Name = req.Name
		next.Description = req.Description
		next.Type = req.Type
		next.GroupID = req.GroupID
		next.Config = config
	} else {
		if err := h.validateConfigDatasetScope(chart.Config, chart.ProjectID); err != nil {
			Fail(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	next.Status = models.ChartStatusPublished
	next.UpdatedBy = user.ID

	var version models.ChartVersion
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		updates := map[string]interface{}{
			"status":     models.ChartStatusPublished,
			"updated_by": user.ID,
		}
		if hasPayload {
			updates["name"] = next.Name
			updates["description"] = next.Description
			updates["type"] = next.Type
			updates["group_id"] = next.GroupID
			updates["config"] = next.Config
		}
		if err := tx.Model(&chart).Updates(updates).Error; err != nil {
			return err
		}
		if hasPayload {
			if err := tx.Model(&chart).Association("Tags").Replace(tags); err != nil {
				return err
			}
		}
		created, err := snapshotChartVersion(tx, next, user.ID)
		if err != nil {
			return err
		}
		version = created
		audit(tx, user.ID, chart.WorkspaceID, chart.ProjectID, "chart.publish", "chart", chart.ID, "发布仪表盘", map[string]any{"status": models.ChartStatusPublished, "version": version.Version})
		return nil
	})
	if err != nil {
		Fail(c, http.StatusInternalServerError, "publish chart failed")
		return
	}
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, chart.ID)
	OK(c, chartPublishResponse{Chart: chart, Version: toChartVersionDTO(version)})
}

func (h ChartHandler) Archive(c *gin.Context) {
	h.changeStatus(c, models.ChartStatusArchived)
}

func (h ChartHandler) changeStatus(c *gin.Context, status models.ChartStatus) {
	user, _ := middleware.CurrentUser(c)
	var chart models.Chart
	if err := h.DB.First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if !requireChartWrite(c, h.DB, &chart) {
		return
	}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&chart).Updates(map[string]interface{}{
			"status":     status,
			"updated_by": user.ID,
		}).Error; err != nil {
			return err
		}
		action := "chart.archive"
		summary := "归档仪表盘"
		if status == models.ChartStatusPublished {
			if _, err := snapshotChartVersion(tx, chart, user.ID); err != nil {
				return err
			}
			action = "chart.publish"
			summary = "发布仪表盘"
		}
		audit(tx, user.ID, chart.WorkspaceID, chart.ProjectID, action, "chart", chart.ID, summary, map[string]any{"status": status})
		return nil
	})
	if err != nil {
		Fail(c, http.StatusInternalServerError, "update chart status failed")
		return
	}
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&chart, chart.ID)
	OK(c, chart)
}

func (h ChartHandler) loadTags(tagIDs []uint, projectID uint) ([]models.ChartTag, bool) {
	if len(tagIDs) == 0 {
		return []models.ChartTag{}, true
	}
	var tags []models.ChartTag
	if err := h.DB.Where("project_id = ? AND id IN ?", projectID, tagIDs).Find(&tags).Error; err != nil {
		return nil, false
	}
	return tags, len(tags) == len(uniqueUint(tagIDs))
}

func optionalChartRequest(c *gin.Context) (chartRequest, bool, bool) {
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return chartRequest{}, false, false
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return chartRequest{}, false, true
	}
	var req chartRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return chartRequest{}, true, false
	}
	return req, true, true
}

func (h ChartHandler) validateConfigDatasetScope(config []byte, projectID uint) error {
	var doc struct {
		Widgets []struct {
			ID     string `json:"id"`
			Config struct {
				DatasetID  *uint    `json:"datasetId"`
				Dimensions []string `json:"dimensions"`
				Measures   []string `json:"measures"`
			} `json:"config"`
		} `json:"widgets"`
	}
	if err := json.Unmarshal(config, &doc); err != nil {
		return fmt.Errorf("invalid chart config json")
	}
	ids := make([]uint, 0, len(doc.Widgets))
	for _, widget := range doc.Widgets {
		if widget.Config.DatasetID != nil {
			ids = append(ids, *widget.Config.DatasetID)
		}
	}
	ids = uniqueUint(ids)
	if len(ids) == 0 {
		return nil
	}
	var datasets []models.Dataset
	if err := h.DB.Where("project_id = ? AND id IN ?", projectID, ids).Find(&datasets).Error; err != nil {
		return fmt.Errorf("dataset reference validation failed")
	}
	if len(datasets) != len(ids) {
		return fmt.Errorf("dataset reference is outside project scope")
	}
	datasetByID := make(map[uint]models.Dataset, len(datasets))
	for _, dataset := range datasets {
		datasetByID[dataset.ID] = dataset
	}
	fieldSets := make(map[uint]struct {
		dimensions map[string]bool
		measures   map[string]bool
	})
	for _, widget := range doc.Widgets {
		if widget.Config.DatasetID == nil {
			continue
		}
		dataset := datasetByID[*widget.Config.DatasetID]
		fields, ok := fieldSets[dataset.ID]
		if !ok {
			dimensions, measures, err := parseDatasetFields(dataset)
			if err != nil {
				return fmt.Errorf("dataset field validation failed")
			}
			fields = struct {
				dimensions map[string]bool
				measures   map[string]bool
			}{
				dimensions: fieldNameSet(dimensions),
				measures:   fieldNameSet(measures),
			}
			fieldSets[dataset.ID] = fields
		}
		for _, field := range widget.Config.Dimensions {
			if !fields.dimensions[field] {
				return fmt.Errorf("widget %s dimension field %s does not exist in dataset", widget.ID, field)
			}
		}
		for _, field := range widget.Config.Measures {
			if !fields.measures[field] {
				return fmt.Errorf("widget %s measure field %s does not exist in dataset", widget.ID, field)
			}
		}
	}
	return nil
}

func fieldNameSet(fields []datasetField) map[string]bool {
	out := make(map[string]bool, len(fields))
	for _, field := range fields {
		out[field.Name] = true
	}
	return out
}

func (h ChartHandler) groupExists(groupID uint, projectID uint) bool {
	var count int64
	if err := h.DB.Model(&models.ChartGroup{}).Where("project_id = ? AND id = ?", projectID, groupID).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func (h ChartHandler) groupWithDescendants(groupID uint) []uint {
	var root models.ChartGroup
	if err := h.DB.Select("id", "project_id").First(&root, groupID).Error; err != nil {
		return []uint{groupID}
	}
	var groups []models.ChartGroup
	if err := h.DB.Select("id", "parent_id").Where("project_id = ?", root.ProjectID).Find(&groups).Error; err != nil {
		return []uint{groupID}
	}

	ids := []uint{groupID}
	seen := map[uint]bool{groupID: true}
	changed := true
	for changed {
		changed = false
		for _, group := range groups {
			if group.ParentID != nil && seen[*group.ParentID] && !seen[group.ID] {
				seen[group.ID] = true
				ids = append(ids, group.ID)
				changed = true
			}
		}
	}
	return ids
}

func normalizeSortBy(sortBy string) string {
	switch sortBy {
	case "name":
		return "charts.name"
	case "createdAt":
		return "charts.created_at"
	case "updatedAt", "":
		return "charts.updated_at"
	default:
		return "charts.updated_at"
	}
}

func parsePositiveInt(raw string, fallback int) int {
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func parseUint(raw string) (uint, bool) {
	parsed, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil || parsed == 0 {
		return 0, false
	}
	return uint(parsed), true
}

func parseUintList(raw string) []uint {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	ids := make([]uint, 0, len(parts))
	for _, part := range parts {
		if id, ok := parseUint(part); ok {
			ids = append(ids, id)
		}
	}
	return uniqueUint(ids)
}

func uniqueUint(ids []uint) []uint {
	seen := map[uint]bool{}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func parseTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		parsed, err := time.Parse(layout, raw)
		if err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}
