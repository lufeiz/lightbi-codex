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
		RunAutoMigrate:     true,
		QueryMaxConcurrent: 8,
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected unsafe production config to fail")
	}
	for _, text := range []string{"JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "MYSQL_DSN", "COOKIE_SECURE", "SEED_ADMIN_PASSWORD", "DATA_SOURCE_CREDENTIAL_KEY", "DATA_SOURCE_ALLOWED_HOSTS", "DATA_SOURCE_BLOCK_PRIVATE_NETWORKS", "RUN_AUTO_MIGRATE", "RUN_SEED_DEFAULTS"} {
		if !strings.Contains(err.Error(), text) {
			t.Fatalf("expected error to mention %s, got %q", text, err.Error())
		}
	}
}

func TestValidateAcceptsHardenedProductionConfig(t *testing.T) {
	cfg := Config{
		AppEnv:                         "production",
		MySQLDSN:                       "lightbi:strong@tcp(db.example.com:3306)/lightbi?charset=utf8mb4&parseTime=True&loc=Local",
		JWTAccessSecret:                strings.Repeat("a", 32),
		JWTRefreshSecret:               strings.Repeat("b", 32),
		AccessTTL:                      30 * time.Minute,
		RefreshTTL:                     24 * time.Hour,
		CookieSecure:                   true,
		SeedAdminPassword:              "LightBI@prod-change-this-123",
		RegisterMode:                   "disabled",
		DataSourceKey:                  strings.Repeat("c", 32),
		DataSourceAllowedHosts:         []string{"analytics.example.com"},
		DataSourceBlockPrivateNetworks: true,
		QueryMaxConcurrent:             8,
		QueryLogRetentionDays:          30,
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected hardened production config to pass, got %v", err)
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
