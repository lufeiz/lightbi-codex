# Chart Online Issue Diagnosis Skill

## 触发场景

线上或测试环境出现以下问题时使用本 Skill：

- 某个图表空白、白屏、局部渲染失败。
- 图表数据和数据集预览、表格或导出数据不一致。
- 筛选后图表不更新，或刷新了不该刷新的图表。
- 发布页、分享页、嵌入页展示异常。
- 配置保存后再次打开失败。
- 某次发布后历史 Dashboard 打不开。
- 回滚版本后图表类型、字段或数据异常。

## 目标

先定位影响范围，再判断问题属于 schema、数据源、字段映射、runtimeRows、renderer、联动、权限还是发布治理。不要把所有问题都归为“图表渲染失败”。

## 快速止血

按影响范围选择：

- 单个 widget 异常：降级为空态或错误态，避免拖垮整个 Dashboard。
- 单个图表类型异常：临时隐藏入口或回滚到旧渲染逻辑。
- 发布页异常：回滚 chart version 或禁用异常 share link/embed。
- 数据异常：暂停对应 dataset refresh/query，保留审计日志。
- 权限异常：先关闭公开分享或嵌入访问，再查 RBAC 和 share token。

## 标准流程

### 1. 定位影响范围

记录：

| 信息 | 示例 |
|---|---|
| 环境 | production / staging / local |
| 页面 | 编辑器 / 发布页 / 分享页 / 嵌入页 / 导出 |
| chartId | 123 |
| versionId | 45 |
| widgetId | widget_xxx |
| chartType | line / pivotTable / metricCard |
| datasetId | 67 |
| workspaceId / projectId | 权限和隔离排查必需 |
| 复现账号/角色 | admin / editor / viewer / public |

### 2. 判断层级

| 层级 | 常见表现 | 检查文件 |
|---|---|---|
| schema | 保存失败、历史配置打不开、字段缺失 | `domain.ts`、`chartConfigValidation.ts`、`chart_config.go` |
| 数据源/数据集 | query 失败、rows 为空、字段类型异常 | `ChartConfigPanel.tsx`、`dataset_query.go` |
| runtimeRows | 编辑器有数据但发布页无数据，或旧 `previewRows` 失效 | `designerStore.ts`、`dashboard_handler.go` |
| renderer | 某类型空白、G2/S2 加载失败、option 转换失败 | `ChartRenderer.tsx` |
| 联动/filter | 筛选不生效、跨图表误刷新 | `DashboardFilterBar.tsx`、`ChartRenderer.tsx` |
| 权限/分享 | 编辑器可见但发布/分享不可见 | `dashboard_handler.go`、router/middleware |
| 版本治理 | 发布版本和草稿不一致、回滚异常 | `DashboardGovernancePanel.tsx`、`dashboard_handler.go` |

### 3. 收集关键数据

前端：

- `chart.config.version`
- `widget.id`
- `widget.type`
- `widget.config.dimensions`
- `widget.config.measures`
- `widget.config.query`
- `widget.config.fieldLabels`
- `runtimeRows[widget.id]`
- 当前 `DashboardFilters`
- 浏览器 console 的渲染错误和 `lightbi:performance`

后端：

- chart asset 的 `config`
- latest chart version 的 `config`
- share link 的 enabled、allowEmbed、expiresAt
- dataset query 请求、响应、错误和审计日志
- RBAC 判断结果

### 4. 排查路径

#### schema 问题

1. 查看 `ChartDocument.version` 是否为 2。
2. 查看 widget 是否有 id、type、x、y、width、height、config。
3. 查看 `dimensions`、`measures` 是否为字符串数组。
4. 查看新增字段是否缺少默认值或后端 normalize。
5. 查看 `previewRows` 是否误入持久化 config。

#### 数据问题

1. 从 widget 的 `datasetId` 和 `query` 复现 dataset query。
2. 核对 response 的 `columns.name`、`columns.label` 和 rows 字段。
3. 核对 `fieldLabels` 是否把字段名映射成 renderer 使用的展示名。
4. 核对后端是否因字段校验、过滤、排序、聚合或 limit 报错。
5. 核对发布页 `runtimeRowsForChart` 是否为每个 widget 生成 rows。

#### renderer 问题

1. 判断类型进入 G2、S2、metric 还是 text renderer。
2. 查看是否被 `ChartErrorBoundary` 捕获。
3. 查看动态 import 是否失败。
4. 查看 empty/error 是否能展示，而不是空白。
5. 查看 cleanup 是否误销毁仍在使用的实例。

#### filter/linkage 问题

1. 查看 filter 是否指定 `chartIds` 或 `fieldsByChart`。
2. 查看字段名或展示名是否能匹配到 widget dimensions。
3. 查看时间筛选是否找到可用 time field。
4. 查看影响范围是否过大导致所有图表刷新。
5. 高频联动要确认是否合并触发。

### 5. 修复和复盘

修复后补齐：

- schema migration 或 normalize 兼容。
- 字段映射 fallback。
- renderer empty/error 状态。
- `ChartRenderer` 或 helper 的单测/e2e 示例。
- dataset query 测试或 handler 测试。
- 更新对应 Rule 或 checklist。

## 输出模板

```markdown
## 线上图表问题结论

- 影响范围：
- 根因层级：
- 根因文件：
- 止血动作：
- 修复动作：
- 验证命令：
- 剩余风险：
```

## 验证命令

```bash
cd frontend
npm run typecheck
npm run build
```

涉及发布、分享、嵌入、编辑器筛选或图表交互时：

```bash
cd frontend
npm run e2e
```

涉及后端 query、发布治理、分享、导出或权限时：

```bash
cd backend
GOCACHE=/private/tmp/lightbi-go-cache go test ./...
```
