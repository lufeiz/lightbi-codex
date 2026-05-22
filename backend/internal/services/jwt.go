package services

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
)

const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

type Claims struct {
	UserID    uint   `json:"userId"`
	Role      string `json:"role"`
	TokenType string `json:"tokenType"`
	jwt.RegisteredClaims
}

type JWTService struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

func NewJWTService(cfg config.Config) *JWTService {
	return &JWTService{
		accessSecret:  []byte(cfg.JWTAccessSecret),
		refreshSecret: []byte(cfg.JWTRefreshSecret),
		accessTTL:     cfg.AccessTTL,
		refreshTTL:    cfg.RefreshTTL,
	}
}

func (s *JWTService) GenerateAccessToken(user models.User) (string, error) {
	return s.generate(user, TokenTypeAccess, s.accessTTL, s.accessSecret)
}

func (s *JWTService) GenerateRefreshToken(user models.User) (string, error) {
	return s.generate(user, TokenTypeRefresh, s.refreshTTL, s.refreshSecret)
}

func (s *JWTService) ParseAccessToken(raw string) (*Claims, error) {
	return s.parse(raw, TokenTypeAccess, s.accessSecret)
}

func (s *JWTService) ParseRefreshToken(raw string) (*Claims, error) {
	return s.parse(raw, TokenTypeRefresh, s.refreshSecret)
}

func (s *JWTService) RefreshTTL() time.Duration {
	return s.refreshTTL
}

func (s *JWTService) generate(user models.User, tokenType string, ttl time.Duration, secret []byte) (string, error) {
	now := time.Now()
	tokenID, err := randomTokenID()
	if err != nil {
		return "", err
	}
	claims := Claims{
		UserID:    user.ID,
		Role:      string(user.Role),
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        tokenID,
			Subject:   user.Username,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

func (s *JWTService) parse(raw string, tokenType string, secret []byte) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.TokenType != tokenType {
		return nil, errors.New("invalid token type")
	}
	return claims, nil
}

func randomTokenID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
