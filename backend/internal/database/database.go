package database

import (
	"encoding/json"
	"fmt"

	"gorm.io/datatypes"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"lightbi/backend/internal/config"
	"lightbi/backend/internal/models"
	"lightbi/backend/internal/services"
)

func Connect(cfg config.Config) (*gorm.DB, error) {
	return gorm.Open(mysql.Open(cfg.MySQLDSN), &gorm.Config{})
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.RefreshToken{},
		&models.Dataset{},
		&models.ChartGroup{},
		&models.ChartTag{},
		&models.Chart{},
	)
}

func SeedDefaults(db *gorm.DB, cfg config.Config) error {
	if err := seedUsers(db, cfg); err != nil {
		return err
	}
	return seedDatasets(db)
}

func seedUsers(db *gorm.DB, cfg config.Config) error {
	accounts := []struct {
		Username    string
		DisplayName string
		Email       *string
		Phone       *string
		Role        models.UserRole
	}{
		{Username: "admin", DisplayName: "系统管理员", Email: strPtr("admin@lightbi.local"), Role: models.RoleAdmin},
		{Username: "editor", DisplayName: "分析编辑员", Email: strPtr("editor@lightbi.local"), Phone: strPtr("13800000001"), Role: models.RoleEditor},
		{Username: "viewer", DisplayName: "只读观察员", Email: strPtr("viewer@lightbi.local"), Phone: strPtr("13800000002"), Role: models.RoleViewer},
	}

	for _, account := range accounts {
		var existing models.User
		err := db.Where("username = ?", account.Username).First(&existing).Error
		if err == nil {
			updates := map[string]interface{}{
				"display_name": account.DisplayName,
				"email":        account.Email,
				"phone":        account.Phone,
				"role":         account.Role,
				"status":       models.UserStatusActive,
			}
			if err := db.Model(&existing).Updates(updates).Error; err != nil {
				return err
			}
			continue
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}

		passwordHash, err := services.HashPassword(cfg.SeedAdminPassword)
		if err != nil {
			return err
		}
		user := models.User{
			Username:     account.Username,
			Email:        account.Email,
			Phone:        account.Phone,
			DisplayName:  account.DisplayName,
			PasswordHash: passwordHash,
			Role:         account.Role,
			Status:       models.UserStatusActive,
		}
		if err := db.Create(&user).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedDatasets(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.Dataset{}).Count(&count).Error; err != nil {
		return err
	}
	if count >= 40 {
		return refreshDatasetRows(db)
	}

	if err := db.Where("1 = 1").Delete(&models.Dataset{}).Error; err != nil {
		return err
	}

	dimensions := []map[string]string{
		{"name": "category", "label": "业务域", "type": "string"},
		{"name": "region", "label": "区域", "type": "string"},
		{"name": "month", "label": "月份", "type": "string"},
		{"name": "product", "label": "产品线", "type": "string"},
	}
	measures := []map[string]string{
		{"name": "value", "label": "销售额", "type": "number"},
		{"name": "lastYear", "label": "去年同期", "type": "number"},
		{"name": "profit", "label": "利润", "type": "number"},
		{"name": "orders", "label": "订单数", "type": "number"},
	}

	for i := 1; i <= 20; i++ {
		if err := db.Create(&models.Dataset{
			Name:        fmt.Sprintf("标准经营数据集 %02d", i),
			Type:        models.DatasetTypeStandard,
			Description: "来自治理后的标准主题数据集，适合常规 BI 图表配置。",
			SourceName:  fmt.Sprintf("standard_mart_%02d", i),
			Dimensions:  mustJSON(dimensions),
			Measures:    mustJSON(measures),
			Rows:        mustJSON(mockRows(i, "标准")),
		}).Error; err != nil {
			return err
		}
	}

	for i := 1; i <= 20; i++ {
		if err := db.Create(&models.Dataset{
			Name:        fmt.Sprintf("直连业务库数据集 %02d", i),
			Type:        models.DatasetTypeDirect,
			Description: "来自业务库直连查询的数据集，适合快速验证和临时分析。",
			SourceName:  fmt.Sprintf("direct_mysql_query_%02d", i),
			Dimensions:  mustJSON(dimensions),
			Measures:    mustJSON(measures),
			Rows:        mustJSON(mockRows(i+20, "直连")),
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

func refreshDatasetRows(db *gorm.DB) error {
	var datasets []models.Dataset
	if err := db.Order("id ASC").Find(&datasets).Error; err != nil {
		return err
	}
	standardIndex := 0
	directIndex := 0
	for _, dataset := range datasets {
		prefix := "标准"
		seed := standardIndex + 1
		standardIndex++
		if dataset.Type == models.DatasetTypeDirect {
			directIndex++
			prefix = "直连"
			seed = directIndex + 20
		}
		if err := db.Model(&dataset).Update("rows", mustJSON(mockRows(seed, prefix))).Error; err != nil {
			return err
		}
	}
	return nil
}

func mockRows(seed int, prefix string) []map[string]interface{} {
	regions := []string{"华东", "华南", "华北", "西南", "西北", "东北", "华中", "海外"}
	products := []string{"仪表盘", "报表", "数据集", "分析页", "移动看板", "指标平台", "数据门户", "告警中心"}
	rows := make([]map[string]interface{}, 0, 24)
	for index := 0; index < 24; index++ {
		region := regions[index%len(regions)]
		value := 60 + seed*7 + index*13
		rows = append(rows, map[string]interface{}{
			"category": fmt.Sprintf("%s场景%d", prefix, index+1),
			"region":   region,
			"month":    fmt.Sprintf("%d月", index%12+1),
			"product":  products[index%len(products)],
			"value":    value,
			"lastYear": value - 12 - index,
			"profit":   value/3 + seed,
			"orders":   value*2 + index*11,
		})
	}
	return rows
}

func mustJSON(value interface{}) datatypes.JSON {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return datatypes.JSON(raw)
}

func strPtr(value string) *string {
	return &value
}
