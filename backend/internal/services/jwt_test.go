package services

import (
	"testing"
	"time"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
)

func TestGenerateRefreshTokenIncludesUniqueID(t *testing.T) {
	service := NewJWTService(config.Config{
		JWTAccessSecret:  "test-access-secret",
		JWTRefreshSecret: "test-refresh-secret",
		AccessTTL:        30 * time.Minute,
		RefreshTTL:       7 * 24 * time.Hour,
	})
	user := models.User{ID: 1, Username: "admin", Role: models.RoleAdmin}

	first, err := service.GenerateRefreshToken(user)
	if err != nil {
		t.Fatalf("generate first refresh token: %v", err)
	}
	second, err := service.GenerateRefreshToken(user)
	if err != nil {
		t.Fatalf("generate second refresh token: %v", err)
	}
	if first == second {
		t.Fatal("expected refresh tokens generated in quick succession to be unique")
	}

	firstClaims, err := service.ParseRefreshToken(first)
	if err != nil {
		t.Fatalf("parse first refresh token: %v", err)
	}
	secondClaims, err := service.ParseRefreshToken(second)
	if err != nil {
		t.Fatalf("parse second refresh token: %v", err)
	}
	if firstClaims.ID == "" || secondClaims.ID == "" {
		t.Fatal("expected refresh token claims to include jti")
	}
	if firstClaims.ID == secondClaims.ID {
		t.Fatal("expected refresh token jti values to be unique")
	}
}
