package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"lightbi/backend/internal/middleware"
	"lightbi/backend/internal/models"
)

type WorkspaceHandler struct {
	DB *gorm.DB
}

type workspaceRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type memberRequest struct {
	UserID uint                 `json:"userId"`
	Role   models.WorkspaceRole `json:"role"`
}

func (h WorkspaceHandler) List(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	query := h.DB.Model(&models.Workspace{})
	if user.Role != models.RoleAdmin {
		query = query.Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id AND workspace_members.user_id = ?", user.ID)
	}
	var workspaces []models.Workspace
	if err := query.Order("workspaces.updated_at DESC").Find(&workspaces).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list workspaces failed")
		return
	}
	OK(c, workspaces)
}

func (h WorkspaceHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req workspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		Fail(c, http.StatusBadRequest, "workspace name is required")
		return
	}
	workspace := models.Workspace{Name: req.Name, Description: req.Description, CreatedBy: user.ID, UpdatedBy: user.ID}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.WorkspaceMember{WorkspaceID: workspace.ID, UserID: user.ID, Role: models.WorkspaceRoleOwner, CreatedBy: user.ID, UpdatedBy: user.ID}).Error; err != nil {
			return err
		}
		project := models.Project{WorkspaceID: workspace.ID, Name: "默认项目", Description: "默认项目", OwnerID: user.ID, CreatedBy: user.ID, UpdatedBy: user.ID}
		if err := tx.Create(&project).Error; err != nil {
			return err
		}
		return tx.Create(&models.ProjectMember{ProjectID: project.ID, UserID: user.ID, Role: models.WorkspaceRoleOwner, CreatedBy: user.ID, UpdatedBy: user.ID}).Error
	})
	if err != nil {
		Fail(c, http.StatusBadRequest, "create workspace failed")
		return
	}
	audit(h.DB, user.ID, workspace.ID, 0, "workspace.create", "workspace", workspace.ID, "创建工作空间", nil)
	Created(c, workspace)
}

func (h WorkspaceHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var workspace models.Workspace
	if err := h.DB.First(&workspace, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "workspace not found")
		return
	}
	if !canManageWorkspace(h.DB, user, workspace.ID) {
		Fail(c, http.StatusForbidden, "workspace permission denied")
		return
	}
	var req workspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid workspace payload")
		return
	}
	updates := map[string]any{"updated_by": user.ID}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	updates["description"] = req.Description
	if err := h.DB.Model(&workspace).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update workspace failed")
		return
	}
	h.DB.First(&workspace, workspace.ID)
	audit(h.DB, user.ID, workspace.ID, 0, "workspace.update", "workspace", workspace.ID, "更新工作空间", nil)
	OK(c, workspace)
}

func (h WorkspaceHandler) Members(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	workspaceID, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if !canManageWorkspace(h.DB, user, workspaceID) {
		Fail(c, http.StatusForbidden, "workspace permission denied")
		return
	}
	var members []models.WorkspaceMember
	if err := h.DB.Preload("User").Where("workspace_id = ?", workspaceID).Order("role ASC, user_id ASC").Find(&members).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list workspace members failed")
		return
	}
	OK(c, members)
}

func (h WorkspaceHandler) UpsertMember(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	workspaceID, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if !canManageWorkspace(h.DB, user, workspaceID) {
		Fail(c, http.StatusForbidden, "workspace permission denied")
		return
	}
	var req memberRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == 0 || !models.ValidWorkspaceRole(req.Role) {
		Fail(c, http.StatusBadRequest, "userId and valid role are required")
		return
	}
	var member models.WorkspaceMember
	err := h.DB.Where("workspace_id = ? AND user_id = ?", workspaceID, req.UserID).First(&member).Error
	if err == gorm.ErrRecordNotFound {
		member = models.WorkspaceMember{WorkspaceID: workspaceID, UserID: req.UserID, Role: req.Role, CreatedBy: user.ID, UpdatedBy: user.ID}
		err = h.DB.Create(&member).Error
	} else if err == nil {
		err = h.DB.Model(&member).Updates(map[string]any{"role": req.Role, "updated_by": user.ID}).Error
	}
	if err != nil {
		Fail(c, http.StatusBadRequest, "upsert workspace member failed")
		return
	}
	h.DB.Preload("User").First(&member, member.ID)
	audit(h.DB, user.ID, workspaceID, 0, "workspace.member.upsert", "workspace", workspaceID, "更新工作空间成员", map[string]any{"userId": req.UserID, "role": req.Role})
	OK(c, member)
}

type ProjectHandler struct {
	DB *gorm.DB
}

