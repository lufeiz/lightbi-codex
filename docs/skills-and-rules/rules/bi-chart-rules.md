# BI Chart Rules

## 目标

保证 LightBI 图表能力可复用、可维护、可扩展，并降低大数据渲染、交互卡顿、配置失效和内存泄漏风险。

## 1. 图表协议边界

- `ChartRenderer` 只能消费标准 `ChartWidget`、标准 rows 和标准 `DashboardFilters`。
- 图表组件不能直接依赖业务接口原始返回结构；接口响应必须先被转换为 `DatasetQueryResponse` 和 `DataRow[]`。
- 保存 Dashboard 时只能保存平台级 `ChartDocument`，不能保存 G2/S2/X6 原始 instance 或一次性 option。
- `ChartDocument` 必须带 `version`，当前新保存必须为 `version: 2`。
- `ChartWidget` 至少包含 `id`、`type`、`x`、`y`、`width`、`height`、`config`。
- `ChartConfig` 至少稳定包含 `title`、`dimensions`、`measures`、`showLabel`、`showTooltip`、`showScrollbar`。
- 影响公共 schema 的变更必须提供 normalize、migration 或兼容 fallback，不能让历史 Dashboard 直接失效。

## 2. Registry 规则

- 新图表类型必须同时更新前端 `ChartType`、`chartTypeLabels`、`chartDefinitions`。
- 新图表类型必须同时更新后端 `ChartType` 和 `ValidChartType`。
- `chartDefinitions` 必须声明 renderer、默认尺寸、最少维度、最少指标和是否需要 dataset。
- 图表类型分组和默认尺寸由 registry 管理，不能散落在多个页面里硬编码。
- 一次性业务需求不能污染通用 chart registry；确需业务定制时优先做配置项或独立 renderer helper。

## 3. Renderer 生命周期

- 每条渲染路径必须有 init、render/update、resize 响应和 destroy/cleanup。
- G2/S2/X6 等实例必须只存在于局部 effect/ref 生命周期中，不能放进 Zustand store 或持久化 config。
- 数据变化优先 update/changeData；只有 chart type、渲染引擎或核心结构变化时才允许重新初始化。
- 图表库动态 import 失败时必须展示可见错误，不能静默空白。
- 单个 widget 渲染失败必须被错误边界隔离，不能拖垮整个 Dashboard。
- cleanup 必须幂等，多次触发不能报错。

## 4. 运行时数据边界

- 大数据 rows 属于运行时数据，进入 `runtimeRows` 或接口响应，不进入持久化 `ChartDocument`。
- `previewRows` 是历史 runtime snapshot，新保存必须通过 `stripRuntimeConfig` 和后端 normalize 剥离。
- Dashboard store 只保存必要状态：widgets、runtimeRows、filters、selectedWidgetId、meta。
- 禁止把图表实例、DOM 节点、observer、timer、requestAnimationFrame handle 放入全局 store。
- 大数据计算结果通过 query、filter、runtimeRows 或版本字段触发更新，不依赖深层对象自动追踪。

## 5. 高频交互

- pointermove、resize、tooltip、brush、filter、legend 等高频事件必须节流、合并或延后到结束态提交。
- brush 拖动过程中只做轻量视觉反馈，业务过滤应在 brushEnd/selectEnd 后触发。
- 多图表联动必须经过统一 `DashboardFilters` 或 filter context，不能让图表之间互相直接调用。
- 联动更新必须判断影响范围，只刷新字段匹配且配置了关系的 widget。
- 多个联动事件应合并批处理，避免短时间重复请求和重复渲染。

## 6. 销毁与内存

- 图表销毁时必须释放 chart/sheet/graph instance。
- cleanup 必须解绑事件、observer、timer、requestAnimationFrame。
- Dashboard 页面切换、图表删除、预览退出、发布页卸载时必须触发对应 renderer cleanup。
- 禁止在全局 store、闭包或缓存 Map 中长期持有已卸载图表的大数据对象。
- 文本/富文本必须继续走 DOMPurify，不能为图表内容绕过 sanitize。

## 7. 当前项目必守代码锚点

- `frontend/src/features/charts/ChartRenderer.tsx`
- `frontend/src/features/charts/chartUtils.ts`
- `frontend/src/store/designerStore.ts`
- `frontend/src/types/domain.ts`
- `frontend/src/features/charts/chartConfigValidation.ts`
- `backend/internal/handlers/chart_config.go`
- `backend/internal/models/types.go`
