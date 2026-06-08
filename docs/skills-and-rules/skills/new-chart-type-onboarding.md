# New Chart Type Onboarding Skill

## 触发场景

新增折线、柱状、堆叠、饼图、交叉表、指标卡、富文本以外的图表类型，或引入新的渲染引擎、配置项、联动能力时使用本 Skill。

## 目标

新增图表必须走统一协议、统一 registry、统一保存校验和统一渲染生命周期。不要在某个页面里临时写图表 option，也不要让 `ChartRenderer` 直接消费业务接口返回结构。

## 当前项目架构

| 层 | 文件 | 责任 |
|---|---|---|
| 类型协议 | `frontend/src/types/domain.ts` | `ChartType`、`ChartConfig`、`ChartWidget`、`ChartDocument` |
| 前端 registry | `frontend/src/features/charts/chartUtils.ts` | `chartDefinitions`、默认尺寸、renderer 类型、最少字段数 |
| 渲染层 | `frontend/src/features/charts/ChartRenderer.tsx` | G2/S2/metric/text 渲染与错误边界 |
| 配置面板 | `frontend/src/features/charts/ChartConfigPanel.tsx` | 数据集、字段绑定、query 构建、预览更新 |
| 编辑器状态 | `frontend/src/store/designerStore.ts` | 默认 widget、runtimeRows、保存 payload |
| 前端校验 | `frontend/src/features/charts/chartConfigValidation.ts` | `ChartDocument` v2 和 widget 基础校验 |
| 后端枚举 | `backend/internal/models/types.go` | `ChartType` 和 `ValidChartType` |
| 后端校验 | `backend/internal/handlers/chart_config.go` | config normalize、字段去重、`previewRows` 剥离、HTML sanitize |

## 标准流程

### 1. 明确图表场景

先回答：

- 这是常规统计图、表格、指标卡、文本组件，还是高度自定义图形？
- 是否需要 dataset？
- 最少需要几个维度、几个指标？
- 是否需要联动、tooltip、label、scrollbar、theme？
- 是否适用于发布页、分享页、嵌入页和版本回滚？

### 2. 选择渲染路径

| 场景 | 当前建议 |
|---|---|
| 常规统计图 | 优先走 G2 renderer |
| 明细表、交叉表、对比表 | 走 S2 renderer |
| 指标卡、趋势卡 | 走 metric renderer |
| 文本/富文本 | 走 text renderer，并保持 DOMPurify sanitize |
| 极大规模点线面 | 先评估专项 Canvas/WebGL，不直接塞进 G2 主流程 |

### 3. 更新类型和 registry

必须同步更新：

- `frontend/src/types/domain.ts` 的 `ChartType`。
- `frontend/src/types/domain.ts` 的 `chartTypeLabels`。
- `frontend/src/features/charts/chartUtils.ts` 的 `chartDefinitions`。
- `backend/internal/models/types.go` 的 `ChartType` 常量和 `ValidChartType`。

`chartDefinitions` 至少要明确：

- `renderer`：`g2`、`s2`、`metric`、`text`。
- `defaultWidth`、`defaultHeight`。
- `minDimensions`、`minMeasures`。
- `requiresDataset`。

### 4. 补默认配置和保存协议

在 `designerStore.ts` 的 `createWidget` 中确认默认配置：

- `title`
- `showLabel`
- `showTooltip`
- `showScrollbar`
- `theme`
- `labelSize`
- `enableLinkage`
- `linkageMode`
- `dimensions`
- `measures`
- `query`
- 该类型专属配置项

如果新增 `ChartConfig` 字段：

- 字段必须有默认值或兼容旧配置的 fallback。
- 新保存仍输出 `ChartDocument.version = 2`。
- 运行时数据不得进入持久化 config。
- 后端 `normalizeChartWidgetConfig` 需要允许并清洗必要字段。
- 影响历史 dashboard 时必须补 migration 或 normalize 兼容逻辑。

### 5. 接入配置面板

检查 `ChartConfigPanel.tsx`：

- 新图表是否展示正确字段绑定区。
- 最少维度/指标是否能被 UI 提示。
- `buildQueryConfig` 是否能生成正确 dataset query。
- 数据集切换时是否清理旧字段、旧 query、旧 runtimeRows。
- 预览更新失败时是否有 `queryError`。

### 6. 接入 renderer

检查 `ChartRenderer.tsx`：

- 新类型是否被分配到正确 renderer。
- G2/S2 option 转换是否只依赖标准 `ChartWidget` 和标准 rows。
- 是否处理 loading、empty、error。
- 是否记录 `CHART_RENDER`。
- effect cleanup 是否销毁实例。
- 图表库加载失败是否有用户可见错误。

如果逻辑变复杂，应抽出局部 helper 或 adapter，不要让 `ChartRenderer` 的主分支无限膨胀。

### 7. 补联动与筛选

如果新图表参与 Dashboard filter：

- 字段必须能从 `dimensions`、`fieldLabels` 或 `fieldsByChart` 解析。
- 图表只消费统一 `DashboardFilters`，不直接调用其他图表。
- 高频选择、brush 或 hover 联动必须合并或节流。
- 只有字段匹配且配置了影响范围的 widget 才刷新。

### 8. 补质量保障

至少补齐：

- 示例配置或 e2e 场景。
- 前端 typecheck。
- 前端 build。
- 后端 `ValidChartType` 和 config normalize 相关测试。
- 如果涉及发布/分享/嵌入，补对应 e2e 或 handler 测试。

## 验收清单

- [ ] `ChartType` 前后端一致。
- [ ] `chartTypeLabels`、`chartDefinitions`、默认尺寸和 renderer 完整。
- [ ] 新 widget 默认配置完整。
- [ ] 保存 payload 不包含 `previewRows`。
- [ ] 后端能接受并 normalize 新类型 config。
- [ ] 渲染失败不会拖垮整个 Dashboard。
- [ ] 发布页、分享页、嵌入页可渲染。
- [ ] 历史 `ChartDocument` 不会直接失效。
- [ ] 已执行必要验证命令。

## 验证命令

```bash
cd frontend
npm run typecheck
npm run build
npm run e2e
```

```bash
cd backend
GOCACHE=/private/tmp/lightbi-go-cache go test ./...
```
