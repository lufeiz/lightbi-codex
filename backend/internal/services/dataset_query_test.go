package services

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
)

func TestNormalizeReadOnlySQLRejectsWritesAndMultiStatements(t *testing.T) {
	if _, err := NormalizeReadOnlySQL("select * from orders"); err != nil {
		t.Fatalf("expected select to pass: %v", err)
	}
	for _, sqlText := range []string{
		"delete from orders",
		"with deleted as (delete\nfrom orders returning id) select * from deleted",
		"with updated as (update\torders set revenue = 1 returning id) select * from updated",
		"with inserted as (insert\ninto orders(id) values(1) returning id) select * from inserted",
		"select * from orders; drop table orders",
		"update orders set revenue = 1",
		"call refresh_orders()",
	} {
		if _, err := NormalizeReadOnlySQL(sqlText); err == nil {
			t.Fatalf("expected %q to be rejected", sqlText)
		}
	}
}

func TestBuildDatasetSQLForMySQLAndPostgres(t *testing.T) {
	fields := map[string]datasetFieldMeta{
		"region":  {Name: "region", Label: "区域", Type: "string", Role: "dimension"},
		"revenue": {Name: "revenue", Label: "收入", Type: "number", Role: "measure"},
	}
	req := DatasetQueryRequest{
		Dimensions: []string{"region"},
		Metrics:    []QueryMetric{{Field: "revenue", Aggregation: "sum", Alias: "revenue"}},
		Filters:    []QueryFilter{{Field: "region", Operator: "eq", Value: "华东"}},
		TopN:       10,
		Limit:      100,
	}

	mysqlSQL, args, columns, err := BuildDatasetSQL(models.DataSourceTypeMySQL, "select region, revenue from orders", req, fields)
	if err != nil {
		t.Fatalf("build mysql sql: %v", err)
	}
	if !strings.Contains(mysqlSQL, "SUM(`revenue`) AS `revenue`") || !strings.Contains(mysqlSQL, "GROUP BY `region`") || !strings.Contains(mysqlSQL, "LIMIT ?") {
		t.Fatalf("unexpected mysql sql: %s", mysqlSQL)
	}
	if len(args) != 2 || args[0] != "华东" || args[1] != 10 {
		t.Fatalf("unexpected args: %#v", args)
	}
	if len(columns) != 2 || columns[0].Name != "region" || columns[1].Name != "revenue" {
		t.Fatalf("unexpected columns: %#v", columns)
	}

	postgresSQL, _, _, err := BuildDatasetSQL(models.DataSourceTypePostgres, "select region, revenue from orders", req, fields)
	if err != nil {
		t.Fatalf("build postgres sql: %v", err)
	}
	if !strings.Contains(postgresSQL, `SUM("revenue") AS "revenue"`) || !strings.Contains(postgresSQL, `GROUP BY "region"`) {
		t.Fatalf("unexpected postgres sql: %s", postgresSQL)
	}
}

func TestExecuteDatasetQueryWritesAuditLog(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "query-log.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Dataset{}, &models.DatasetQueryLog{}, &models.DatasetQueryCache{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	dataset := models.Dataset{
		WorkspaceID:  1,
		ProjectID:    1,
		OwnerID:      1,
		Name:         "销售订单",
		Type:         models.DatasetTypeStandard,
		SourceName:   "Mock",
		QueryTimeout: 10,
		RowLimit:     500,
		CacheTTL:     0,
		Dimensions:   datatypes.JSON([]byte(`[{"name":"region","label":"区域","type":"string"}]`)),
		Measures:     datatypes.JSON([]byte(`[{"name":"revenue","label":"收入","type":"number"}]`)),
		Rows:         datatypes.JSON([]byte(`[{"region":"华东","revenue":120},{"region":"华南","revenue":80}]`)),
	}
	if err := db.Create(&dataset).Error; err != nil {
		t.Fatalf("create dataset: %v", err)
	}

	response, err := ExecuteDatasetQuery(context.Background(), db, config.Config{QueryMaxConcurrent: 2, QueryLogRetentionDays: 30}, dataset.ID, DatasetQueryRequest{
		Dimensions: []string{"region"},
		Metrics:    []QueryMetric{{Field: "revenue", Aggregation: "sum", Alias: "revenue"}},
		Limit:      100,
	})
	if err != nil {
		t.Fatalf("execute dataset query: %v", err)
	}
	if len(response.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(response.Rows))
	}

	log := waitForDatasetQueryLog(t, db)
	if log.Status != "success" || log.DatasetID != dataset.ID || log.RowCount != 2 || log.QueryHash == "" {
		t.Fatalf("unexpected query log: %#v", log)
	}
}

func TestPruneDatasetQueryLogsRemovesExpiredRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "query-log-retention.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.DatasetQueryLog{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	oldLog := models.DatasetQueryLog{DatasetID: 1, Status: "success", QueryHash: "old", CreatedAt: now.AddDate(0, 0, -31)}
	freshLog := models.DatasetQueryLog{DatasetID: 1, Status: "success", QueryHash: "fresh", CreatedAt: now.AddDate(0, 0, -7)}
	if err := db.Create(&oldLog).Error; err != nil {
		t.Fatalf("create old log: %v", err)
	}
	if err := db.Create(&freshLog).Error; err != nil {
		t.Fatalf("create fresh log: %v", err)
	}

	if err := pruneDatasetQueryLogs(db, 30, now); err != nil {
		t.Fatalf("prune logs: %v", err)
	}

	var logs []models.DatasetQueryLog
	if err := db.Order("query_hash ASC").Find(&logs).Error; err != nil {
		t.Fatalf("list logs: %v", err)
	}
	if len(logs) != 1 || logs[0].QueryHash != "fresh" {
		t.Fatalf("unexpected logs after prune: %#v", logs)
	}
}

func waitForDatasetQueryLog(t *testing.T, db *gorm.DB) models.DatasetQueryLog {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var log models.DatasetQueryLog
		err := db.First(&log).Error
		if err == nil {
			return log
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			t.Fatalf("read query log: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("expected query audit log")
	return models.DatasetQueryLog{}
}
