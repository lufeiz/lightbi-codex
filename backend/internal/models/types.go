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
	DatasetTypeSQL      DatasetType = "sql"
)

func ValidDatasetType(datasetType DatasetType) bool {
	switch datasetType {
	case DatasetTypeStandard, DatasetTypeDirect, DatasetTypeSQL:
		return true
	default:
		return false
	}
}

type DataSourceType string

const (
	DataSourceTypeMySQL    DataSourceType = "mysql"
	DataSourceTypePostgres DataSourceType = "postgres"
)

func ValidDataSourceType(dataSourceType DataSourceType) bool {
	switch dataSourceType {
	case DataSourceTypeMySQL, DataSourceTypePostgres:
		return true
	default:
		return false
	}
}

type DataSourceStatus string

const (
	DataSourceStatusActive   DataSourceStatus = "active"
	DataSourceStatusDisabled DataSourceStatus = "disabled"
)

func ValidDataSourceStatus(status DataSourceStatus) bool {
	switch status {
	case DataSourceStatusActive, DataSourceStatusDisabled:
		return true
	default:
		return false
	}
}

type ChartType string

const (
	ChartTypeDetailTable          ChartType = "detailTable"
	ChartTypePivotTable           ChartType = "pivotTable"
	ChartTypeComparisonTable      ChartType = "comparisonTable"
	ChartTypeMetricCard           ChartType = "metricCard"
	ChartTypeMetricTrendCard      ChartType = "metricTrendCard"
	ChartTypeLine                 ChartType = "line"
	ChartTypeColumn               ChartType = "column"
	ChartTypeBar                  ChartType = "bar"
	ChartTypeStackedColumn        ChartType = "stackedColumn"
	ChartTypeStackedBar           ChartType = "stackedBar"
	ChartTypePercentStackedColumn ChartType = "percentStackedColumn"
	ChartTypePercentStackedBar    ChartType = "percentStackedBar"
	ChartTypePie                  ChartType = "pie"
	ChartTypeDonut                ChartType = "donut"
	ChartTypeRichText             ChartType = "richText"
	ChartTypeText                 ChartType = "text"
)

func ValidChartType(chartType ChartType) bool {
	switch chartType {
	case ChartTypeDetailTable, ChartTypePivotTable, ChartTypeComparisonTable,
		ChartTypeMetricCard, ChartTypeMetricTrendCard,
		ChartTypeLine, ChartTypeColumn, ChartTypeBar,
		ChartTypeStackedColumn, ChartTypeStackedBar, ChartTypePercentStackedColumn, ChartTypePercentStackedBar,
		ChartTypePie, ChartTypeDonut, ChartTypeRichText, ChartTypeText:
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
