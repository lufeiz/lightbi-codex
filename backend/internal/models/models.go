package models

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Username     string         `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Email        *string        `gorm:"size:160;uniqueIndex" json:"email"`
	Phone        *string        `gorm:"size:32;uniqueIndex" json:"phone"`
	DisplayName  string         `gorm:"size:80;not null" json:"displayName"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	Role         UserRole       `gorm:"size:24;not null;index" json:"role"`
	Status       UserStatus     `gorm:"size:24;not null;index" json:"status"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

type Workspace struct {
	ID          uint              `gorm:"primaryKey" json:"id"`
	Name        string            `gorm:"size:160;not null;index" json:"name"`
	Description string            `gorm:"size:500" json:"description"`
	CreatedBy   uint              `gorm:"not null;default:0;index" json:"createdBy"`
	UpdatedBy   uint              `gorm:"not null;default:0;index" json:"updatedBy"`
	Members     []WorkspaceMember `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"members,omitempty"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt    `gorm:"index" json:"-"`
}

type WorkspaceMember struct {
	ID          uint          `gorm:"primaryKey" json:"id"`
	WorkspaceID uint          `gorm:"not null;uniqueIndex:idx_workspace_member" json:"workspaceId"`
	Workspace   Workspace     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	UserID      uint          `gorm:"not null;uniqueIndex:idx_workspace_member;index" json:"userId"`
	User        User          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user,omitempty"`
	Role        WorkspaceRole `gorm:"size:24;not null;index" json:"role"`
	CreatedBy   uint          `gorm:"not null;default:0" json:"createdBy"`
	UpdatedBy   uint          `gorm:"not null;default:0" json:"updatedBy"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}

type Project struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	WorkspaceID uint            `gorm:"not null;index" json:"workspaceId"`
	Workspace   Workspace       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"workspace,omitempty"`
	Name        string          `gorm:"size:160;not null;index" json:"name"`
	Description string          `gorm:"size:500" json:"description"`
	OwnerID     uint            `gorm:"not null;default:0;index" json:"ownerId"`
	Owner       User            `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	CreatedBy   uint            `gorm:"not null;default:0;index" json:"createdBy"`
	UpdatedBy   uint            `gorm:"not null;default:0;index" json:"updatedBy"`
	Members     []ProjectMember `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"members,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt  `gorm:"index" json:"-"`
}

type ProjectMember struct {
	ID        uint          `gorm:"primaryKey" json:"id"`
	ProjectID uint          `gorm:"not null;uniqueIndex:idx_project_member" json:"projectId"`
	Project   Project       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	UserID    uint          `gorm:"not null;uniqueIndex:idx_project_member;index" json:"userId"`
	User      User          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"user,omitempty"`
	Role      WorkspaceRole `gorm:"size:24;not null;index" json:"role"`
	CreatedBy uint          `gorm:"not null;default:0" json:"createdBy"`
	UpdatedBy uint          `gorm:"not null;default:0" json:"updatedBy"`
	CreatedAt time.Time     `json:"createdAt"`
	UpdatedAt time.Time     `json:"updatedAt"`
}

type Dataset struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	WorkspaceID   uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID     uint           `gorm:"not null;default:0;index" json:"projectId"`
	OwnerID       uint           `gorm:"not null;default:0;index" json:"ownerId"`
	Name          string         `gorm:"size:160;not null;index" json:"name"`
	Type          DatasetType    `gorm:"size:32;not null;index" json:"type"`
	Description   string         `gorm:"size:500" json:"description"`
	SourceName    string         `gorm:"size:120;not null" json:"sourceName"`
	DataSourceID  *uint          `gorm:"index" json:"dataSourceId"`
	DataSource    *DataSource    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"dataSource,omitempty"`
	QuerySQL      string         `gorm:"type:text" json:"querySql"`
	Fields        datatypes.JSON `gorm:"type:json" json:"fields"`
	CacheTTL      int            `gorm:"not null;default:300" json:"cacheTtl"`
	RefreshEvery  int            `gorm:"not null;default:0" json:"refreshEvery"`
	QueryTimeout  int            `gorm:"not null;default:10" json:"queryTimeout"`
	RowLimit      int            `gorm:"not null;default:500" json:"rowLimit"`
	Policy        datatypes.JSON `gorm:"type:json" json:"policy"`
	LastRefreshAt *time.Time     `json:"lastRefreshAt,omitempty"`
	Dimensions    datatypes.JSON `gorm:"type:json;not null" json:"dimensions"`
	Measures      datatypes.JSON `gorm:"type:json;not null" json:"measures"`
	Rows          datatypes.JSON `gorm:"type:json;not null" json:"rows"`
	CreatedBy     uint           `gorm:"not null;default:0;index" json:"createdBy"`
	UpdatedBy     uint           `gorm:"not null;default:0;index" json:"updatedBy"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type DataSource struct {
	ID                  uint             `gorm:"primaryKey" json:"id"`
	WorkspaceID         uint             `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID           uint             `gorm:"not null;default:0;index" json:"projectId"`
	OwnerID             uint             `gorm:"not null;default:0;index" json:"ownerId"`
	Name                string           `gorm:"size:160;not null;index" json:"name"`
	Type                DataSourceType   `gorm:"size:32;not null;index" json:"type"`
	Status              DataSourceStatus `gorm:"size:24;not null;index" json:"status"`
	Description         string           `gorm:"size:500" json:"description"`
	Host                string           `gorm:"size:255;not null" json:"host"`
	Port                int              `gorm:"not null" json:"port"`
	DatabaseName        string           `gorm:"size:160;not null" json:"databaseName"`
	Username            string           `gorm:"size:160;not null" json:"username"`
	PasswordCiphertext  string           `gorm:"type:text" json:"-"`
	SSLMode             string           `gorm:"size:40" json:"sslMode"`
	Params              datatypes.JSON   `gorm:"type:json" json:"params"`
	MaxOpenConns        int              `gorm:"not null;default:5" json:"maxOpenConns"`
	MaxIdleConns        int              `gorm:"not null;default:2" json:"maxIdleConns"`
	ConnMaxLifetimeSecs int              `gorm:"not null;default:300" json:"connMaxLifetimeSecs"`
	CreatedBy           uint             `gorm:"not null;index" json:"createdBy"`
	UpdatedBy           uint             `gorm:"not null;index" json:"updatedBy"`
	CreatedAt           time.Time        `json:"createdAt"`
	UpdatedAt           time.Time        `json:"updatedAt"`
	DeletedAt           gorm.DeletedAt   `gorm:"index" json:"-"`
}

