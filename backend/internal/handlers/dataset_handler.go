package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

type DatasetHandler struct {
	DB     *gorm.DB
	Config config.Config
}

type datasetSummary struct {
	ID           uint               `json:"id"`
	Name         string             `json:"name"`
	Type         models.DatasetType `json:"type"`
	Description  string             `json:"description"`
	SourceName   string             `json:"sourceName"`
	DataSourceID *uint              `json:"dataSourceId"`
	CacheTTL     int                `json:"cacheTtl"`
	RefreshEvery int                `json:"refreshEvery"`
	QueryTimeout int                `json:"queryTimeout"`
	RowLimit     int                `json:"rowLimit"`
	CreatedAt    string             `json:"createdAt"`
	UpdatedAt    string             `json:"updatedAt"`
}

type datasetField struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Type  string `json:"type"`
	Role  string `json:"role,omitempty"`
}

type datasetDetail struct {
	datasetSummary
	QuerySQL   string           `json:"querySql"`
	Dimensions []datasetField   `json:"dimensions"`
	Measures   []datasetField   `json:"measures"`
	Fields     []datasetField   `json:"fields"`
	Rows       []map[string]any `json:"rows,omitempty"`
}

type datasetRequest struct {
	Name         string             `json:"name"`
	Type         models.DatasetType `json:"type"`
	Description  string             `json:"description"`
	SourceName   string             `json:"sourceName"`
	DataSourceID *uint              `json:"dataSourceId"`
	QuerySQL     string             `json:"querySql"`
	Dimensions   []datasetField     `json:"dimensions"`
	Measures     []datasetField     `json:"measures"`
	CacheTTL     int                `json:"cacheTtl"`
	RefreshEvery int                `json:"refreshEvery"`
	QueryTimeout int                `json:"queryTimeout"`
	RowLimit     int                `json:"rowLimit"`
}

func (h DatasetHandler) List(c *gin.Context) {
	query := h.DB.Model(&models.Dataset{})
	if datasetType := models.DatasetType(c.Query("type")); datasetType != "" {
		if !models.ValidDatasetType(datasetType) {
			Fail(c, http.StatusBadRequest, "invalid dataset type")
			return
		}
		query = query.Where("type = ?", datasetType)
	}

	var datasets []models.Dataset
	if err := query.Order("type ASC, name ASC").Find(&datasets).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list datasets failed")
		return
	}

	out := make([]datasetSummary, 0, len(datasets))
	for _, dataset := range datasets {
		out = append(out, toDatasetSummary(dataset))
	}
	OK(c, out)
}

func (h DatasetHandler) Get(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.Preload("DataSource").First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}

	detail, err := toDatasetDetail(dataset, true)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "parse dataset failed")
		return
	}
	OK(c, detail)
}

func (h DatasetHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req datasetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid dataset payload")
		return
	}
	dataset, err := h.datasetFromRequest(req, user.ID, user.ID)
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.DB.Create(&dataset).Error; err != nil {
		Fail(c, http.StatusBadRequest, "create dataset failed")
		return
	}
	Created(c, toDatasetSummary(dataset))
}

func (h DatasetHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var existing models.Dataset
	if err := h.DB.First(&existing, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}
	var req datasetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid dataset payload")
		return
	}
	next, err := h.datasetFromRequest(req, existing.CreatedBy, user.ID)
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.DB.Model(&existing).Updates(map[string]any{
		"name":            next.Name,
		"type":            next.Type,
		"description":     next.Description,
		"source_name":     next.SourceName,
		"data_source_id":  next.DataSourceID,
		"query_sql":       next.QuerySQL,
		"fields":          next.Fields,
		"dimensions":      next.Dimensions,
		"measures":        next.Measures,
		"cache_ttl":       next.CacheTTL,
		"refresh_every":   next.RefreshEvery,
		"query_timeout":   next.QueryTimeout,
		"row_limit":       next.RowLimit,
		"policy":          next.Policy,
		"updated_by":      user.ID,
		"last_refresh_at": nil,
	}).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update dataset failed")
		return
	}
	_ = services.RefreshDatasetQueryCache(h.DB, existing.ID)
	h.DB.First(&existing, existing.ID)
	OK(c, toDatasetSummary(existing))
}

