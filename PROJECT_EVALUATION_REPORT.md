# LightBI 项目客观评估报告

日期：2026-05-21  
范围：`/Users/lufeiz/Downloads/项目/codexProject/lightbi-codex` 当前工作区  
方法：本地代码审阅 + 多 agent 只读评估 + 构建/测试验证

## 一句话判断

LightBI 不是空壳项目，已经具备 BI MVP 的主要骨架：数据源、数据集、图表编辑、资产管理、发布、分享、版本、审计、订阅、工作空间/项目权限都有代码落点。

但从第一性原理看，BI 的核心不是“能画图”，而是把数据转化为**可信、可复用、可消费的决策资产**。按这个标准，当前项目更接近“可演示的 BI 图表资产管理 MVP”，还不是“可直接用于企业生产的 BI 平台”。

综合评分：**6.7 / 10**。

## 第一性原理拆解

一个 BI 产品最小闭环应该回答四个问题：

1. 数据从哪里来，是否安全可控？
2. 数据口径是否可信、可复用、可治理？
3. 分析人员能否高效建模、出图、发布？
4. 业务用户能否稳定消费，并理解数据可信度？

LightBI 当前做到的是：主对象和主流程基本齐了，工程上能跑，演示链路成立。

LightBI 当前没完全做到的是：真实 SQL 数据到图表的前端链路有断点，语义层和治理策略偏薄，发布消费侧可靠性和可观测性不足，安全边界和测试门禁还不够生产级。

## 多 Agent 评分汇总

| 视角 | 评分 | 结论 |
|---|---:|---|
| 工程架构 | 6.8 / 10 | 技术栈合理，主领域对象齐全；但 `Chart` 实际承载仪表盘文档，概念边界混用，handler 偏重。 |
| 前端体验/性能 | 6.8 / 10 | React 结构、图表懒加载、画布编辑器具备基础；但响应式、可访问性、渲染错误兜底和建模交互不足。 |
| 质量/安全/测试 | 6.5 / 10 | 有 JWT、refresh token、AES-GCM、只读 SQL 校验、富文本净化等基础；但 SQL/数据源边界、租户隔离细节、错误处理、CI 门禁偏弱。 |
| 产品/商业价值 | 7.0 / 10 | MVP 覆盖度不错，资产复用和治理外壳较完整；但 SQL 数据链路、语义层、消费侧和开箱 demo 不足。 |

## 主要优点

1. **功能覆盖面较完整。** README 明确列出登录/RBAC、图表资产、分组标签、数据源、SQL 数据集、工作空间、发布消费、版本审计、导出订阅等能力；路由层也有对应 API。证据：`README.md:5`、`backend/internal/router/router.go:65`、`backend/internal/router/router.go:79`、`backend/internal/router/router.go:113`、`backend/internal/router/router.go:119`。

2. **技术选型适合 BI 后台类产品。** 前端使用 React + TypeScript + Ant Design + AntV G2/S2/X6，后端使用 Go + Gin + GORM，外部数据源支持 MySQL/PostgreSQL。证据：`frontend/package.json:11`、`backend/go.mod:5`。

3. **领域对象不是纯 UI mock。** 后端模型已经有 `Dataset`、`DataSource`、`Chart`、`ChartVersion`、`AuditLog`、`DashboardShareLink`、`DashboardSubscription`，并带 `workspaceId/projectId`。证据：`backend/internal/models/models.go:78`、`backend/internal/models/models.go:107`、`backend/internal/models/models.go:184`、`backend/internal/models/models.go:206`、`backend/internal/models/models.go:236`。

4. **数据查询层有正确方向。** 数据集查询做了字段校验、聚合校验、过滤操作符校验、参数绑定、缓存、超时和 row limit。证据：`backend/internal/services/dataset_query.go:75`、`backend/internal/services/dataset_query.go:152`、`backend/internal/services/dataset_query.go:254`、`backend/internal/services/dataset_query.go:392`。

