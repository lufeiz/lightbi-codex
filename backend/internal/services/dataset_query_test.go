package services

import (
	"strings"
	"testing"

	"lightbi/backend/internal/models"
)

func TestNormalizeReadOnlySQLRejectsWritesAndMultiStatements(t *testing.T) {
	if _, err := NormalizeReadOnlySQL("select * from orders"); err != nil {
		t.Fatalf("expected select to pass: %v", err)
	}
	for _, sqlText := range []string{
		"delete from orders",
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
