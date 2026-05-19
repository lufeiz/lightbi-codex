package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
)

type GroupHandler struct {
	DB *gorm.DB
}

type groupRequest struct {
	Name      string `json:"name"`
	ParentID  *uint  `json:"parentId"`
	SortOrder int    `json:"sortOrder"`
}

func (h GroupHandler) List(c *gin.Context) {
	var groups []models.ChartGroup
	if err := h.DB.Order("parent_id IS NOT NULL, parent_id ASC, sort_order ASC, name ASC").Find(&groups).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list groups failed")
		return
	}
	OK(c, groups)
}

func (h GroupHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req groupRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		Fail(c, http.StatusBadRequest, "group name is required")
		return
	}
	if req.ParentID != nil {
		var parent models.ChartGroup
		if err := h.DB.First(&parent, *req.ParentID).Error; err != nil {
			Fail(c, http.StatusBadRequest, "parent group not found")
			return
		}
	}

	group := models.ChartGroup{
		Name:      req.Name,
		ParentID:  req.ParentID,
		SortOrder: req.SortOrder,
		CreatedBy: user.ID,
		UpdatedBy: user.ID,
	}
	if err := h.DB.Create(&group).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create group failed")
		return
	}
	Created(c, group)
}

func (h GroupHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var group models.ChartGroup
	if err := h.DB.First(&group, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "group not found")
		return
	}

	var req groupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid group payload")
		return
	}
	if req.ParentID != nil && *req.ParentID == group.ID {
		Fail(c, http.StatusBadRequest, "group cannot be its own parent")
		return
	}
	if req.ParentID != nil {
		var parent models.ChartGroup
		if err := h.DB.First(&parent, *req.ParentID).Error; err != nil {
			Fail(c, http.StatusBadRequest, "parent group not found")
			return
		}
	}

	updates := map[string]interface{}{
		"parent_id":   req.ParentID,
		"sort_order":  req.SortOrder,
		"updated_by":  user.ID,
	}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if err := h.DB.Model(&group).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update group failed")
		return
	}
	h.DB.First(&group, group.ID)
	OK(c, group)
}

func (h GroupHandler) Delete(c *gin.Context) {
	var group models.ChartGroup
	if err := h.DB.First(&group, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "group not found")
		return
	}

	var childCount int64
	if err := h.DB.Model(&models.ChartGroup{}).Where("parent_id = ?", group.ID).Count(&childCount).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "check child groups failed")
		return
	}
	if childCount > 0 {
		Fail(c, http.StatusBadRequest, "group has child groups")
		return
	}

	var chartCount int64
	if err := h.DB.Model(&models.Chart{}).Where("group_id = ?", group.ID).Count(&chartCount).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "check group charts failed")
		return
	}
	if chartCount > 0 {
		Fail(c, http.StatusBadRequest, "group has charts")
		return
	}

	if err := h.DB.Delete(&group).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete group failed")
		return
	}
	OK(c, gin.H{"deleted": true})
}