type projectRequest struct {
	WorkspaceID uint   `json:"workspaceId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerID     uint   `json:"ownerId"`
}

func (h ProjectHandler) List(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	workspaceID, _ := parseUint(c.Query("workspaceId"))
	query := h.DB.Model(&models.Project{}).Preload("Workspace").Preload("Owner")
	if workspaceID > 0 {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	if user.Role != models.RoleAdmin {
		ids := accessibleProjectIDs(c, h.DB, workspaceID)
		if len(ids) == 0 {
			OK(c, []models.Project{})
			return
		}
		query = query.Where("id IN ?", ids)
	}
	var projects []models.Project
	if err := query.Order("updated_at DESC").Find(&projects).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list projects failed")
		return
	}
	OK(c, projects)
}

func (h ProjectHandler) Create(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var req projectRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.WorkspaceID == 0 || req.Name == "" {
		Fail(c, http.StatusBadRequest, "workspaceId and name are required")
		return
	}
	if !canManageWorkspace(h.DB, user, req.WorkspaceID) {
		Fail(c, http.StatusForbidden, "workspace permission denied")
		return
	}
	ownerID := req.OwnerID
	if ownerID == 0 {
		ownerID = user.ID
	}
	project := models.Project{WorkspaceID: req.WorkspaceID, Name: req.Name, Description: req.Description, OwnerID: ownerID, CreatedBy: user.ID, UpdatedBy: user.ID}
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&project).Error; err != nil {
			return err
		}
		return tx.Create(&models.ProjectMember{ProjectID: project.ID, UserID: ownerID, Role: models.WorkspaceRoleOwner, CreatedBy: user.ID, UpdatedBy: user.ID}).Error
	})
	if err != nil {
		Fail(c, http.StatusBadRequest, "create project failed")
		return
	}
	audit(h.DB, user.ID, req.WorkspaceID, project.ID, "project.create", "project", project.ID, "创建项目", nil)
	Created(c, project)
}

func (h ProjectHandler) Update(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	var project models.Project
	if err := h.DB.First(&project, c.Param("id")).Error; err != nil {
		Fail(c, http.StatusNotFound, "project not found")
		return
	}
	if !canManageProject(h.DB, user, project.ID) {
		Fail(c, http.StatusForbidden, "project permission denied")
		return
	}
	var req projectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, "invalid project payload")
		return
	}
	updates := map[string]any{"description": req.Description, "updated_by": user.ID}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.OwnerID != 0 {
		updates["owner_id"] = req.OwnerID
	}
	if err := h.DB.Model(&project).Updates(updates).Error; err != nil {
		Fail(c, http.StatusBadRequest, "update project failed")
		return
	}
	h.DB.Preload("Owner").First(&project, project.ID)
	audit(h.DB, user.ID, project.WorkspaceID, project.ID, "project.update", "project", project.ID, "更新项目", nil)
	OK(c, project)
}

func (h ProjectHandler) Members(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	projectID, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid project id")
		return
	}
	if !canManageProject(h.DB, user, projectID) {
		Fail(c, http.StatusForbidden, "project permission denied")
		return
	}
	var members []models.ProjectMember
	if err := h.DB.Preload("User").Where("project_id = ?", projectID).Order("role ASC, user_id ASC").Find(&members).Error; err != nil {
		Fail(c, http.StatusInternalServerError, "list project members failed")
		return
	}
	OK(c, members)
}

func (h ProjectHandler) UpsertMember(c *gin.Context) {
	user, _ := middleware.CurrentUser(c)
	projectID, ok := parseUint(c.Param("id"))
	if !ok {
		Fail(c, http.StatusBadRequest, "invalid project id")
		return
	}
	if !canManageProject(h.DB, user, projectID) {
		Fail(c, http.StatusForbidden, "project permission denied")
		return
	}
	var project models.Project
	if err := h.DB.First(&project, projectID).Error; err != nil {
		Fail(c, http.StatusNotFound, "project not found")
		return
	}
	var req memberRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == 0 || !models.ValidWorkspaceRole(req.Role) {
		Fail(c, http.StatusBadRequest, "userId and valid role are required")
		return
	}
	var member models.ProjectMember
	err := h.DB.Where("project_id = ? AND user_id = ?", projectID, req.UserID).First(&member).Error
	if err == gorm.ErrRecordNotFound {
		member = models.ProjectMember{ProjectID: projectID, UserID: req.UserID, Role: req.Role, CreatedBy: user.ID, UpdatedBy: user.ID}
		err = h.DB.Create(&member).Error
	} else if err == nil {
		err = h.DB.Model(&member).Updates(map[string]any{"role": req.Role, "updated_by": user.ID}).Error
	}
	if err != nil {
		Fail(c, http.StatusBadRequest, "upsert project member failed")
		return
	}
	h.DB.Preload("User").First(&member, member.ID)
	audit(h.DB, user.ID, project.WorkspaceID, project.ID, "project.member.upsert", "project", project.ID, "更新项目成员", map[string]any{"userId": req.UserID, "role": req.Role})
	OK(c, member)
}
