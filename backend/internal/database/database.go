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
		return refreshDatasets(db)
	}

	if err := db.Where("1 = 1").Delete(&models.Dataset{}).Error; err != nil {
		return err
	}

	standardProfiles := standardDatasetProfiles()
	directProfiles := directDatasetProfiles()

	for i := 1; i <= 20; i++ {
		profile := standardProfiles[(i-1)%len(standardProfiles)]
		if err := db.Create(&models.Dataset{
			Name:        fmt.Sprintf("%s %02d", profile.NamePrefix, i),
			Type:        models.DatasetTypeStandard,
			Description: profile.Description,
			SourceName:  fmt.Sprintf("%s_%02d", profile.SourcePrefix, i),
			Dimensions:  mustJSON(profile.Dimensions),
			Measures:    mustJSON(profile.Measures),
			Rows:        mustJSON(profile.Rows(i)),
		}).Error; err != nil {
			return err
		}
	}

	for i := 1; i <= 20; i++ {
		profile := directProfiles[(i-1)%len(directProfiles)]
		if err := db.Create(&models.Dataset{
			Name:        fmt.Sprintf("%s %02d", profile.NamePrefix, i),
			Type:        models.DatasetTypeDirect,
			Description: profile.Description,
			SourceName:  fmt.Sprintf("%s_%02d", profile.SourcePrefix, i),
			Dimensions:  mustJSON(profile.Dimensions),
			Measures:    mustJSON(profile.Measures),
			Rows:        mustJSON(profile.Rows(i + 20)),
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

func refreshDatasets(db *gorm.DB) error {
	var datasets []models.Dataset
	if err := db.Order("id ASC").Find(&datasets).Error; err != nil {
		return err
	}
	standardProfiles := standardDatasetProfiles()
	directProfiles := directDatasetProfiles()
	standardIndex := 0
	directIndex := 0
	for _, dataset := range datasets {
		var profile datasetProfile
		displayIndex := 0
		seed := 0
		if dataset.Type == models.DatasetTypeDirect {
			directIndex++
			profile = directProfiles[(directIndex-1)%len(directProfiles)]
			displayIndex = directIndex
			seed = directIndex + 20
		} else {
			standardIndex++
			profile = standardProfiles[(standardIndex-1)%len(standardProfiles)]
			displayIndex = standardIndex
			seed = standardIndex
		}
		updates := map[string]interface{}{
			"name":        fmt.Sprintf("%s %02d", profile.NamePrefix, displayIndex),
			"description": profile.Description,
			"source_name": fmt.Sprintf("%s_%02d", profile.SourcePrefix, displayIndex),
			"dimensions":  mustJSON(profile.Dimensions),
			"measures":    mustJSON(profile.Measures),
			"rows":        mustJSON(profile.Rows(seed)),
		}
		if err := db.Model(&dataset).Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}

type datasetProfile struct {
	NamePrefix   string
	Description  string
	SourcePrefix string
	Dimensions   []map[string]string
	Measures     []map[string]string
	Rows         func(seed int) []map[string]interface{}
}

func standardDatasetProfiles() []datasetProfile {
	return []datasetProfile{
		{
			NamePrefix:   "标准销售主题数据集",
			Description:  "治理后的销售经营主题数据集，包含区域、渠道和产品维度。",
			SourcePrefix: "standard_sales_mart",
			Dimensions: []map[string]string{
				field("businessLine", "业务线", "string"),
				field("salesRegion", "销售区域", "string"),
				field("salesMonth", "销售月份", "string"),
				field("productLine", "产品线", "string"),
			},
			Measures: []map[string]string{
				field("revenue", "销售收入", "number"),
				field("grossProfit", "毛利润", "number"),
				field("orderCount", "订单量", "number"),
				field("conversionRate", "转化率", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(32, func(index int) map[string]interface{} {
					base := 120 + seed*8 + index*11
					return map[string]interface{}{
						"businessLine":   pick([]string{"企业服务", "零售电商", "渠道分销", "行业解决方案"}, seed+index),
						"salesRegion":    pick([]string{"华东", "华南", "华北", "西南", "海外"}, index),
						"salesMonth":     fmt.Sprintf("%d月", index%12+1),
						"productLine":    pick([]string{"标准版", "专业版", "旗舰版", "插件服务"}, index+seed),
						"revenue":        base * 10,
						"grossProfit":    base*4 + seed*9,
						"orderCount":     base/2 + index*3,
						"conversionRate": 18 + (seed+index)%17,
					}
				})
			},
		},
		{
			NamePrefix:   "标准用户增长数据集",
			Description:  "治理后的用户增长主题数据集，覆盖渠道、平台和会员层级。",
			SourcePrefix: "standard_growth_mart",
			Dimensions: []map[string]string{
				field("acquireChannel", "获客渠道", "string"),
				field("cohortMonth", "同期群月份", "string"),
				field("memberTier", "会员等级", "string"),
				field("devicePlatform", "设备平台", "string"),
			},
			Measures: []map[string]string{
				field("newUsers", "新增用户", "number"),
				field("activeUsers", "活跃用户", "number"),
				field("retentionRate", "留存率", "number"),
				field("acquireCost", "获客成本", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(30, func(index int) map[string]interface{} {
					base := 80 + seed*6 + index*9
					return map[string]interface{}{
						"acquireChannel": pick([]string{"自然搜索", "信息流", "直播", "老客推荐", "联盟"}, index),
						"cohortMonth":    fmt.Sprintf("%d月", index%12+1),
						"memberTier":     pick([]string{"普通会员", "银卡会员", "金卡会员", "企业会员"}, seed+index),
						"devicePlatform": pick([]string{"iOS", "Android", "Web", "小程序"}, index+2),
						"newUsers":       base * 3,
						"activeUsers":    base*8 + index*13,
						"retentionRate":  32 + (seed+index)%26,
						"acquireCost":    40 + seed + index%9,
					}
				})
			},
		},
		{
			NamePrefix:   "标准供应链履约数据集",
			Description:  "治理后的供应链履约主题数据集，适合看仓配、承运商和供应商表现。",
			SourcePrefix: "standard_fulfillment_mart",
			Dimensions: []map[string]string{
				field("warehouse", "仓库", "string"),
				field("supplierLevel", "供应商等级", "string"),
				field("shipMonth", "发货月份", "string"),
				field("carrier", "承运商", "string"),
			},
			Measures: []map[string]string{
				field("shipmentCount", "发货单量", "number"),
				field("onTimeRate", "准时率", "number"),
				field("stockoutCount", "缺货次数", "number"),
				field("turnoverDays", "周转天数", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(28, func(index int) map[string]interface{} {
					base := 50 + seed*5 + index*7
					return map[string]interface{}{
						"warehouse":     pick([]string{"上海仓", "广州仓", "天津仓", "成都仓", "武汉仓"}, index),
						"supplierLevel": pick([]string{"A级", "B级", "C级", "战略供应商"}, seed+index),
						"shipMonth":     fmt.Sprintf("%d月", index%12+1),
						"carrier":       pick([]string{"顺丰", "京东物流", "跨越", "德邦"}, index+1),
						"shipmentCount": base * 6,
						"onTimeRate":    72 + (seed+index)%21,
						"stockoutCount": index%5 + seed%4,
						"turnoverDays":  8 + (index+seed)%12,
					}
				})
			},
		},
		{
			NamePrefix:   "标准财务预算数据集",
			Description:  "治理后的财务预算主题数据集，覆盖成本中心、费用类型和项目阶段。",
			SourcePrefix: "standard_finance_mart",
			Dimensions: []map[string]string{
				field("costCenter", "成本中心", "string"),
				field("budgetCycle", "预算周期", "string"),
				field("expenseType", "费用类型", "string"),
				field("projectStage", "项目阶段", "string"),
			},
			Measures: []map[string]string{
				field("budgetAmount", "预算金额", "number"),
				field("actualAmount", "实际金额", "number"),
				field("varianceAmount", "偏差金额", "number"),
				field("usageRate", "预算使用率", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(30, func(index int) map[string]interface{} {
					budget := 200 + seed*12 + index*15
					actual := budget - 30 + (index%7)*12
					return map[string]interface{}{
						"costCenter":     pick([]string{"研发中心", "营销中心", "交付中心", "职能平台"}, index),
						"budgetCycle":    fmt.Sprintf("2026-Q%d", index%4+1),
						"expenseType":    pick([]string{"人力", "云资源", "市场", "差旅", "采购"}, seed+index),
						"projectStage":   pick([]string{"立项", "交付", "验收", "运营"}, index+2),
						"budgetAmount":   budget * 100,
						"actualAmount":   actual * 100,
						"varianceAmount": (actual - budget) * 100,
						"usageRate":      65 + (index+seed)%28,
					}
				})
			},
		},
	}
}

func directDatasetProfiles() []datasetProfile {
	return []datasetProfile{
		{
			NamePrefix:   "直连订单库数据集",
			Description:  "来自订单业务库的直连查询数据集，字段贴近交易明细。",
			SourcePrefix: "direct_order_query",
			Dimensions: []map[string]string{
				field("orderStatus", "订单状态", "string"),
				field("cityTier", "城市等级", "string"),
				field("payChannel", "支付渠道", "string"),
				field("orderDate", "下单日期", "date"),
			},
			Measures: []map[string]string{
				field("paidAmount", "支付金额", "number"),
				field("refundAmount", "退款金额", "number"),
				field("itemCount", "商品件数", "number"),
				field("avgOrderValue", "客单价", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(34, func(index int) map[string]interface{} {
					base := 90 + seed*4 + index*10
					return map[string]interface{}{
						"orderStatus":   pick([]string{"已支付", "已发货", "已退款", "已关闭"}, index),
						"cityTier":      pick([]string{"一线", "新一线", "二线", "三线及以下"}, seed+index),
						"payChannel":    pick([]string{"微信", "支付宝", "企业转账", "信用卡"}, index+1),
						"orderDate":     dateValue(index),
						"paidAmount":    base * 8,
						"refundAmount":  (index%5 + seed%3) * 20,
						"itemCount":     1 + (index+seed)%8,
						"avgOrderValue": 120 + (base % 90),
					}
				})
			},
		},
		{
			NamePrefix:   "直连客服工单数据集",
			Description:  "来自客服系统的直连查询数据集，适合分析工单效率和满意度。",
			SourcePrefix: "direct_ticket_query",
			Dimensions: []map[string]string{
				field("ticketType", "工单类型", "string"),
				field("priority", "优先级", "string"),
				field("agentGroup", "坐席组", "string"),
				field("openedWeek", "创建周", "string"),
			},
			Measures: []map[string]string{
				field("ticketCount", "工单数", "number"),
				field("firstResponseMinutes", "首响分钟", "number"),
				field("resolutionHours", "解决小时", "number"),
				field("satisfactionScore", "满意度", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(30, func(index int) map[string]interface{} {
					base := 25 + seed + index*4
					return map[string]interface{}{
						"ticketType":           pick([]string{"咨询", "投诉", "售后", "技术支持"}, index),
						"priority":             pick([]string{"P0", "P1", "P2", "P3"}, seed+index),
						"agentGroup":           pick([]string{"华东组", "华南组", "企业组", "夜班组"}, index+1),
						"openedWeek":           fmt.Sprintf("第%d周", index%12+1),
						"ticketCount":          base,
						"firstResponseMinutes": 3 + (seed+index)%18,
						"resolutionHours":      2 + (index+seed)%16,
						"satisfactionScore":    78 + (index+seed)%20,
					}
				})
			},
		},
		{
			NamePrefix:   "直连设备日志数据集",
			Description:  "来自埋点日志库的直连查询数据集，覆盖设备、版本和错误码。",
			SourcePrefix: "direct_device_log_query",
			Dimensions: []map[string]string{
				field("deviceModel", "设备型号", "string"),
				field("appVersion", "应用版本", "string"),
				field("eventDay", "事件日期", "date"),
				field("errorCode", "错误码", "string"),
			},
			Measures: []map[string]string{
				field("eventCount", "事件数", "number"),
				field("crashCount", "崩溃次数", "number"),
				field("avgLatency", "平均延迟", "number"),
				field("successRate", "成功率", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(36, func(index int) map[string]interface{} {
					base := 180 + seed*5 + index*12
					return map[string]interface{}{
						"deviceModel": pick([]string{"iPhone 15", "Mate 60", "Pixel 9", "Galaxy S25", "iPad"}, index),
						"appVersion":  pick([]string{"5.8.0", "5.8.1", "5.9.0", "6.0.0"}, seed+index),
						"eventDay":    dateValue(index),
						"errorCode":   pick([]string{"OK", "E_CONN", "E_AUTH", "E_TIMEOUT"}, index+2),
						"eventCount":  base * 12,
						"crashCount":  index % 6,
						"avgLatency":  60 + (seed+index)%90,
						"successRate": 88 + (index+seed)%10,
					}
				})
			},
		},
		{
			NamePrefix:   "直连门店交易数据集",
			Description:  "来自门店 POS 库的直连查询数据集，适合看门店班次和会员交易。",
			SourcePrefix: "direct_store_pos_query",
			Dimensions: []map[string]string{
				field("storeName", "门店", "string"),
				field("storeRegion", "门店区域", "string"),
				field("shiftName", "班次", "string"),
				field("cashierGroup", "收银组", "string"),
			},
			Measures: []map[string]string{
				field("transactionAmount", "交易金额", "number"),
				field("visitorCount", "到店客流", "number"),
				field("memberOrders", "会员订单", "number"),
				field("discountAmount", "优惠金额", "number"),
			},
			Rows: func(seed int) []map[string]interface{} {
				return rows(32, func(index int) map[string]interface{} {
					base := 70 + seed*3 + index*8
					return map[string]interface{}{
						"storeName":         pick([]string{"人民广场店", "珠江新城店", "国贸店", "春熙路店", "滨江店"}, index),
						"storeRegion":       pick([]string{"华东", "华南", "华北", "西南"}, seed+index),
						"shiftName":         pick([]string{"早班", "中班", "晚班"}, index+1),
						"cashierGroup":      pick([]string{"A组", "B组", "C组", "机动组"}, index+2),
						"transactionAmount": base * 9,
						"visitorCount":      base + index*2,
						"memberOrders":      base/2 + seed,
						"discountAmount":    (index%6 + 1) * 18,
					}
				})
			},
		},
	}
}

func rows(count int, build func(index int) map[string]interface{}) []map[string]interface{} {
	items := make([]map[string]interface{}, 0, count)
	for index := 0; index < count; index++ {
		items = append(items, build(index))
	}
	return items
}

func field(name string, label string, fieldType string) map[string]string {
	return map[string]string{"name": name, "label": label, "type": fieldType}
}

func pick(values []string, index int) string {
	return values[index%len(values)]
}

func dateValue(index int) string {
	return fmt.Sprintf("2026-%02d-%02d", index%12+1, index%26+1)
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
