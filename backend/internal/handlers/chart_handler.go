package handlers

import (
	"encoding/json"
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

func (h ChartHandler) List(c *gin.Context) {
	page := parsePositiveInt(c.Query("page"), 1)
	pageSize := parsePositiveInt(c.Query("pageSize"), 12)
	if pageSize > 100 {
		pageSize = 100
	}

	query := h.DB.Model(&models.Chart{})
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
	var users []models.User
	err := h.DB.
		Joins("JOIN charts ON charts.created_by = users.id AND charts.deleted_at IS NULL").
		Where("users.status = ?", models.UserStatusActive).
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
	if req.GroupID != nil && !h.groupExists(*req.GroupID) {
		Fail(c, http.StatusBadRequest, "group not found")
		return
	}
	tags, ok := h.loadTags(req.TagIDs)
	if !ok {
		Fail(c, http.StatusBadRequest, "tag not found")
		return
	}

	chart := models.Chart{
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
	if err := h.DB.Create(&chart).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create chart failed")
		return
	}
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&chart, chart.ID)
	Created(c, chart)
}

func (h ChartHandler) Get(c *gin.Context) {
	var chart models.Chart
	if err := h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
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
	if req.GroupID != nil && !h.groupExists(*req.GroupID) {
		Fail(c, http.StatusBadRequest, "group not found")
		return
	}
	tags, ok := h.loadTags(req.TagIDs)
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
		return tx.Model(&chart).Association("Tags").Replace(tags)
	})
	if err != nil {
		Fail(c, http.StatusBadRequest, "update chart failed")
		return
	}

	h.DB.Preload("Tags").Preload("Group").Preload("Creator").Preload("Updater").First(&chart, chart.ID)
	OK(c, chart)
}

func (h ChartHandler) Delete(c *gin.Context) {
	var chart models.Chart
	if err := h.DB.First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}
	if err := h.DB.Delete(&chart).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete chart failed")
		return
	}
	OK(c, gin.H{"deleted": true})
}

func (h ChartHandler) Copy(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var chart models.Chart
	if err := h.DB.Preload("Tags").First(&chart, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "chart not found")
		return
	}

	copied := models.Chart{
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
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&copied, copied.ID)
	Created(c, copied)
}

func (h ChartHandler) Publish(c *gin.Context) {
	h.changeStatus(c, models.ChartStatusPublished)
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
	if err := h.DB.Model(&chart).Updates(map[string]interface{}{
		"status":     status,
		"updated_by": user.ID,
	}).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "update chart status failed")
		return
	}
	h.DB.Preload("Tags").Preload("Group").Preload("Creator").First(&chart, chart.ID)
	OK(c, chart)
}

func (h ChartHandler) loadTags(tagIDs []uint) ([]models.ChartTag, bool) {
	if len(tagIDs) == 0 {
		return []models.ChartTag{}, true
	}
	var tags []models.ChartTag
	if err := h.DB.Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
		return nil, false
	}
	return tags, len(tags) == len(uniqueUint(tagIDs))
}

func (h ChartHandler) groupExists(groupID uint) bool {
	var count int64
	if err := h.DB.Model(&models.ChartGroup{}).Where("id = ?", groupID).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func (h ChartHandler) groupWithDescendants(groupID uint) []uint {
	var groups []models.ChartGroup
	if err := h.DB.Select("id", "parent_id").Find(&groups).Error; err != nil {
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