type DatasetQueryCache struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	DatasetID uint           `gorm:"not null;index;uniqueIndex:idx_dataset_query_cache" json:"datasetId"`
	CacheKey  string         `gorm:"size:80;not null;uniqueIndex:idx_dataset_query_cache" json:"cacheKey"`
	Result    datatypes.JSON `gorm:"type:json;not null" json:"result"`
	ExpiresAt time.Time      `gorm:"not null;index" json:"expiresAt"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

type DatasetQueryLog struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	DatasetID      uint           `gorm:"not null;index" json:"datasetId"`
	WorkspaceID    uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID      uint           `gorm:"not null;default:0;index" json:"projectId"`
	DataSourceID   *uint          `gorm:"index" json:"dataSourceId,omitempty"`
	Status         string         `gorm:"size:24;not null;index" json:"status"`
	Cached         bool           `gorm:"not null;default:false" json:"cached"`
	DurationMs     int64          `gorm:"not null;default:0" json:"durationMs"`
	RowCount       int            `gorm:"not null;default:0" json:"rowCount"`
	Limit          int            `gorm:"not null;default:0" json:"limit"`
	QueryHash      string         `gorm:"size:80;not null;index" json:"queryHash"`
	ErrorMessage   string         `gorm:"size:500" json:"errorMessage"`
	RequestSummary datatypes.JSON `gorm:"type:json" json:"requestSummary"`
	CreatedAt      time.Time      `json:"createdAt"`
}

type SchemaMigration struct {
	Version   string    `gorm:"size:80;primaryKey" json:"version"`
	Name      string    `gorm:"size:160;not null" json:"name"`
	AppliedAt time.Time `gorm:"not null;index" json:"appliedAt"`
}

type RefreshToken struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"not null;index" json:"userId"`
	User      User       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	TokenHash string     `gorm:"size:128;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expiresAt"`
	RevokedAt *time.Time `gorm:"index" json:"revokedAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

type ChartGroup struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	OwnerID     uint           `gorm:"not null;default:0;index" json:"ownerId"`
	ParentID    *uint          `gorm:"index" json:"parentId"`
	Parent      *ChartGroup    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"-"`
	Name        string         `gorm:"size:120;not null" json:"name"`
	SortOrder   int            `gorm:"not null;default:0" json:"sortOrder"`
	CreatedBy   uint           `gorm:"not null;index" json:"createdBy"`
	UpdatedBy   uint           `gorm:"not null;index" json:"updatedBy"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type ChartTag struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	OwnerID     uint           `gorm:"not null;default:0;index" json:"ownerId"`
	Name        string         `gorm:"size:80;uniqueIndex;not null" json:"name"`
	Color       string         `gorm:"size:24;not null;default:'#1677ff'" json:"color"`
	CreatedBy   uint           `gorm:"not null;index" json:"createdBy"`
	UpdatedBy   uint           `gorm:"not null;index" json:"updatedBy"`
	Charts      []Chart        `gorm:"many2many:chart_tag_relations" json:"-"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type Chart struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	OwnerID     uint           `gorm:"not null;default:0;index" json:"ownerId"`
	Name        string         `gorm:"size:160;not null;index" json:"name"`
	Description string         `gorm:"size:500" json:"description"`
	Type        ChartType      `gorm:"size:40;not null;index" json:"type"`
	Status      ChartStatus    `gorm:"size:32;not null;index" json:"status"`
	GroupID     *uint          `gorm:"index" json:"groupId"`
	Group       *ChartGroup    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"group,omitempty"`
	Config      datatypes.JSON `gorm:"type:json;not null" json:"config"`
	Tags        []ChartTag     `gorm:"many2many:chart_tag_relations" json:"tags"`
	CreatedBy   uint           `gorm:"not null;index" json:"createdBy"`
	UpdatedBy   uint           `gorm:"not null;index" json:"updatedBy"`
	Creator     User           `gorm:"foreignKey:CreatedBy" json:"creator"`
	Updater     User           `gorm:"foreignKey:UpdatedBy" json:"updater"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type ChartVersion struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	ChartID     uint           `gorm:"not null;index;uniqueIndex:idx_chart_version_number" json:"chartId"`
	Chart       Chart          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	Version     int            `gorm:"not null;uniqueIndex:idx_chart_version_number" json:"version"`
	Name        string         `gorm:"size:160;not null" json:"name"`
	Description string         `gorm:"size:500" json:"description"`
	Type        ChartType      `gorm:"size:40;not null" json:"type"`
	Config      datatypes.JSON `gorm:"type:json;not null" json:"config"`
	PublishedBy uint           `gorm:"not null;default:0;index" json:"publishedBy"`
	Publisher   User           `gorm:"foreignKey:PublishedBy" json:"publisher,omitempty"`
	CreatedAt   time.Time      `json:"createdAt"`
}

