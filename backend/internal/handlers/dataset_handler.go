package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/models"
)

type DatasetHandler struct {
	DB *gorm.DB
}

type datasetSummary struct {
	ID          uint               `json:"id"`
	Name        string             `json:"name"`
	Type        models.DatasetType `json:"type"`
	Description string             `json:"description"`
	SourceName  string             `json:"sourceName"`
	CreatedAt   string             `json:"createdAt"`
	UpdatedAt   string             `json:"updatedAt"`
}

type datasetField struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Type  string `json:"type"`
}

type datasetDetail struct {
	ID          uint               `json:"id"`
	Name        string             `json:"name"`
	Type        models.DatasetType `json:"type"`
	Description string             `json:"description"`
	SourceName  string             `json:"sourceName"`
	Dimensions  []datasetField     `json:"dimensions"`
	Measures    []datasetField     `json:"measures"`
	Rows        []map[string]any   `json:"rows"`
	CreatedAt   string             `json:"createdAt"`
	UpdatedAt   string             `json:"updatedAt"`
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
		out = append(out, datasetSummary{
			ID:          dataset.ID,
			Name:        dataset.Name,
			Type:        dataset.Type,
			Description: dataset.Description,
			SourceName:  dataset.SourceName,
			CreatedAt:   dataset.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   dataset.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	OK(c, out)
}

func (h DatasetHandler) Get(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}

	detail, err := toDatasetDetail(dataset)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "parse dataset failed")
		return
	}
	OK(c, detail)
}

func (h DatasetHandler) Fields(c *gin.Context) {
	var dataset models.Dataset
	if err := h.DB.First(&dataset, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "dataset not found")
		return
	}

	var dimensions []datasetField
	var measures []datasetField
	if err := json.Unmarshal(dataset.Dimensions, &dimensions); err != nil {
		Fail(c, http.StatusInternalServerError, "parse dimensions failed")
		return
	}
	if err := json.Unmarshal(dataset.Measures, &measures); err != nil {
		Fail(c, http.StatusInternalServerError, "parse measures failed")
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

	var rows []map[string]any
	if err := json.Unmarshal(dataset.Rows, &rows); err != nil {
		Fail(c, http.StatusInternalServerError, "parse rows failed")
		return
	}
	OK(c, rows)
}

func toDatasetDetail(dataset models.Dataset) (datasetDetail, error) {
	var dimensions []datasetField
	var measures []datasetField
	var rows []map[string]any
	if err := json.Unmarshal(dataset.Dimensions, &dimensions); err != nil {
		return datasetDetail{}, err
	}
	if err := json.Unmarshal(dataset.Measures, &measures); err != nil {
		return datasetDetail{}, err
	}
	if err := json.Unmarshal(dataset.Rows, &rows); err != nil {
		return datasetDetail{}, err
	}
	return datasetDetail{
		ID:          dataset.ID,
		Name:        dataset.Name,
		Type:        dataset.Type,
		Description: dataset.Description,
		SourceName:  dataset.SourceName,
		Dimensions:  dimensions,
		Measures:    measures,
		Rows:        rows,
		CreatedAt:   dataset.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   dataset.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}, nil
}
