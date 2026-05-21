package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
)

type assetScope struct {
	WorkspaceID uint
	ProjectID   uint
}

func accessibleProjectIDs(c *gin.Context, db *gorm.DB, workspaceID uint) []uint {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		return nil
	}

	query := db.Model(&models.Project{}).Select("projects.id").Distinct()
	if workspaceID > 0 {
		query = query.Where("projects.workspace_id = ?", workspaceID)
	}
	if user.Role != models.RoleAdmin {
		query = query.
			Joins("LEFT JOIN project_members ON project_members.project_id = projects.id AND project_members.user_id = ?", user.ID).
			Joins("LEFT JOIN workspace_members ON workspace_members.workspace_id = projects.workspace_id AND workspace_members.user_id = ?", user.ID).
			Where("project_members.id IS NOT NULL OR workspace_members.id IS NOT NULL")
	}

	var ids []uint
	_ = query.Pluck("projects.id", &ids).Error
	return ids
}

func resolveAssetScope(c *gin.Context, db *gorm.DB, workspaceID uint, projectID uint) (assetScope, bool) {
	if projectID == 0 {
		if queryProjectID, ok := parseUint(c.Query("projectId")); ok {
			projectID = queryProjectID
		}
	}
	if workspaceID == 0 {
		if queryWorkspaceID, ok := parseUint(c.Query("workspaceId")); ok {
			workspaceID = queryWorkspaceID
		}
	}

	user, ok := middleware.CurrentUser(c)
	if !ok {
		Fail(c, http.StatusUnauthorized, "missing user")
		return assetScope{}, false
	}

	var project models.Project
	if projectID > 0 {
		query := db.Where("id = ?", projectID)
		if workspaceID > 0 {
			query = query.Where("workspace_id = ?", workspaceID)
		}
		if err := query.First(&project).Error; err != nil {
			Fail(c, http.StatusBadRequest, "project not found")
			return assetScope{}, false
		}
	} else {
		query := db.Order("updated_at DESC")
		if workspaceID > 0 {
			query = query.Where("workspace_id = ?", workspaceID)
		}
		if user.Role != models.RoleAdmin {
			ids := accessibleProjectIDs(c, db, workspaceID)
			if len(ids) == 0 {
				Fail(c, http.StatusForbidden, "project permission denied")
				return assetScope{}, false
			}
			query = query.Where("id IN ?", ids)
		}
		if err := query.First(&project).Error; err != nil {
			Fail(c, http.StatusBadRequest, "project not found")
			return assetScope{}, false
		}
	}
	if !canReadProject(db, user, project.ID) {
		Fail(c, http.StatusForbidden, "project permission denied")
		return assetScope{}, false
	}
	return assetScope{WorkspaceID: project.WorkspaceID, ProjectID: project.ID}, true
}

func canReadProject(db *gorm.DB, user models.User, projectID uint) bool {
	if user.Role == models.RoleAdmin {
		return true
	}
	return projectRoleForUser(db, user.ID, projectID) != ""
}

func canWriteProject(db *gorm.DB, user models.User, projectID uint) bool {
	if user.Role == models.RoleAdmin {
		return true
	}
	role := projectRoleForUser(db, user.ID, projectID)
	return role == models.WorkspaceRoleOwner || role == models.WorkspaceRoleAdmin || role == models.WorkspaceRoleEditor
}

func canManageProject(db *gorm.DB, user models.User, projectID uint) bool {
	if user.Role == models.RoleAdmin {
		return true
	}
	role := projectRoleForUser(db, user.ID, projectID)
	return role == models.WorkspaceRoleOwner || role == models.WorkspaceRoleAdmin
}

func canManageWorkspace(db *gorm.DB, user models.User, workspaceID uint) bool {
	if user.Role == models.RoleAdmin {
		return true
	}
	var member models.WorkspaceMember
	if err := db.Where("workspace_id = ? AND user_id = ?", workspaceID, user.ID).First(&member).Error; err != nil {
		return false
	}
	return member.Role == models.WorkspaceRoleOwner || member.Role == models.WorkspaceRoleAdmin
}

func projectRoleForUser(db *gorm.DB, userID uint, projectID uint) models.WorkspaceRole {
	var member models.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err == nil {
		return member.Role
	}
	var project models.Project
	if err := db.Select("workspace_id").First(&project, projectID).Error; err != nil {
		return ""
	}
	var workspaceMember models.WorkspaceMember
	if err := db.Where("workspace_id = ? AND user_id = ?", project.WorkspaceID, userID).First(&workspaceMember).Error; err != nil {
		return ""
	}
	return workspaceMember.Role
}

func requireChartRead(c *gin.Context, db *gorm.DB, chart *models.Chart) bool {
	user, _ := middleware.CurrentUser(c)
	if canReadProject(db, user, chart.ProjectID) {
		return true
	}
	Fail(c, http.StatusForbidden, "chart permission denied")
	return false
}

func requireChartWrite(c *gin.Context, db *gorm.DB, chart *models.Chart) bool {
	user, _ := middleware.CurrentUser(c)
	if canWriteProject(db, user, chart.ProjectID) {
		return true
	}
	Fail(c, http.StatusForbidden, "chart permission denied")
	return false
}

func addProjectFilter(c *gin.Context, db *gorm.DB, query *gorm.DB, column string) *gorm.DB {
	workspaceID, _ := parseUint(c.Query("workspaceId"))
	if projectID, ok := parseUint(c.Query("projectId")); ok {
		ids := accessibleProjectIDs(c, db, workspaceID)
		if containsUint(ids, projectID) {
			return query.Where(column+" = ?", projectID)
		}
		return query.Where("1 = 0")
	}
	ids := accessibleProjectIDs(c, db, workspaceID)
	if len(ids) == 0 {
		return query.Where("1 = 0")
	}
	return query.Where(column+" IN ?", ids)
}

func containsUint(items []uint, target uint) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func requestScopeFromRaw(workspaceID *uint, projectID *uint) (uint, uint) {
	var workspace uint
	var project uint
	if workspaceID != nil {
		workspace = *workspaceID
	}
	if projectID != nil {
		project = *projectID
	}
	return workspace, project
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func audit(db *gorm.DB, actorID uint, workspaceID uint, projectID uint, action string, objectType string, objectID uint, summary string, metadata map[string]any) {
	raw := datatypes.JSON([]byte("{}"))
	if metadata != nil {
		if bytes, err := json.Marshal(metadata); err == nil {
			raw = datatypes.JSON(bytes)
		}
	}
	_ = db.Create(&models.AuditLog{
		WorkspaceID: workspaceID,
		ProjectID:   projectID,
		ActorID:     actorID,
		Action:      action,
		ObjectType:  objectType,
		ObjectID:    objectID,
		Summary:     summary,
		Metadata:    raw,
	}).Error
}

func parseOptionalUint(raw string) *uint {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parsed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || parsed == 0 {
		return nil
	}
	value := uint(parsed)
	return &value
}
