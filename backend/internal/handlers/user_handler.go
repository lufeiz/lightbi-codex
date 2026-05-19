package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

type UserHandler struct {
	DB *gorm.DB
}

type userRequest struct {
	Username    string            `json:"username"`
	Email       *string           `json:"email"`
	Phone       *string           `json:"phone"`
	DisplayName string            `json:"displayName"`
	Password    string            `json:"password"`
	Role        models.UserRole   `json:"role"`
	Status      models.UserStatus `json:"status"`
}

func (h UserHandler) List(c *gin.Context) {
	var users []models.User
	query := h.DB.Order("created_at DESC")
	if c.Query("status") != "" {
		query = query.Where("status = ?", c.Query("status"))
	}
	if err := query.Find(&users).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list users failed")
		return
	}
	OK(c, ToUserDTOs(users))
}

func (h UserHandler) Create(c *gin.Context) {
	var req userRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid user payload")
		return
	}
	if req.Username == "" || req.Password == "" || req.DisplayName == "" {
		Fail(c, http.StatusBadRequest, "username, displayName and password are required")
		return
	}
	if !models.ValidRole(req.Role) {
		Fail(c, http.StatusBadRequest, "invalid role")
		return
	}
	if req.Status == "" {
		req.Status = models.UserStatusActive
	}

	passwordHash, err := services.HashPassword(req.Password)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "hash password failed")
		return
	}

	user := models.User{
		Username:     req.Username,
		Email:        req.Email,
		Phone:        req.Phone,
		DisplayName:  req.DisplayName,
		PasswordHash: passwordHash,
		Role:         req.Role,
		Status:       req.Status,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create user failed")
		return
	}
	Created(c, ToUserDTO(user))
}

func (h UserHandler) Update(c *gin.Context) {
	var user models.User
	if err := h.DB.First(&user, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "user not found")
		return
	}

	var req userRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid user payload")
		return
	}
	updates := map[string]interface{}{}
	if req.DisplayName != "" {
		updates["display_name"] = req.DisplayName
	}
	if req.Email != nil {
		updates["email"] = req.Email
	}
	if req.Phone != nil {
		updates["phone"] = req.Phone
	}
	if req.Role != "" {
		if !models.ValidRole(req.Role) {
			Fail(c, http.StatusBadRequest, "invalid role")
			return
		}
		updates["role"] = req.Role
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}
	if req.Password != "" {
		passwordHash, err := services.HashPassword(req.Password)
		if err != nil {
			Fail(c, http.StatusInternalServerError, "hash password failed")
			return
		}
		updates["password_hash"] = passwordHash
	}
	if len(updates) > 0 {
		if err := h.DB.Model(&user).Updates(updates).Error; err != nil {
			Fail(c, http.StatusBadRequest, "update user failed")
			return
		}
	}
	h.DB.First(&user, user.ID)
	OK(c, ToUserDTO(user))
}

func (h UserHandler) Delete(c *gin.Context) {
	var user models.User
	if err := h.DB.First(&user, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "user not found")
		return
	}
	if err := h.DB.Model(&user).Update("status", models.UserStatusDisabled).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "disable user failed")
		return
	}
	OK(c, gin.H{"disabled": true})
}
