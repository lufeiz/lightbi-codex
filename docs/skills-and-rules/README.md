# LightBI Skills and Rules

这组文件把面试稿里的 Skills 和 Rules 落成 LightBI 项目内可复用的工程资产。它们不是概念说明，而是面向后续开发、排障、评审和复盘的具体流程与护栏。

## 触发链路

本目录本身不会像全局 Codex Skill 一样被 metadata 自动发现。当前项目的触发入口已经补到仓库根目录：

- `AGENTS.md`

触发方式是：

1. Codex 进入 `lightbi-codex` 仓库后先读取根目录 `AGENTS.md`。
2. `AGENTS.md` 按用户请求里的任务信号分类，例如性能问题、新增图表类型、线上图表异常、schema/API 变更、code review。
3. 命中分类后，再按表格加载本目录下对应的 Skill/Rule 文件。
4. 执行时按文件里的流程和当前代码锚点推进，并按变更范围运行验证命令。

如果要做跨项目、metadata 级别的自动触发，需要另行沉淀到 `/Users/lufeiz/.codex/skills/<skill-name>/SKILL.md`。本目录定位是 LightBI 项目专用触发资产。

## 本次优化

原文内容已按当前 LightBI 代码结构做过适配：

- 将 Vue 语境里的 `markRaw`、`shallowRef`、`deep reactive` 优化为 React/Zustand 语境：图表实例放在局部 `ref/effect` 生命周期内，运行时大数据进入 `runtimeRows`，保存时继续通过 `stripRuntimeConfig` 剥离 `previewRows`。
- 将通用 `renderer adapter` 规则映射到当前 `ChartRenderer` 的 G2、S2、metric、text 四类渲染路径，以及 `chartDefinitions` registry。
- 将 schema 规则绑定到 `ChartDocument` v2、前端 `validateChartDocument`、后端 `normalizeConfig` 和 `models.ValidChartType`。
- 将性能排查绑定到当前已有 `recordPerformanceMetric`、`lightbi:performance`、G2/S2 动态导入、IntersectionObserver 可视区渲染和 Webpack build 验证。
- 将线上问题排查补充了发布、分享、嵌入、版本回滚、runtimeRows 和数据集查询链路，避免只停留在“图表渲染失败”。

## 文件索引

| 类型 | 文件 | 适用场景 |
|---|---|---|
| Skill | `skills/dashboard-performance-diagnosis.md` | Dashboard 首屏慢、图表卡顿、筛选联动慢、内存上涨 |
| Skill | `skills/new-chart-type-onboarding.md` | 新增图表类型、接入新渲染器、扩展配置面板 |
| Skill | `skills/chart-online-issue-diagnosis.md` | 线上图表空白、数据不一致、联动失效、历史配置打不开 |
| Rule | `rules/bi-chart-rules.md` | 图表 schema、渲染生命周期、运行时数据、销毁清理 |
| Rule | `rules/dashboard-performance-rules.md` | 多图表、大数据、多接口 Dashboard 的性能底线 |
| Rule | `rules/schema-api-rules.md` | 前后端 schema/API 协议、字段元信息、联动过滤 |
| Checklist | `rules/bi-code-review-checklist.md` | Chart/Dashboard 相关 MR/PR 评审 |

## 使用方式

1. 性能问题先走 `dashboard-performance-diagnosis.md`，输出基线、瓶颈层级、优化项和复测结果。
2. 新增图表类型先走 `new-chart-type-onboarding.md`，按类型、schema、registry、renderer、配置面板、验证命令逐项完成。
3. 线上问题先走 `chart-online-issue-diagnosis.md`，按影响范围、schema、数据源、runtime rows、渲染层、联动层定位。
4. 开发或 review 时引用 `rules/` 下的规则，尤其是保存配置、图表生命周期、运行时数据和性能验证。

## 当前代码锚点

- 前端类型：`frontend/src/types/domain.ts`
- 图表 registry 和性能指标：`frontend/src/features/charts/chartUtils.ts`
- 图表渲染：`frontend/src/features/charts/ChartRenderer.tsx`
- 编辑器状态和保存 payload：`frontend/src/store/designerStore.ts`
- 配置面板和数据集查询：`frontend/src/features/charts/ChartConfigPanel.tsx`
- 前端配置校验：`frontend/src/features/charts/chartConfigValidation.ts`
- 后端配置 normalize：`backend/internal/handlers/chart_config.go`
- 后端图表枚举：`backend/internal/models/types.go`
- 发布/分享 runtime 数据：`backend/internal/handlers/dashboard_handler.go`

## 验证命令

按变更范围选择执行：

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
