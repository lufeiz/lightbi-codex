# Dashboard Performance Diagnosis Skill

## 触发场景

当出现以下描述时使用本 Skill：

- Dashboard 打开慢、首屏慢、发布页或分享页加载慢。
- 多个图表同时渲染后页面卡顿。
- 筛选、联动、拖拽、缩放、tooltip、brush 等交互响应慢。
- 数据量上来后 G2/S2 图表渲染慢或浏览器出现 long task。
- 页面切换、发布预览或重复编辑后内存持续上涨。

## 目标

先用指标建立基线，再按资源加载、接口请求、数据处理、渲染、交互、内存释放分层定位。不要直接跳到“加懒加载”或“加缓存”。

## 当前项目锚点

- 性能指标：`frontend/src/features/charts/chartUtils.ts` 的 `recordPerformanceMetric` 和 `lightbi:performance` 事件。
- 渲染入口：`frontend/src/features/charts/ChartRenderer.tsx`。
- 画布交互：`frontend/src/features/charts/DesignerCanvas.tsx`。
- 保存和运行时数据：`frontend/src/store/designerStore.ts`。
- 发布页 runtime 数据：`backend/internal/handlers/dashboard_handler.go` 的 `runtimeRowsForChart`。
- 数据集查询链路：`frontend/src/features/charts/ChartConfigPanel.tsx`、`backend/internal/services/dataset_query.go`。

## 输入信息

排查前至少补齐：

| 信息 | 示例 |
|---|---|
| 页面 | 编辑器、发布页、分享页、嵌入页 |
| chartId / dashboardId | 具体 ID |
| widget 数量 | 例如 12 个图表 |
| chartType 分布 | G2/S2/metric/text 各多少 |
| datasetId 和数据量 | 每个 widget 的 rows 数、columns 数 |
| 网络情况 | 本地、测试环境、线上、弱网 |
| 复现动作 | 打开、筛选、拖拽、缩放、发布、切换版本 |

## 标准流程

### 1. 建立基线

记录至少这些指标：

- FCP、LCP、CLS、INP。
- `CHART_RENDER` 单图表渲染耗时。
- `EDITOR_INTERACTION` 拖拽/缩放交互耗时。
- Dashboard 配置接口耗时。
- 数据集查询接口数量、耗时、返回 rows 数和 payload 大小。
- Webpack build 资源体积和 chunk warning。
- 页面进入、交互后、退出后的内存变化。

可在浏览器控制台临时监听：

```js
window.addEventListener('lightbi:performance', (event) => {
  console.table(event.detail);
});
```

### 2. 分层定位

| 层级 | 检查点 | 对应代码 |
|---|---|---|
| 资源加载 | G2/S2/X6 是否动态导入，新增依赖是否进首屏主包 | `ChartRenderer.tsx`、`DesignerCanvas.tsx`、`webpack.config.cjs` |
| 接口请求 | 同 dataset 是否重复 query，发布页是否为每个 widget 串行查询 | `ChartConfigPanel.tsx`、`dashboard_handler.go` |
| 数据处理 | 是否前端拉全量后排序、聚合、筛选；是否可下推到后端 | `dataset_query.go`、`buildQueryConfig` |
| 图表渲染 | 是否不可见图表也初始化；是否数据变化时总是重建实例 | `ChartRenderer.tsx` |
| 高频交互 | pointermove、resize、filter、tooltip、brush 是否未节流 | `DesignerCanvas.tsx`、`DashboardFilterBar.tsx` |
| 内存释放 | G2/S2/X6、IntersectionObserver、window event listener 是否销毁 | `ChartRenderer.tsx`、`DesignerCanvas.tsx` |
| 持久化 | 大数据是否被写入 chart config；`previewRows` 是否被剥离 | `designerStore.ts`、`chart_config.go` |

### 3. 输出优化方案

按瓶颈层级选择方案：

- 资源加载：保持 G2/S2/X6 动态导入；新增重依赖必须按图表类型或页面入口拆包。
- 请求层：合并同 dataset/同 query 请求；利用 query cache；发布页避免无必要的重复 runtime query。
- 数据层：优先后端聚合、筛选、排序和 limit；趋势类图表允许视觉采样，但必须保留极值和关键拐点。
- 渲染层：保持可视区域优先渲染；不可见图表不执行 resize；能 `changeData/update` 时不要销毁重建。
- 交互层：pointermove、resize、tooltip、brush、filter 应节流或合并批处理。
- 内存层：每个 effect 的 cleanup 必须释放 chart instance、observer、event listener、timer、RAF 和大数据引用。

### 4. 复测和结论

复测必须保持相同页面、相同数据量、相同网络环境、相同操作路径。

结果模板：

```markdown
## 性能排查结论

- 页面：
- 复现动作：
- 主要瓶颈：
- 修改点：

| 指标 | 优化前 | 优化后 | 结论 |
|---|---:|---:|---|
| FCP | | | |
| LCP | | | |
| CHART_RENDER P50/P95 | | | |
| EDITOR_INTERACTION P50/P95 | | | |
| 接口数量 | | | |
| 最大 payload | | | |
| 内存峰值 | | | |

## 剩余风险

- 
```

## 验收命令

```bash
cd frontend
npm run typecheck
npm run build
```

如果改到编辑器、发布页、分享页或筛选联动：

```bash
cd frontend
npm run e2e
```

如果改到 runtimeRows 或数据集查询：

```bash
cd backend
GOCACHE=/private/tmp/lightbi-go-cache go test ./...
```

## 禁止项

- 没有基线就宣称“性能已优化”。
- 把 `previewRows` 或大数据写回持久化 config。
- 为了局部优化绕过 `ChartDocument`、`chartDefinitions` 或数据集查询校验。
- 用一次性业务逻辑污染通用 `ChartRenderer` 主流程。
