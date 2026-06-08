# Schema/API Rules

## 目标

保证前端图表配置、数据源、数据集查询、后端接口和发布治理之间的协议稳定，降低跨端变更和历史配置兼容成本。

## 1. ChartDocument 规则

- 新保存的 Dashboard config 必须是 `ChartDocument.version = 2`。
- `widgets` 必须是数组，单个 Dashboard widget 数量不得超过当前前后端共同限制。
- 每个 widget 的 `id` 必须稳定，不能用数组 index 作为业务标识。
- `x`、`y`、`width`、`height` 必须是有限数字，width/height 必须大于 0。
- `type` 必须同时被前端 `ChartType` 和后端 `ValidChartType` 支持。
- `filters` 必须保持向后兼容；旧字段需要通过 normalize 迁移到新结构。

## 2. ChartConfig 规则

- `dimensions`、`measures` 必须是字符串数组。
- 字段引用必须去重、去空、限制长度和数量。
- `query` 必须表达维度、指标、过滤、排序、limit 和 timeComparison，不能只依赖 UI 状态。
- `fieldLabels` 只做展示名映射，不能替代稳定字段名。
- `previewRows` 属于 deprecated runtime snapshot，新保存必须剥离。
- `textHtml` 必须 sanitize；富文本不能绕过前后端清洗。

## 3. Dataset API 规则

- 图表数据请求必须走 `DatasetQueryRequest`，不能让 renderer 直接请求业务接口。
- API 返回必须提供稳定 `columns.name` 和业务含义，不能只依赖展示名。
- 字段元信息必须包含 name、label、type、role。
- 大数据接口必须支持 limit，必要时支持分页、筛选、排序或聚合。
- 错误信息必须能区分无权限、无数据、查询失败、字段不存在和 schema 不兼容。
- SQL 数据集必须继续做只读校验、参数绑定、查询超时、并发闸门和审计日志。

## 4. 发布/分享 API 规则

- 发布版本必须保存当时的 chart config 快照。
- 分享和嵌入访问必须校验 share link enabled、allowEmbed、expiresAt。
- 发布页 runtimeRows 必须由后端基于 widget config 和 dataset query 生成。
- 导出必须尊重 widgetId、权限、字段和数据量限制。
- 回滚版本必须写审计日志，并确保回滚后的 config 仍能通过 normalize。

## 5. 联动/filter 规则

- 图表不直接调用其他图表。
- 图表只消费统一 `DashboardFilters`。
- 维度筛选必须支持 `chartIds` 和 `fieldsByChart`。
- 只有字段匹配且配置了影响范围的 widget 才刷新。
- 时间筛选必须能找到明确 time field；找不到时不能误过滤全部数据。
- 高频联动必须合并触发。

## 6. Schema 变更流程

任何 schema/API 变更必须说明：

1. 变更字段。
2. 默认值。
3. 旧配置兼容方式。
4. 前端校验变更。
5. 后端 normalize 变更。
6. 是否需要数据库迁移。
7. 是否影响发布版本、分享、嵌入、导出。
8. 验证命令和测试覆盖。

## 7. 当前项目必守代码锚点

- `frontend/src/types/domain.ts`
- `frontend/src/store/designerStore.ts`
- `frontend/src/features/charts/chartConfigValidation.ts`
- `frontend/src/features/charts/ChartConfigPanel.tsx`
- `backend/internal/handlers/chart_config.go`
- `backend/internal/handlers/dashboard_handler.go`
- `backend/internal/services/dataset_query.go`