func (h DatasetHandler) Delete(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}
	if err := h.DB.Delete(&dataset).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "delete dataset failed")
		return
	}
	_ = services.RefreshDatasetQueryCache(h.DB, dataset.ID)
	OK(c, gin.H{"deleted": true})
}

func (h DatasetHandler) Fields(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}

	dimensions, measures, err := parseDatasetFields(dataset)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "parse fields failed")
		return
	}
	OK(c, gin.H{"dimensions": dimensions, "measures": measures})
}

func (h DatasetHandler) Rows(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}
	if dataset.Type == models.DatasetTypeSQL {
		Fail(c, http.StatusBadRequest, "SQL datasets must be queried through /query")
		return
	}
	var rows []map[string]any
	if err := json.Unmarshal(dataset.Rows, &rows); err != nil {
		Fail(c, http.StatusInternalServerError, "parse rows failed")
		return
	}
	OK(c, rows)
}

func (h DatasetHandler) Preview(c *gin.Context) {
	h.query(c, true)
}

func (h DatasetHandler) Query(c *gin.Context) {
	h.query(c, false)
}

func (h DatasetHandler) Refresh(c *gin.Context) {
	id, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid dataset id")
		return
	}
	if err := services.RefreshDatasetQueryCache(h.DB, id); err != nil {
		Fail(c, http.StatusInternalServerError, "refresh dataset cache failed")
		return
	}
	now := time.Now()
	_ = h.DB.Model(&models.Dataset{}).Where("id = ?", id).Update("last_refresh_at", &now).Error
	OK(c, gin.H{"refreshed": true})
}

func (h DatasetHandler) query(c *gin.Context, preview bool) {
	id, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid dataset id")
		return
	}
	var req services.DatasetQueryRequest
	if c.Request.Body != nil {
		_ = c.ShouldBindJSON(&req)
	}
	if preview && req.Limit == 0 {
		req.Limit = 100
	}
	response, err := services.ExecuteDatasetQuery(c.Request.Context(), h.DB, h.Config, id, req)
	if err != nil {
		Fail(c, http.StatusBadRequest, err.Error())
		return
	}
	OK(c, response)
}

func (h DatasetHandler) datasetFromRequest(req datasetRequest, createdBy uint, updatedBy uint) (models.Dataset, error) {
	if req.Name == "" {
		return models.Dataset{}, errBadRequest("dataset name is required")
	}
	if req.Type == "" {
		req.Type = models.DatasetTypeSQL
	}
	if !models.ValidDatasetType(req.Type) {
		return models.Dataset{}, errBadRequest("invalid dataset type")
	}
	if req.Type == models.DatasetTypeSQL {
		if req.DataSourceID == nil {
			return models.Dataset{}, errBadRequest("dataSourceId is required")
		}
		if _, err := services.NormalizeReadOnlySQL(req.QuerySQL); err != nil {
			return models.Dataset{}, err
		}
		if !h.dataSourceExists(*req.DataSourceID) {
			return models.Dataset{}, errBadRequest("data source not found")
		}
	}
	if len(req.Dimensions) == 0 && len(req.Measures) == 0 {
		return models.Dataset{}, errBadRequest("dataset fields are required")
	}
	dimensions := normalizeDatasetFields(req.Dimensions, "dimension")
	measures := normalizeDatasetFields(req.Measures, "measure")
	fields := append(append([]datasetField{}, dimensions...), measures...)
	dimJSON, _ := json.Marshal(dimensions)
	measureJSON, _ := json.Marshal(measures)
	fieldsJSON, _ := json.Marshal(fields)
	rowLimit := req.RowLimit
	if rowLimit <= 0 {
		rowLimit = 500
	}
	queryTimeout := req.QueryTimeout
	if queryTimeout <= 0 {
		queryTimeout = 10
	}
	cacheTTL := req.CacheTTL
	if cacheTTL < 0 {
		cacheTTL = 0
	}
	sourceName := req.SourceName
	if sourceName == "" && req.DataSourceID != nil {
		sourceName = "data_source_" + cUint(*req.DataSourceID)
	}
	if sourceName == "" {
		sourceName = "manual"
	}
	return models.Dataset{
		Name:         req.Name,
		Type:         req.Type,
		Description:  req.Description,
		SourceName:   sourceName,
		DataSourceID: req.DataSourceID,
		QuerySQL:     req.QuerySQL,
		Fields:       datatypes.JSON(fieldsJSON),
		Dimensions:   datatypes.JSON(dimJSON),
		Measures:     datatypes.JSON(measureJSON),
		Rows:         datatypes.JSON([]byte("[]")),
		CacheTTL:     cacheTTL,
		RefreshEvery: req.RefreshEvery,
		QueryTimeout: queryTimeout,
		RowLimit:     rowLimit,
		Policy:       datatypes.JSON([]byte("{}")),
		CreatedBy:    createdBy,
		UpdatedBy:    updatedBy,
	}, nil
}

