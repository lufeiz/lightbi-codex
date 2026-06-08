package services

import (
	"context"
	"strings"
	"testing"

	"lightbi/backend/internal/models"
)

func TestValidateDataSourceTargetBlocksPrivateIP(t *testing.T) {
	source := dataSourceTarget("127.0.0.1")

	err := ValidateDataSourceTarget(context.Background(), source, nil, true)
	if err == nil || !strings.Contains(err.Error(), "private or unsafe network") {
		t.Fatalf("expected private network rejection, got %v", err)
	}
}

func TestValidateDataSourceTargetRejectsHostOutsideAllowlist(t *testing.T) {
	source := dataSourceTarget("analytics.example.com")

	err := ValidateDataSourceTarget(context.Background(), source, []string{"warehouse.example.com"}, false)
	if err == nil || !strings.Contains(err.Error(), "allowed list") {
		t.Fatalf("expected allowlist rejection, got %v", err)
	}
}

func TestValidateDataSourceTargetAllowsWildcardHost(t *testing.T) {
	source := dataSourceTarget("analytics.example.com")

	if err := ValidateDataSourceTarget(context.Background(), source, []string{"*.example.com"}, false); err != nil {
		t.Fatalf("expected wildcard host to be allowed, got %v", err)
	}
}

func TestValidateDataSourceTargetAllowsCIDRIP(t *testing.T) {
	source := dataSourceTarget("203.0.113.10")

	if err := ValidateDataSourceTarget(context.Background(), source, []string{"203.0.113.0/24"}, false); err != nil {
		t.Fatalf("expected CIDR IP to be allowed, got %v", err)
	}
}

func dataSourceTarget(host string) models.DataSource {
	return models.DataSource{
		Type:         models.DataSourceTypeMySQL,
		Host:         host,
		Port:         3306,
		DatabaseName: "lightbi",
		Username:     "reader",
	}
}
