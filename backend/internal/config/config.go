package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv                         string
	AppAddr                        string
	MySQLDSN                       string
	JWTAccessSecret                string
	JWTRefreshSecret               string
	AccessTTL                      time.Duration
	RefreshTTL                     time.Duration
	CORSOrigins                    []string
	CookieSecure                   bool
	SeedAdminPassword              string
	RunAutoMigrate                 bool
	RunSeedDefaults                bool
	RegisterMode                   string
	RegisterCode                   string
	DataSourceKey                  string
	DataSourceAllowedHosts         []string
	DataSourceBlockPrivateNetworks bool
	QueryScheduler                 bool
	QueryMaxConcurrent             int
	QueryLogRetentionDays          int
}

func Load() Config {
	_ = godotenv.Load()
	appEnv := env("APP_ENV", "development")

	return Config{
		AppEnv:                         appEnv,
		AppAddr:                        env("APP_ADDR", ":8080"),
		MySQLDSN:                       env("MYSQL_DSN", "lightbi:lightbi@tcp(127.0.0.1:3306)/lightbi?charset=utf8mb4&parseTime=True&loc=Local"),
		JWTAccessSecret:                env("JWT_ACCESS_SECRET", "change-me-access-secret"),
		JWTRefreshSecret:               env("JWT_REFRESH_SECRET", "change-me-refresh-secret"),
		AccessTTL:                      time.Duration(envInt("JWT_ACCESS_TTL_MINUTES", 30)) * time.Minute,
		RefreshTTL:                     time.Duration(envInt("JWT_REFRESH_TTL_HOURS", 168)) * time.Hour,
		CORSOrigins:                    envList("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
		CookieSecure:                   envBool("COOKIE_SECURE", false),
		SeedAdminPassword:              env("SEED_ADMIN_PASSWORD", "LightBI@123456"),
		RunAutoMigrate:                 envBool("RUN_AUTO_MIGRATE", false),
		RunSeedDefaults:                envBool("RUN_SEED_DEFAULTS", false),
		RegisterMode:                   env("REGISTER_MODE", "disabled"),
		RegisterCode:                   env("REGISTER_CODE", ""),
		DataSourceKey:                  env("DATA_SOURCE_CREDENTIAL_KEY", "dev-only-change-me-data-source-key"),
		DataSourceAllowedHosts:         envList("DATA_SOURCE_ALLOWED_HOSTS", ""),
		DataSourceBlockPrivateNetworks: envBool("DATA_SOURCE_BLOCK_PRIVATE_NETWORKS", isProductionEnv(appEnv)),
		QueryScheduler:                 envBool("DATASET_QUERY_SCHEDULER", false),
		QueryMaxConcurrent:             envInt("DATASET_QUERY_MAX_CONCURRENT", 8),
		QueryLogRetentionDays:          envInt("DATASET_QUERY_LOG_RETENTION_DAYS", 30),
	}
}

func (cfg Config) IsProduction() bool {
	return isProductionEnv(cfg.AppEnv)
}

func (cfg Config) Validate() error {
	if cfg.AccessTTL <= 0 || cfg.RefreshTTL <= 0 {
		return errors.New("JWT token TTL must be positive")
	}
	if !validRegisterMode(cfg.RegisterMode) {
		return fmt.Errorf("REGISTER_MODE must be one of disabled, public, invite")
	}
	if cfg.RegisterMode == "invite" && strings.TrimSpace(cfg.RegisterCode) == "" {
		return errors.New("REGISTER_CODE is required when REGISTER_MODE=invite")
	}
	if strings.TrimSpace(cfg.DataSourceKey) == "" {
		return errors.New("DATA_SOURCE_CREDENTIAL_KEY is required")
	}
	if cfg.QueryMaxConcurrent <= 0 {
		return errors.New("DATASET_QUERY_MAX_CONCURRENT must be positive")
	}
	if cfg.QueryLogRetentionDays < 0 {
		return errors.New("DATASET_QUERY_LOG_RETENTION_DAYS must not be negative")
	}
	if !cfg.IsProduction() {
		return nil
	}

	var problems []string
	if cfg.JWTAccessSecret == "change-me-access-secret" {
		problems = append(problems, "JWT_ACCESS_SECRET uses the default value")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		problems = append(problems, "JWT_ACCESS_SECRET must be at least 32 characters")
	}
	if cfg.JWTRefreshSecret == "change-me-refresh-secret" {
		problems = append(problems, "JWT_REFRESH_SECRET uses the default value")
	}
	if len(cfg.JWTRefreshSecret) < 32 {
		problems = append(problems, "JWT_REFRESH_SECRET must be at least 32 characters")
	}
	if cfg.JWTAccessSecret == cfg.JWTRefreshSecret {
		problems = append(problems, "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different")
	}
	if cfg.MySQLDSN == "lightbi:lightbi@tcp(127.0.0.1:3306)/lightbi?charset=utf8mb4&parseTime=True&loc=Local" {
		problems = append(problems, "MYSQL_DSN uses the default value")
	}
	if !cfg.CookieSecure {
		problems = append(problems, "COOKIE_SECURE must be true in production")
	}
	if cfg.SeedAdminPassword == "LightBI@123456" {
		problems = append(problems, "SEED_ADMIN_PASSWORD uses the default value")
	}
	if cfg.DataSourceKey == "dev-only-change-me-data-source-key" {
		problems = append(problems, "DATA_SOURCE_CREDENTIAL_KEY uses the development default value")
	}
	if len(cfg.DataSourceKey) < 32 {
		problems = append(problems, "DATA_SOURCE_CREDENTIAL_KEY must be at least 32 characters")
	}
	if len(cfg.DataSourceAllowedHosts) == 0 {
		problems = append(problems, "DATA_SOURCE_ALLOWED_HOSTS is required in production")
	}
	if !cfg.DataSourceBlockPrivateNetworks {
		problems = append(problems, "DATA_SOURCE_BLOCK_PRIVATE_NETWORKS must be true in production")
	}
	if cfg.RunAutoMigrate {
		problems = append(problems, "RUN_AUTO_MIGRATE must be false in production")
	}
	if cfg.RunSeedDefaults {
		problems = append(problems, "RUN_SEED_DEFAULTS must be false in production")
	}
	if len(problems) > 0 {
		return fmt.Errorf("unsafe production configuration: %s", strings.Join(problems, "; "))
	}
	return nil
}

func isProductionEnv(appEnv string) bool {
	return strings.EqualFold(appEnv, "production") || strings.EqualFold(appEnv, "prod")
}

func validRegisterMode(mode string) bool {
	switch mode {
	case "disabled", "public", "invite":
		return true
	default:
		return false
	}
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envList(key string, fallback string) []string {
	raw := env(key, fallback)
	items := strings.Split(raw, ",")
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}
