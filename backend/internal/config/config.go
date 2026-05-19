package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppAddr           string
	MySQLDSN          string
	JWTAccessSecret   string
	JWTRefreshSecret  string
	AccessTTL         time.Duration
	RefreshTTL        time.Duration
	CORSOrigins       []string
	CookieSecure      bool
	SeedAdminPassword string
}

func Load() Config {
	_ = godotenv.Load()

	return Config{
		AppAddr:           env("APP_ADDR", ":8080"),
		MySQLDSN:          env("MYSQL_DSN", "lightbi:lightbi@tcp(127.0.0.1:3306)/lightbi?charset=utf8mb4&parseTime=True&loc=Local"),
		JWTAccessSecret:   env("JWT_ACCESS_SECRET", "change-me-access-secret"),
		JWTRefreshSecret:  env("JWT_REFRESH_SECRET", "change-me-refresh-secret"),
		AccessTTL:         time.Duration(envInt("JWT_ACCESS_TTL_MINUTES", 30)) * time.Minute,
		RefreshTTL:        time.Duration(envInt("JWT_REFRESH_TTL_HOURS", 168)) * time.Hour,
		CORSOrigins:       envList("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
		CookieSecure:      envBool("COOKIE_SECURE", false),
		SeedAdminPassword: env("SEED_ADMIN_PASSWORD", "LightBI@123456"),
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
