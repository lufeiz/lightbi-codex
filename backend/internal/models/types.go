package models

type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleEditor UserRole = "editor"
	RoleViewer UserRole = "viewer"
)

func ValidRole(role UserRole) bool {
	switch role {
	case RoleAdmin, RoleEditor, RoleViewer:
		return true
	default:
		return false
	}
}

type UserStatus string

const (
	UserStatusActive   UserStatus = "active"
	UserStatusDisabled UserStatus = "disabled"
)

type DatasetType string

const (
	DatasetTypeStandard DatasetType = "standard"
	DatasetTypeDirect   DatasetType = "direct"
)

func ValidDatasetType(datasetType DatasetType) bool {
	switch datasetType {
	case DatasetTypeStandard, DatasetTypeDirect:
		return true
	default:
		return false
	}
}

type ChartType string

const (
	ChartTypeDetailTable     ChartType = "detailTable"
	ChartTypePivotTable      ChartType = "pivotTable"
	ChartTypeComparisonTable ChartType = "comparisonTable"
	ChartTypeLine            ChartType = "line"
	ChartTypeColumn          ChartType = "column"
	ChartTypeBar             ChartType = "bar"
	ChartTypePie             ChartType = "pie"
)

func ValidChartType(chartType ChartType) bool {
	switch chartType {
	case ChartTypeDetailTable, ChartTypePivotTable, ChartTypeComparisonTable, ChartTypeLine, ChartTypeColumn, ChartTypeBar, ChartTypePie:
		return true
	default:
		return false
	}
}

type ChartStatus string

const (
	ChartStatusDraft     ChartStatus = "draft"
	ChartStatusPublished ChartStatus = "published"
	ChartStatusArchived  ChartStatus = "archived"
)

func ValidChartStatus(status ChartStatus) bool {
	switch status {
	case ChartStatusDraft, ChartStatusPublished, ChartStatusArchived:
		return true
	default:
		return false
	}
}