type AuditLog struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	ActorID     uint           `gorm:"not null;default:0;index" json:"actorId"`
	Actor       User           `gorm:"foreignKey:ActorID" json:"actor,omitempty"`
	Action      string         `gorm:"size:80;not null;index" json:"action"`
	ObjectType  string         `gorm:"size:80;not null;index" json:"objectType"`
	ObjectID    uint           `gorm:"not null;index" json:"objectId"`
	Summary     string         `gorm:"size:500" json:"summary"`
	Metadata    datatypes.JSON `gorm:"type:json" json:"metadata"`
	CreatedAt   time.Time      `json:"createdAt"`
}

type DashboardShareLink struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	ChartID     uint           `gorm:"not null;index" json:"chartId"`
	Chart       Chart          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	WorkspaceID uint           `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint           `gorm:"not null;default:0;index" json:"projectId"`
	Name        string         `gorm:"size:160;not null" json:"name"`
	TokenHash   string         `gorm:"size:128;not null;uniqueIndex" json:"-"`
	TokenPrefix string         `gorm:"size:16;not null;index" json:"tokenPrefix"`
	Enabled     bool           `gorm:"not null;default:true" json:"enabled"`
	AllowEmbed  bool           `gorm:"not null;default:false" json:"allowEmbed"`
	ExpiresAt   *time.Time     `json:"expiresAt,omitempty"`
	CreatedBy   uint           `gorm:"not null;default:0;index" json:"createdBy"`
	UpdatedBy   uint           `gorm:"not null;default:0;index" json:"updatedBy"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type DashboardSubscription struct {
	ID          uint                  `gorm:"primaryKey" json:"id"`
	ChartID     uint                  `gorm:"not null;index" json:"chartId"`
	Chart       Chart                 `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	WorkspaceID uint                  `gorm:"not null;default:0;index" json:"workspaceId"`
	ProjectID   uint                  `gorm:"not null;default:0;index" json:"projectId"`
	Name        string                `gorm:"size:160;not null" json:"name"`
	Format      SubscriptionFormat    `gorm:"size:16;not null;index" json:"format"`
	Frequency   SubscriptionFrequency `gorm:"size:24;not null;index" json:"frequency"`
	Enabled     bool                  `gorm:"not null;default:true" json:"enabled"`
	NextRunAt   *time.Time            `json:"nextRunAt,omitempty"`
	LastRunAt   *time.Time            `json:"lastRunAt,omitempty"`
	LastStatus  string                `gorm:"size:40" json:"lastStatus"`
	LastResult  datatypes.JSON        `gorm:"type:json" json:"lastResult"`
	CreatedBy   uint                  `gorm:"not null;default:0;index" json:"createdBy"`
	UpdatedBy   uint                  `gorm:"not null;default:0;index" json:"updatedBy"`
	CreatedAt   time.Time             `json:"createdAt"`
	UpdatedAt   time.Time             `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt        `gorm:"index" json:"-"`
}
