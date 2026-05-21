package router

import (
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/handlers"
	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

func Setup(cfg config.Config, db *gorm.DB) *gin.Engine {
	engine := gin.Default()
	engine.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	jwtService := services.NewJWTService(cfg)
	authHandler := handlers.AuthHandler{DB: db, Config: cfg, JWT: jwtService}
	userHandler := handlers.UserHandler{DB: db}
	chartHandler := handlers.ChartHandler{DB: db}
	groupHandler := handlers.GroupHandler{DB: db}
	tagHandler := handlers.TagHandler{DB: db}
	dataSourceHandler := handlers.DataSourceHandler{DB: db, Config: cfg}
	datasetHandler := handlers.DatasetHandler{DB: db, Config: cfg}

	api := engine.Group("/api")
	api.GET("/health", func(c *gin.Context) {
		handlers.OK(c, gin.H{"status": "ok"})
	})
	api.POST("/auth/login", authHandler.Login)
	api.POST("/auth/register", authHandler.Register)
	api.POST("/auth/refresh", authHandler.Refresh)

	protected := api.Group("/")
	protected.Use(middleware.AuthRequired(db, jwtService))
	protected.GET("/auth/me", authHandler.Me)
	protected.POST("/auth/logout", authHandler.Logout)

	readRoles := middleware.RequireRoles(models.RoleAdmin, models.RoleEditor, models.RoleViewer)
	writeRoles := middleware.RequireRoles(models.RoleAdmin, models.RoleEditor)
	adminOnly := middleware.RequireRoles(models.RoleAdmin)

	protected.GET("/users", adminOnly, userHandler.List)
	protected.POST("/users", adminOnly, userHandler.Create)
	protected.PUT("/users/:id", adminOnly, userHandler.Update)
	protected.DELETE("/users/:id", adminOnly, userHandler.Delete)

	protected.GET("/charts", readRoles, chartHandler.List)
	protected.GET("/charts/creators", readRoles, chartHandler.Creators)
	protected.POST("/charts", writeRoles, chartHandler.Create)
	protected.GET("/charts/:id", readRoles, chartHandler.Get)
	protected.PUT("/charts/:id", writeRoles, chartHandler.Update)
	protected.DELETE("/charts/:id", writeRoles, chartHandler.Delete)
	protected.POST("/charts/:id/copy", writeRoles, chartHandler.Copy)
	protected.POST("/charts/:id/publish", writeRoles, chartHandler.Publish)
	protected.POST("/charts/:id/archive", writeRoles, chartHandler.Archive)

	protected.GET("/chart-groups", readRoles, groupHandler.List)
	protected.POST("/chart-groups", writeRoles, groupHandler.Create)
	protected.PUT("/chart-groups/:id", writeRoles, groupHandler.Update)
	protected.DELETE("/chart-groups/:id", writeRoles, groupHandler.Delete)

	protected.GET("/chart-tags", readRoles, tagHandler.List)
	protected.POST("/chart-tags", writeRoles, tagHandler.Create)
	protected.PUT("/chart-tags/:id", writeRoles, tagHandler.Update)
	protected.DELETE("/chart-tags/:id", writeRoles, tagHandler.Delete)

	protected.GET("/data-sources", readRoles, dataSourceHandler.List)
	protected.POST("/data-sources", writeRoles, dataSourceHandler.Create)
	protected.PUT("/data-sources/:id", writeRoles, dataSourceHandler.Update)
	protected.DELETE("/data-sources/:id", writeRoles, dataSourceHandler.Delete)
	protected.POST("/data-sources/:id/test", writeRoles, dataSourceHandler.Test)

	protected.GET("/datasets", readRoles, datasetHandler.List)
	protected.POST("/datasets", writeRoles, datasetHandler.Create)
	protected.GET("/datasets/:id", readRoles, datasetHandler.Get)
	protected.PUT("/datasets/:id", writeRoles, datasetHandler.Update)
	protected.DELETE("/datasets/:id", writeRoles, datasetHandler.Delete)
	protected.GET("/datasets/:id/fields", readRoles, datasetHandler.Fields)
	protected.GET("/datasets/:id/rows", readRoles, datasetHandler.Rows)
	protected.POST("/datasets/:id/preview", readRoles, datasetHandler.Preview)
	protected.POST("/datasets/:id/query", readRoles, datasetHandler.Query)
	protected.POST("/datasets/:id/refresh", writeRoles, datasetHandler.Refresh)

	return engine
}
