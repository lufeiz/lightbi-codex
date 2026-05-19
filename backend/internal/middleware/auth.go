package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

const currentUserKey = "currentUser"

func AuthRequired(db *gorm.DB, jwtService *services.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(c, http.StatusUnauthorized, "missing access token")
			c.Abort()
			return
		}

		claims, err := jwtService.ParseAccessToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			fail(c, http.StatusUnauthorized, "invalid access token")
			c.Abort()
			return
		}

		var user models.User
		if err := db.First(&user, claims.UserID).Error; err != nil {
			fail(c, http.StatusUnauthorized, "user not found")
			c.Abort()
			return
		}
		if user.Status != models.UserStatusActive {
			fail(c, http.StatusForbidden, "user is disabled")
			c.Abort()
			return
		}

		c.Set(currentUserKey, user)
		c.Next()
	}
}

func RequireRoles(roles ...models.UserRole) gin.HandlerFunc {
	allowed := map[models.UserRole]bool{}
	for _, role := range roles {
		allowed[role] = true
	}

	return func(c *gin.Context) {
		user, ok := CurrentUser(c)
		if !ok || !allowed[user.Role] {
			fail(c, http.StatusForbidden, "permission denied")
			c.Abort()
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) (models.User, bool) {
	value, ok := c.Get(currentUserKey)
	if !ok {
		return models.User{}, false
	}
	user, ok := value.(models.User)
	return user, ok
}

func fail(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"code": status, "message": message})
}
