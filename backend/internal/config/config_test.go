package config

import (
	"strings"
	"testing"
	"time"
)

func TestValidateRejectsUnsafeProductionConfig(t *testing.T) {
	cfg := Config{
		AppEnv:             "production",
		MySQLDSN:           "lightbi:lightbi@tcp(127.0.0.1:3306)/lightbi?charset=utf8mb4&parseTime=True&loc=Local",
		JWTAccessSecret:    "change-me-access-secret",
		JWTRefreshSecret:   "change-me-refresh-secret",
		AccessTTL:          30 * time.Minute,
		RefreshTTL:         24 * time.Hour,
		SeedAdminPassword:  "LightBI@123456",
		RegisterMode:       "disabled",
		DataSourceKey:      "dev-only-change-me-data-source-key",
		RunSeedDefaults:    true,
		QueryMaxConcurrent: 8,
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected unsafe production config to fail")
	}
	for _, text := range []string{"JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "MYSQL_DSN", "SEED_ADMIN_PASSWORD", "DATA_SOURCE_CREDENTIAL_KEY", "RUN_SEED_DEFAULTS"} {
		if !strings.Contains(err.Error(), text) {
			t.Fatalf("expected error to mention %s, got %q", text, err.Error())
		}
	}
}

func TestValidateInviteModeRequiresCode(t *testing.T) {
	cfg := Config{
		AppEnv:             "development",
		JWTAccessSecret:    "access",
		JWTRefreshSecret:   "refresh",
		AccessTTL:          time.Minute,
		RefreshTTL:         time.Hour,
		RegisterMode:       "invite",
		DataSourceKey:      "dev-key",
		QueryMaxConcurrent: 8,
	}

	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "REGISTER_CODE") {
		t.Fatalf("expected missing register code error, got %v", err)
	}
}

func TestValidateRejectsNegativeDatasetQueryLogRetention(t *testing.T) {
	cfg := Config{
		AppEnv:                "development",
		JWTAccessSecret:       "access",
		JWTRefreshSecret:      "refresh",
		AccessTTL:             time.Minute,
		RefreshTTL:            time.Hour,
		RegisterMode:          "disabled",
		DataSourceKey:         "dev-key",
		QueryMaxConcurrent:    8,
		QueryLogRetentionDays: -1,
	}

	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "DATASET_QUERY_LOG_RETENTION_DAYS") {
		t.Fatalf("expected invalid query log retention error, got %v", err)
	}
}
