package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

type DataSourceHandler struct {
	DB     *gorm.DB
	Config config.Config
}

type dataSourceRequest struct {
	Name                string                  `json:"name"`
	Type                models.DataSourceType   `json:"type"`
	Status              models.DataSourceStatus `json:"status"`
	Description         string                  `json:"description"`
	Host                string                  `json:"host"`
	Port                int                     `json:"port"`
	DatabaseName        string                  `json:"databaseName"`
	Username            string                  `json:"username"`
	Password            string                  `json:"password"`
	SSLMode             string                  `json:"sslMode"`
	Params              map[string]string       `json:"params"`
	MaxOpenConns        int                     `json:"maxOpenConns"`
	MaxIdleConns        int                     `json:"maxIdleConns"`
	ConnMaxLifetimeSecs int                     `json:"connMaxLifetimeSecs"`
}

func (h DataSourceHandler) List(c *gin.Context) {
	var sources []models.DataSource
	if err := h.DB.Order("updated_at DESC").Find(&sources).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list data sources failed")
		return
	}
	OK(c, sources)
}

func (h DataSourceHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req dataSourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid data source payload")
		return
	}
	if err := validateDataSourceRequest(req, true); err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	encrypted, err := services.EncryptSecret(h.Config.DataSourceKey, req.Password)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "encrypt data source password failed")
		return
	}
	params, _ := json.Marshal(req.Params)
	source := models.DataSource{
		Name:                req.Name,
		Type:                req.Type,
		Status:              defaultDataSourceStatus(req.Status),
		Description:         req.Description,
		Host:                req.Host,
		Port:                req.Port,
		DatabaseName:        req.DatabaseName,
		Username:            req.Username,
		PasswordCiphertext:  encrypted,
		SSLMode:             req.SSLMode,
		Params:              datatypes.JSON(params),
		MaxOpenConns:        defaultPositive(req.MaxOpenConns, 5),
		MaxIdleConns:        defaultPositive(req.MaxIdleConns, 2),
		ConnMaxLifetimeSecs: defaultPositive(req.ConnMaxLifetimeSecs, 300),
		CreatedBy:           user.ID,
		UpdatedBy:           user.ID,
	}
	if err := h.DB.Create(&source).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create data source failed")
		return
	}
	Created(c, source)
}

func (h DataSourceHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var source models.DataSource
	if err := h.DB.First(&source, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "data source not found")
		return
	}
	var req dataSourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid data source payload")
		return
	}
	if err := validateDataSourceRequest(req, false); err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	params, _ := json.Marshal(req.Params)
	updates := map[string]any{
		"name":                   req.Name,
		"type":                   req.Type,
		"status":                 defaultDataSourceStatus(req.Status),
		"description":            req.Description,
		"host":                   req.Host,
		"port":                   req.Port,
		"database_name":          req.DatabaseName,
		"username":               req.Username,
		"ssl_mode":               req.SSLMode,
		"params":                 datatypes.JSON(params),
		"max_open_conns":         defaultPositive(req.MaxOpenConns, 5),
		"max_idle_conns":         defaultPositive(req.MaxIdleConns, 2),
		"conn_max_lifetime_secs": defaultPositive(req.ConnMaxLifetimeSecs, 300),
		"updated_by":             user.ID,
	}
	if req.Password != "" {
		encrypted, err := services.EncryptSecret(h.Config.DataSourceKey, req.Password)
		if err != nil {
			Fail(c, http.StatusInternalServerError, "encrypt data source password failed")
			return
		}
		updates["password_ciphertext"] = encrypted
	}
	if err := h.DB.Model(&source).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update data source failed")
		return
	}
	h.DB.First(&source, source.ID)
	OK(c, source)
}

func (h DataSourceHandler) Delete(c *gin.Context) {
	var source models.DataSource
	if err := h.DB.First(&source, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "data source not found")
		return
	}
	var count int64
	if err := h.DB.Model(&models.Dataset{}).Where("data_source_id = ?", source.ID).Count(&count).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "check data source usage failed")
		return
	}
	if count > 0 {
		Fail(c, http.StatusBadRequest, "data source is used by datasets")
		return
	}
	if err := h.DB.Delete(&source).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete data source failed")
		return
	}
	OK(c, gin.H{"deleted": true})
}

func (h DataSourceHandler) Test(c *gin.Context) {
	var source models.DataSource
	if err := h.DB.First(&source, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "data source not found")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()
	db, err := services.OpenDataSource(ctx, source, h.Config.DataSourceKey)
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	services.CloseDataSource(db)
	OK(c, gin.H{"ok": true})
}

func validateDataSourceRequest(req dataSourceRequest, requirePassword bool) error {
	if req.Name == "" || req.Host == "" || req.Port <= 0 || req.DatabaseName == "" || req.Username == "" {
		return errors.New("name, host, port, databaseName and username are required")
	}
	if !models.ValidDataSourceType(req.Type) {
		return errors.New("invalid data source type")
	}
	if req.Status != "" && !models.ValidDataSourceStatus(req.Status) {
		return errors.New("invalid data source status")
	}
	if requirePassword && req.Password == "" {
		return errors.New("password is required")
	}
	return nil
}

func defaultDataSourceStatus(status models.DataSourceStatus) models.DataSourceStatus {
	if status == "" {
		return models.DataSourceStatusActive
	}
	return status
}

func defaultPositive(value int, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}