5. **安全基础有一定意识。** Refresh token 用 HttpOnly Cookie，token hash 入库；数据源密码 AES-GCM 加密；富文本经过服务端和前端净化；生产环境会拒绝默认 JWT secret、默认 DSN、默认 seed 密码等。证据：`backend/internal/handlers/auth_handler.go:266`、`backend/internal/services/credentials.go:11`、`backend/internal/handlers/chart_config.go:78`、`backend/internal/config/config.go:78`。

6. **前端有基础性能意识。** 页面使用 lazy/Suspense，G2/S2 图表库运行时动态导入，图表渲染用 IntersectionObserver 做延迟渲染。证据：`frontend/src/App.tsx:12`、`frontend/src/features/charts/ChartRenderer.tsx:68`、`frontend/src/features/charts/ChartRenderer.tsx:178`、`frontend/src/features/charts/ChartRenderer.tsx:325`。

7. **验证结果整体为正。** 本次执行通过了 `npm run typecheck`、`npm run build`、`GOCACHE=/private/tmp/lightbi-go-cache go test ./...`、`npm run e2e`。其中 e2e 在沙箱内因本地端口监听权限失败，提升权限后通过，1 条 Playwright 用例通过。

## 主要问题

1. **真实 SQL 数据集到图表编辑器的主链路有断点。** 数据集页面只能新建 `sql` 数据集，但图表配置面板的数据集类型只给 `standard/direct`，没有 `sql`。这会让“外部数据库 -> SQL 数据集 -> 图表配置 -> 发布消费”的商业主链路不顺。证据：`frontend/src/pages/DatasetsPage.tsx:201`、`frontend/src/features/charts/ChartConfigPanel.tsx:381`、`frontend/src/features/charts/ChartConfigPanel.tsx:382`。

2. **`Chart` 与 `Dashboard` 概念混用。** 后端 `Chart` 实际存的是一个包含多个 `widgets` 的仪表盘文档，但接口、模型和类型仍以单图表命名。短期能跑，长期会影响组件级版本、组件级权限、多页面仪表盘和布局模型扩展。证据：`backend/internal/models/models.go:184`、`frontend/src/store/designerStore.ts:158`。

3. **语义层偏薄。** 现在更多是字段列表 + 聚合查询，`Policy` 字段没有实际参与查询；`timeComparison` 存在类型定义但未形成完整业务实现；前端构造查询时指标聚合固定为 `sum`。证据：`backend/internal/models/models.go:95`、`frontend/src/features/charts/ChartConfigPanel.tsx:568`、`frontend/src/features/charts/ChartConfigPanel.tsx:573`。

4. **跨项目关联校验有缺口。** `ChartGroup`、`ChartTag` 本身有 `projectId`，但图表创建/更新校验 group/tag 时只按 ID 查，没有带当前项目范围。理论上知道其他项目 ID 的用户可能把跨项目目录/标签关联到自己的图表。证据：`backend/internal/models/models.go:155`、`backend/internal/models/models.go:171`、`backend/internal/handlers/chart_handler.go:162`、`backend/internal/handlers/chart_handler.go:166`、`backend/internal/handlers/chart_handler.go:379`、`backend/internal/handlers/chart_handler.go:387`。

5. **SQL 和数据源执行边界还不够硬。** `NormalizeReadOnlySQL` 依赖字符串前缀、分号、注释和关键词判断；数据源连接测试允许服务端按用户填写的 host/port 发起连接，缺少 allowlist 或网络隔离策略。证据：`backend/internal/services/dataset_query.go:371`、`backend/internal/services/dataset_query.go:379`、`backend/internal/services/dataset_query.go:382`、`backend/internal/handlers/data_source_handler.go:202`、`backend/internal/services/data_source.go:64`。

6. **发布消费侧可靠性不足。** 公开分享和发布页会执行数据集查询并返回 `runtimeRows`，但查询失败时 `runtimeRowsForChart` 直接 `continue`，前端可能只显示占位，不告诉用户“哪张图失败、为什么失败”。证据：`backend/internal/handlers/dashboard_handler.go:108`、`backend/internal/handlers/dashboard_handler.go:131`、`backend/internal/handlers/dashboard_handler.go:617`、`backend/internal/handlers/dashboard_handler.go:635`、`backend/internal/handlers/dashboard_handler.go:637`。