func (h DatasetHandler) dataSourceExists(id uint) bool {
	var count int64
	if err := h.DB.Model(&models.DataSource{}).Where("id = ? AND status = ?", id, models.DataSourceStatusActive).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func toDatasetSummary(dataset models.Dataset) datasetSummary {
	return datasetSummary{
		ID:           dataset.ID,
		Name:         dataset.Name,
		Type:         dataset.Type,
		Description:  dataset.Description,
		SourceName:   dataset.SourceName,
		DataSourceID: dataset.DataSourceID,
		CacheTTL:     dataset.CacheTTL,
		RefreshEvery: dataset.RefreshEvery,
		QueryTimeout: dataset.QueryTimeout,
		RowLimit:     dataset.RowLimit,
		CreatedAt:    dataset.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:    dataset.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func toDatasetDetail(dataset models.Dataset, includeRows bool) (datasetDetail, error) {
	dimensions, measures, err := parseDatasetFields(dataset)
	if err != nil {
		return datasetDetail{}, err
	}
	fields := append(append([]datasetField{}, dimensions...), measures...)
	var rows []map[string]any
	if includeRows && dataset.Type != models.DatasetTypeSQL {
		if err := json.Unmarshal(dataset.Rows, &rows); err != nil {
			return datasetDetail{}, err
		}
	}
	return datasetDetail{
		datasetSummary: toDatasetSummary(dataset),
		QuerySQL:       dataset.QuerySQL,
		Dimensions:     dimensions,
		Measures:       measures,
		Fields:         fields,
		Rows:           rows,
	}, nil
}

func parseDatasetFields(dataset models.Dataset) ([]datasetField, []datasetField, error) {
	var dimensions []datasetField
	var measures []datasetField
	if err := json.Unmarshal(dataset.Dimensions, &dimensions); err != nil {
		return nil, nil, err
	}
	if err := json.Unmarshal(dataset.Measures, &measures); err != nil {
		return nil, nil, err
	}
	return normalizeDatasetFields(dimensions, "dimension"), normalizeDatasetFields(measures, "measure"), nil
}

func normalizeDatasetFields(fields []datasetField, role string) []datasetField {
	out := make([]datasetField, 0, len(fields))
	seen := map[string]bool{}
	for _, field := range fields {
		if field.Name == "" || seen[field.Name] {
			continue
		}
		seen[field.Name] = true
		if field.Label == "" {
			field.Label = field.Name
		}
		if field.Type == "" {
			field.Type = "string"
		}
		field.Role = role
		out = append(out, field)
	}
	return out
}

type requestError string

func (e requestError) Error() string {
	return string(e)
}

func errBadRequest(message string) error {
	return requestError(message)
}

func cUint(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}
