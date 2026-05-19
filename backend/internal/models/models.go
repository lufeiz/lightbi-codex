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

type Dataset struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:160;not null;index" json:"name"`
	Type        DatasetType    `gorm:"size:32;not null;index" json:"type"`
	Description string         `gorm:"size:500" json:"description"`
	SourceName  string         `gorm:"size:120;not null" json:"sourceName"`
	Dimensions  datatypes.JSON `gorm:"type:json;not null" json:"dimensions"`
	Measures    datatypes.JSON `gorm:"type:json;not null" json:"measures"`
	Rows        datatypes.JSON `gorm:"type:json;not null" json:"rows"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
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
	ID        uint           `gorm:"primaryKey" json:"id"`
	ParentID  *uint          `gorm:"index" json:"parentId"`
	Parent    *ChartGroup    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"-"`
	Name      string         `gorm:"size:120;not null" json:"name"`
	SortOrder int            `gorm:"not null;default:0" json:"sortOrder"`
	CreatedBy uint           `gorm:"not null;index" json:"createdBy"`
	UpdatedBy uint           `gorm:"not null;index" json:"updatedBy"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type ChartTag struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:80;uniqueIndex;not null" json:"name"`
	Color     string         `gorm:"size:24;not null;default:'#1677ff'" json:"color"`
	CreatedBy uint           `gorm:"not null;index" json:"createdBy"`
	UpdatedBy uint           `gorm:"not null;index" json:"updatedBy"`
	Charts    []Chart        `gorm:"many2many:chart_tag_relations" json:"-"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Chart struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
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