7. **前端响应式和可访问性偏弱。** 全局 `min-width: 1180px`，发布页画布最小宽度由绝对定位内容决定，编辑器画布拖拽/缩放依赖 pointer 和无语义 `div`。移动端和嵌入场景会比较吃力。证据：`frontend/src/styles/global.css:9`、`frontend/src/features/charts/DashboardView.tsx:27`、`frontend/src/features/charts/DesignerCanvas.tsx:110`、`frontend/src/features/charts/DesignerCanvas.tsx:117`。

8. **测试和 CI 门禁不足。** 后端已有单元/集成测试，前端 e2e 有 mock API 冒烟，但没有看到 lint 脚本、CI workflow、真实前后端契约测试，也没有覆盖高风险 SQL 绕过、数据源 SSRF/内网探测、跨项目 group/tag 关联等场景。证据：`frontend/package.json:5`、`frontend/e2e/lightbi.spec.ts:14`、`README.md:77`。

9. **构建产物体积需要治理。** `npm run build` 通过，但 webpack 提示多个资源超过推荐大小：登录背景图 1.49 MiB，主入口 786 KiB，多个 async chunk 在 467 KiB 到 942 KiB 之间。这会影响首次加载和弱网体验。

## 客观定位

适合作为：

- BI 项目原型或 MVP 骨架；
- 面试/作品集里展示“从数据源到图表资产治理”的工程能力；
- 后续继续做成完整 BI 平台的起点。

不适合直接作为：

- 多租户企业级生产 BI；
- 面向外部客户售卖的稳定 SaaS；
- 高敏数据环境下的生产数据分析平台。

原因不是“功能太少”，而是 BI 的生产门槛主要在可信数据、权限治理、查询安全、消费可靠性和可观测性，而这些部分目前仍偏原型。

## 优先级改进路线

### P0：先补主链路和安全边界

1. 图表配置面板支持 `sql` 数据集，修通外部数据库到图表的真实链路。
2. group/tag/dataset/chart 所有关联校验都带 `workspace_id/project_id`。
3. 发布页返回组件级查询状态：成功、失败、缓存命中、执行耗时、错误码。
4. SQL 执行使用只读数据库账号、只读事务或 session，减少对字符串校验的依赖。
5. 数据源 host/port 增加 allowlist、私网段策略或连接代理隔离。

### P1：补语义层和可信资产

1. 建立字段字典、指标口径、聚合方式、时间维度、数据更新时间。
2. 落地 `Dataset.Policy`：行级权限、字段脱敏、敏感等级、分享/导出限制。
3. 发布前校验：数据集可查询、字段存在、图表配置完整、敏感字段不可公开分享。
4. 版本治理增加 diff，让用户知道发布版本之间改了什么。

### P2：提升消费体验和可运维性

1. 发布页支持消费者筛选、刷新、导出、钻取或至少图表级查看数据。
2. 响应式改造：编辑画布和消费画布分离，消费页支持缩放/栅格/移动端单列。
3. 图表运行时加错误边界、加载态和降级态。
4. 订阅从“应用内记录”扩展到邮件/webhook/飞书/Slack 等真实投递。
5. 建 CI：`go test ./...`、`go vet/staticcheck/gosec`、前端 typecheck/build/e2e/lint。

## 最终结论

这个项目的优点是“面很全、主链路有、工程不空、能验证”；缺点是“深度还不够，尤其是真实数据链路、语义治理、安全边界、消费可靠性和测试门禁”。

如果用于展示项目能力，它是一个不错的基础，可以讲清楚架构、权限、数据源、图表配置、发布治理。  
如果目标是生产级 BI，下一阶段不应该继续堆页面，而应该优先修通 SQL 数据集到图表的主链路，并把权限、安全、语义层和运行时可观测性做扎实。
