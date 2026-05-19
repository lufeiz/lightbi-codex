package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
)

type TagHandler struct {
	DB *gorm.DB
}

type tagRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (h TagHandler) List(c *gin.Context) {
	var tags []models.ChartTag
	if err := h.DB.Order("name ASC").Find(&tags).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list tags failed")
		return
	}
	OK(c, tags)
}

func (h TagHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		Fail(c, http.StatusBadRequest, "tag name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#1677ff"
	}

	tag := models.ChartTag{
		Name:      req.Name,
		Color:     req.Color,
		CreatedBy: user.ID,
		UpdatedBy: user.ID,
	}
	if err := h.DB.Create(&tag).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create tag failed")
		return
	}
	Created(c, tag)
}

func (h TagHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var tag models.ChartTag
	if err := h.DB.First(&tag, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "tag not found")
		return
	}

	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid tag payload")
		return
	}
	updates := map[string]interface{}{"updated_by": user.ID}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Color != "" {
		updates["color"] = req.Color
	}
	if err := h.DB.Model(&tag).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update tag failed")
		return
	}
	h.DB.First(&tag, tag.ID)
	OK(c, tag)
}

func (h TagHandler) Delete(c *gin.Context) {
	var tag models.ChartTag
	if err := h.DB.First(&tag, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "tag not found")
		return
	}

	if err := h.DB.Model(&tag).Association("Charts").Clear(); err != nil {
		Fail(c, http.StatusInternalServerError, "clear tag relations failed")
		return
	}
	if err := h.DB.Delete(&tag).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete tag failed")
		return
	}
	OK(c, gin.H{"deleted": true})
}
