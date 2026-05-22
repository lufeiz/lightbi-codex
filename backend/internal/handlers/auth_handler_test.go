package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

func TestRefreshRotatesTokenAtomically(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	hash, err := services.HashPassword("LightBI@123456")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	user := models.User{Username: "editor", DisplayName: "Editor", PasswordHash: hash, Role: models.RoleEditor, Status: models.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	cfg := config.Config{
		JWTAccessSecret:  "test-access-secret",
		JWTRefreshSecret: "test-refresh-secret",
		AccessTTL:        time.Hour,
		RefreshTTL:       time.Hour,
	}
	handler := AuthHandler{DB: db, Config: cfg, JWT: services.NewJWTService(cfg)}
	_, rawRefreshToken, err := handler.issueTokens(user)
	if err != nil {
		t.Fatalf("issue initial tokens: %v", err)
	}

	engine := gin.New()
	engine.POST("/refresh", handler.Refresh)

	first := refreshRequest(engine, rawRefreshToken)
	if first.Code != http.StatusOK {
		t.Fatalf("first refresh status = %d body = %s", first.Code, first.Body.String())
	}
	var firstPayload struct {
		Data authResponse `json:"data"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("parse refresh response: %v", err)
	}
	if firstPayload.Data.AccessToken == "" {
		t.Fatal("expected access token in refresh response")
	}

	second := refreshRequest(engine, rawRefreshToken)
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("second refresh with old token status = %d body = %s", second.Code, second.Body.String())
	}

	var activeCount int64
	if err := db.Model(&models.RefreshToken{}).Where("revoked_at IS NULL").Count(&activeCount).Error; err != nil {
		t.Fatalf("count active refresh tokens: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("expected exactly one active refresh token, got %d", activeCount)
	}

	var revokedCount int64
	if err := db.Model(&models.RefreshToken{}).Where("revoked_at IS NOT NULL").Count(&revokedCount).Error; err != nil {
		t.Fatalf("count revoked refresh tokens: %v", err)
	}
	if revokedCount != 1 {
		t.Fatalf("expected old refresh token to be revoked once, got %d", revokedCount)
	}
}

func refreshRequest(engine *gin.Engine, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: token})
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}
