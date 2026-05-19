package handlers

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

type AuthHandler struct {
	DB     *gorm.DB
	Config config.Config
	JWT    *services.JWTService
}

type loginRequest struct {
	Username string `json:"username"`
	Account  string `json:"account"`
	Password string `json:"password" binding:"required"`
}

type registerRequest struct {
	AccountType string `json:"accountType" binding:"required"`
	Account     string `json:"account" binding:"required"`
	DisplayName string `json:"displayName" binding:"required"`
	Password    string `json:"password" binding:"required"`
	Code        string `json:"code" binding:"required"`
}

type authResponse struct {
	AccessToken string  `json:"accessToken"`
	TokenType   string  `json:"tokenType"`
	ExpiresIn   int64   `json:"expiresIn"`
	User        UserDTO `json:"user"`
}

func (h AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "account and password are required")
		return
	}
	account := strings.TrimSpace(req.Account)
	if account == "" {
		account = strings.TrimSpace(req.Username)
	}
	if account == "" {
		Fail(c, http.StatusBadRequest, "account and password are required")
		return
	}

	var user models.User
	if err := h.DB.Where("username = ? OR email = ? OR phone = ?", account, account, account).First(&user).Error; err != nil {
		Fail(c, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if user.Status != models.UserStatusActive || !services.CheckPassword(user.PasswordHash, req.Password) {
		Fail(c, http.StatusUnauthorized, "invalid username or password")
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "issue token failed")
		return
	}
	h.setRefreshCookie(c, refreshToken)

	OK(c, authResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(h.Config.AccessTTL.Seconds()),
		User:        ToUserDTO(user),
	})
}

func (h AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid register payload")
		return
	}
	req.Account = strings.TrimSpace(req.Account)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.Code != "123456" {
		Fail(c, http.StatusBadRequest, "invalid verification code")
		return
	}
	if len(req.Password) < 8 {
		Fail(c, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if req.AccountType != "email" && req.AccountType != "phone" {
		Fail(c, http.StatusBadRequest, "accountType must be email or phone")
		return
	}
	if req.AccountType == "email" && !regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`).MatchString(req.Account) {
		Fail(c, http.StatusBadRequest, "invalid email")
		return
	}
	if req.AccountType == "phone" && !regexp.MustCompile(`^\+?[0-9]{6,20}$`).MatchString(req.Account) {
		Fail(c, http.StatusBadRequest, "invalid phone")
		return
	}

	var count int64
	scope := h.DB.Model(&models.User{})
	if req.AccountType == "email" {
		scope = scope.Where("email = ?", req.Account)
	} else {
		scope = scope.Where("phone = ?", req.Account)
	}
	if err := scope.Count(&count).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "check account failed")
		return
	}
	if count > 0 {
		Fail(c, http.StatusBadRequest, "account already registered")
		return
	}

	passwordHash, err := services.HashPassword(req.Password)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "hash password failed")
		return
	}
	user := models.User{
		Username:     h.uniqueUsername(req.Account),
		DisplayName:  req.DisplayName,
		PasswordHash: passwordHash,
		Role:         models.RoleEditor,
		Status:       models.UserStatusActive,
	}
	if req.AccountType == "email" {
		user.Email = &req.Account
	} else {
		user.Phone = &req.Account
	}
	if err := h.DB.Create(&user).Error; err != nil {
		Fail(c, http.StatusBadRequest, "register failed")
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "issue token failed")
		return
	}
	h.setRefreshCookie(c, refreshToken)
	Created(c, authResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(h.Config.AccessTTL.Seconds()),
		User:        ToUserDTO(user),
	})
}

func (h AuthHandler) Refresh(c *gin.Context) {
	rawToken, err := c.Cookie("refresh_token")
	if err != nil || rawToken == "" {
		Fail(c, http.StatusUnauthorized, "missing refresh token")
		return
	}

	claims, err := h.JWT.ParseRefreshToken(rawToken)
	if err != nil {
		Fail(c, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	tokenHash := services.HashOpaqueToken(rawToken)
	var stored models.RefreshToken
	if err := h.DB.Where("user_id = ? AND token_hash = ? AND revoked_at IS NULL", claims.UserID, tokenHash).First(&stored).Error; err != nil {
		Fail(c, http.StatusUnauthorized, "refresh token revoked")
		return
	}
	if time.Now().After(stored.ExpiresAt) {
		Fail(c, http.StatusUnauthorized, "refresh token expired")
		return
	}

	var user models.User
	if err := h.DB.First(&user, claims.UserID).Error; err != nil || user.Status != models.UserStatusActive {
		Fail(c, http.StatusUnauthorized, "user not available")
		return
	}

	now := time.Now()
	if err := h.DB.Model(&stored).Update("revoked_at", &now).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "revoke refresh token failed")
		return
	}

	accessToken, refreshToken, err := h.issueTokens(user)
	if err != nil {
		Fail(c, http.StatusInternalServerError, "issue token failed")
		return
	}
	h.setRefreshCookie(c, refreshToken)

	OK(c, authResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(h.Config.AccessTTL.Seconds()),
		User:        ToUserDTO(user),
	})
}

func (h AuthHandler) Logout(c *gin.Context) {
	rawToken, _ := c.Cookie("refresh_token")
	if rawToken != "" {
		now := time.Now()
		_ = h.DB.Model(&models.RefreshToken{}).
			Where("token_hash = ? AND revoked_at IS NULL", services.HashOpaqueToken(rawToken)).
			Update("revoked_at", &now).Error
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", "", -1, "/api/auth", "", h.Config.CookieSecure, true)
	OK(c, gin.H{"loggedOut": true})
}

func (h AuthHandler) Me(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		Fail(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	OK(c, ToUserDTO(user))
}

func (h AuthHandler) issueTokens(user models.User) (string, string, error) {
	accessToken, err := h.JWT.GenerateAccessToken(user)
	if err != nil {
		return "", "", err
	}
	refreshToken, err := h.JWT.GenerateRefreshToken(user)
	if err != nil {
		return "", "", err
	}
	stored := models.RefreshToken{
		UserID:    user.ID,
		TokenHash: services.HashOpaqueToken(refreshToken),
		ExpiresAt: time.Now().Add(h.JWT.RefreshTTL()),
	}
	if err := h.DB.Create(&stored).Error; err != nil {
		return "", "", err
	}
	return accessToken, refreshToken, nil
}

func (h AuthHandler) setRefreshCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("refresh_token", token, int(h.Config.RefreshTTL.Seconds()), "/api/auth", "", h.Config.CookieSecure, true)
}

func (h AuthHandler) uniqueUsername(account string) string {
	base := strings.ToLower(account)
	base = strings.Split(base, "@")[0]
	base = regexp.MustCompile(`[^a-z0-9_]+`).ReplaceAllString(base, "_")
	base = strings.Trim(base, "_")
	if base == "" {
		base = "user"
	}
	username := base
	for i := 1; ; i++ {
		var count int64
		_ = h.DB.Model(&models.User{}).Where("username = ?", username).Count(&count).Error
		if count == 0 {
			return username
		}
		username = base + "_" + strconv.Itoa(i)
	}
}
