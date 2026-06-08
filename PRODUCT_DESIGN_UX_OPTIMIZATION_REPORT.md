# LightBI 功能设计与交互流程优化报告

生成日期：2026-05-29  
分析范围：`/Users/lufeiz/Downloads/项目/codexProject/lightbi-codex` 当前工作区  
分析方法：第一性原理拆解 + 本地代码审阅 + 3 个只读 agent 分别从信息架构、BI 编辑器、数据治理/权限/发布角度分析  
说明：当前工作区已有未提交改动，包括 `ChartConfigPanel.tsx` 支持 `sql` 数据集、`chart_handler.go` 项目级 group/tag 校验、相关治理测试，以及已有未跟踪 `PROJECT_EVALUATION_REPORT.md`。本报告新建独立文件，不覆盖既有报告。

## 一句话结论

LightBI 当前已经不是空壳，具备 BI MVP 的主要对象和主流程：登录、工作空间/项目、数据源、数据集、仪表盘资产、编辑器、发布、分享、版本、审计、订阅都有代码落点。

但从第一性原理看，BI 产品的核心不是“能画图”，而是把数据变成**可信、可复用、可发布、可消费、可追责的决策资产**。按这个标准，当前项目更接近“可演示的 BI 图表资产管理与轻量仪表盘编辑 MVP”，距离可生产使用的企业 BI 还缺关键闭环。

综合产品成熟度判断：**6.8 / 10**。

## 第一性原理

一个 BI 产品最底层要解决的是降低决策不确定性。用户不关心系统内部叫 chart 还是 dashboard，用户关心：

1. 数据是不是来自正确来源，权限是否安全。
2. 指标口径是否可信，字段含义是否清晰。
3. 分析人员能否快速把数据配置成可解释的图表。
4. 发布出去的内容是否稳定，不会因为编辑中的状态被污染。
5. 业务用户能否看懂、筛选、导出，并知道数据是否异常。
6. 管理者能否追踪谁改了什么、谁看了什么、查询是否失败。

因此，一个可用 BI 的最小产品闭环不是“添加图表 -> 保存”，而是：

`接入数据 -> 建模/字段语义 -> 配置图表 -> 预览验证 -> 原子发布版本 -> 消费侧交互 -> 权限/审计/监控反馈`

当前 LightBI 的对象层基本齐了，但多个状态转换还不够严谨，尤其是数据集创建、编辑器预览、发布版本、公开分享、查询权限和消费侧错误反馈。

## 当前功能地图

| 模块 | 当前能力 | 证据 |
|---|---|---|
| 入口与路由 | 登录、公开分享、嵌入页、图表列表、新建/编辑、发布查看、数据源、数据集、空间项目 | `frontend/src/App.tsx:25-40` |
| 全局框架 | 顶部导航、工作空间/项目切换、编辑器全局保存/发布按钮 | `frontend/src/layouts/AppShell.tsx:38-86` |
| 登录注册 | 登录后跳回来源页或 `/charts`，注册支持邮箱/手机和邀请码 | `frontend/src/pages/LoginPage.tsx:21-145` |
| 工作空间/项目 | 空间、项目、成员维护，选择状态写入 localStorage | `frontend/src/pages/WorkspacesPage.tsx:136-239`、`frontend/src/store/workspaceStore.ts:27-58` |
| 数据源 | MySQL/PostgreSQL 新建、编辑、测试连接、删除 | `frontend/src/pages/DataSourcesPage.tsx:133-205`、`backend/internal/handlers/data_source_handler.go:44-213` |
| 数据集 | SQL 数据集、字段元数据、缓存策略、预览、刷新 | `frontend/src/pages/DatasetsPage.tsx:181-272`、`backend/internal/handlers/dataset_handler.go:75-320` |
| 仪表盘资产 | 目录树、筛选、标签、表格/卡片视图、复制、发布、归档、删除 | `frontend/src/pages/ChartsPage.tsx:360-550` |
| 编辑器 | 左侧组件 palette、中间画布、右侧图表/数据配置、筛选栏、保存、发布、治理抽屉 | `frontend/src/pages/ChartEditorPage.tsx:210-255` |
| 图表渲染 | G2/S2/指标卡/文本组件分发，单组件错误边界 | `frontend/src/features/charts/ChartRenderer.tsx:36-54` |
| 发布治理 | 版本、分享、导出、订阅、审计 | `frontend/src/features/charts/DashboardGovernancePanel.tsx:150-276` |
| 后端治理 | 项目级读写权限、版本快照、审计日志、分享 token、订阅记录 | `backend/internal/handlers/governance_helpers.go:99-164`、`backend/internal/handlers/dashboard_handler.go:94-540` |

## 主要优点

1. **主对象覆盖完整。** 后端模型包含 `Workspace`、`Project`、`Dataset`、`DataSource`、`Chart`、`ChartVersion`、`AuditLog`、`DashboardShareLink`、`DashboardSubscription`，不是纯前端 mock。证据：`backend/internal/models/models.go:24-294`。

2. **BI 编辑器闭环已经成型。** 可以添加组件、选择数据集、拉取字段、配置维度指标、查询预览、渲染图表、保存配置。证据：`ChartConfigPanel.tsx:140-228`、`designerStore.ts:157-170`。

3. **数据查询方向正确。** 查询层已有字段校验、聚合校验、过滤、排序、TopN、limit、缓存、并发闸、查询日志。证据：`backend/internal/services/dataset_query.go:93-317`。

4. **安全意识有基础。** Refresh token 使用 HttpOnly Cookie，数据源密码加密，SQL 做只读校验，富文本有净化。证据：`backend/internal/handlers/auth_handler.go:266`、`backend/internal/services/credentials.go`、`backend/internal/services/dataset_query.go:492-508`、`backend/internal/handlers/chart_config.go`。

5. **近期关键缺口已有修复迹象。** 当前未提交 diff 已把图表配置面板的数据集类型补上 `sql`，并把 group/tag 引用校验限定到当前项目。证据：`frontend/src/features/charts/ChartConfigPanel.tsx:457-461`、`backend/internal/handlers/chart_handler.go:159-166`、`backend/internal/handlers/governance_integration_test.go:86-136`。

## 核心问题与优化建议

### P0-1：发布不是严格的原子闭环

**问题判断**

BI 发布的本质是生成一个稳定、可回滚、可消费的发布包。当前已有仪表盘点击“发布”时，前端只调用 `api.publishChart(chartId)`，不会先保存当前编辑器内存态；后端 publish 会基于数据库里已有 chart snapshot。结果是用户可能以为发布了刚刚编辑的内容，实际发布的是旧配置。

同时，“保存并发布”会走 `saveDashboard('published')`，但后端 `create/update chart` 路径不创建版本快照，只有 `Publish` 路径会 snapshot。因此可能出现状态是已发布，但版本治理里没有对应版本的情况。

**证据**

- `frontend/src/pages/ChartEditorPage.tsx:138-153`：已有 chart 发布只调用 `api.publishChart(chartId)`。
- `frontend/src/pages/ChartEditorPage.tsx:159-170`：保存并发布走 `saveDashboard('published')`。
- `backend/internal/handlers/chart_handler.go:337-367`：snapshot 只发生在状态切换 publish 的 handler 中。
- `backend/internal/handlers/chart_handler.go:207-270`：update chart 不生成版本快照。

**建议**

1. 前端把“发布”改为“保存当前 payload -> 后端发布 -> 返回发布版本 -> 提供查看入口”的原子动作。
2. 后端新增 `SaveAndPublish` 或让 `Create/Update` 中进入 `published` 状态时统一创建版本快照。
3. 公开分享和嵌入最好绑定发布版本，而不是读取可变的当前 chart 配置。
4. UI 上明确区分“草稿已保存”“已发布版本”“有未发布改动”。

### P0-2：数据集创建链路不够可信

**问题判断**

数据集是 BI 的可信资产基础。当前数据源管理具备基础能力，但数据集创建仍偏工程协议：SQL 数据集需要用户手写字段 `name,label,type`，新建时不能保存前预览，只能保存后再预览。这会让用户无法确认 SQL 是否可执行、字段类型是否正确、指标/维度是否合理。

后端支持 `standard/direct/sql` 三类数据集，但前端数据集管理页面实际只提供 `sql` 选项，标准数据集和直连数据集没有完整创建体验。

**证据**

- `frontend/src/pages/DatasetsPage.tsx:127-142`：未保存数据集时提示“请先保存数据集再预览”。
- `frontend/src/pages/DatasetsPage.tsx:200-203`：类型选择只开放 `sql`。
- `frontend/src/pages/DatasetsPage.tsx:216-219`：维度/指标字段通过文本协议录入。
- `backend/internal/models/types.go:45-51`：后端类型支持 `standard/direct/sql`。

**建议**

1. 新建数据集时支持“测试 SQL / 预览前 20 行 / 自动识别字段 / 用户确认维度指标”。
2. 字段编辑从逗号文本升级为表格：字段名、显示名、类型、角色、是否可筛选、是否敏感。
3. standard/direct 的产品入口要么补齐，要么从文案和接口中明确隐藏，避免能力认知不一致。
4. 增加 schema 变更提示：字段缺失、类型变化、被图表引用影响范围。

### P0-3：查询权限没有下沉到数据执行层

**问题判断**

当前后端有项目级读写权限，但 `ExecuteDatasetQuery` 本身只接收 datasetID 和 request，不接收 actor、入口来源、分享链接上下文。`Dataset.Policy` 模型字段存在，但查询执行没有消费它。公开分享会触发实时数据查询，如果没有策略下沉，后续做行级权限、字段脱敏、公开链接限制会很难补。

**证据**

- `backend/internal/models/models.go:95`：`Dataset.Policy` 存在。
- `backend/internal/services/dataset_query.go:93`：`ExecuteDatasetQuery` 没有 actor/share context。
- `backend/internal/handlers/dataset_handler.go:292-319`：登录态查询只在 handler 层判断项目读权限。
- `backend/internal/handlers/dashboard_handler.go:119-131`：公开分享会返回运行时查询结果。

**建议**

1. 把 `ExecuteDatasetQuery` 改为接收 `QueryContext`，包含 actorID、projectID、source、shareLinkID、ip、userAgent。
2. 在查询服务内部执行 `Dataset.Policy`，覆盖行级过滤、列级脱敏、导出限制、公开分享限制。
3. 公开分享默认只访问发布快照和允许公开的数据集策略。
4. 查询日志记录 actor/source/shareLinkID/errorCode，形成审计闭环。

### P0-4：发布/公开消费侧错误被吞掉

**问题判断**

发布页和公开分享页的核心用户是业务消费者。当前后端查询每个 widget 的 runtime rows 时，如果单个图表查询失败，会直接 `continue`，前端只拿不到数据并显示“配置数据源后点击更新图表”这类编辑器语境占位。这会把真实故障伪装成未配置或无数据。

**证据**

- `backend/internal/handlers/dashboard_handler.go:617-641`：`runtimeRowsForChart` 查询失败直接跳过。
- `frontend/src/features/charts/ChartRenderer.tsx:662-691`：无数据统一显示配置数据源占位。
- `frontend/src/pages/PublicDashboardPage.tsx:35`：公开页直接渲染 `DashboardView`，无 widget 级错误信息。

**建议**

1. 后端返回 `widgetRuntimeStatus`：`success/empty/error/cached/durationMs/errorMessage`。
2. 前端区分“未配置数据源”“查询失败”“被筛选为空”“真实无数据”。
3. 发布页显示消费者可理解的错误，例如“数据查询失败，请联系看板维护人”，同时治理面板能看到技术详情。
4. 对公开链接访问失败、查询失败、导出失败写入审计或访问日志。

### P0-5：新用户/空项目 onboarding 不够明确

**问题判断**

用户登录后默认进入 `/charts`。如果没有工作空间或项目，创建数据源、数据集、仪表盘按钮会被禁用，但页面没有强引导用户先创建空间/项目。对 BI 产品来说，“先选组织上下文”是所有资产权限和数据隔离的前置条件，不能只靠禁用按钮表达。

**证据**

- `frontend/src/pages/LoginPage.tsx:17-23`：登录后默认跳 `/charts`。
- `frontend/src/store/workspaceStore.ts:27-45`：bootstrap 会选择第一个 workspace/project，缺失时为 null。
- `frontend/src/pages/ChartsPage.tsx:473-475`：无 projectId 禁用创建仪表盘。
- `frontend/src/pages/DataSourcesPage.tsx:140-142`：无 projectId 禁用新建数据源。
- `frontend/src/pages/DatasetsPage.tsx:188-190`：无 projectId 禁用新建数据集。

**建议**

1. 登录后如果 `workspaceId/projectId` 缺失，直接进入 `/workspaces` 或展示全屏空态。
2. 空态只给一个主动作：“创建工作空间并初始化默认项目”。
3. 顶部工作空间/项目选择器增加错误态和“未选择项目”的醒目提示。
4. 禁用按钮附带 tooltip，说明具体缺什么和如何补齐。

### P1-1：图表配置协议没有产品化完整消费

**问题判断**

领域类型里支持聚合、过滤、排序、TopN、时间对比，但配置面板目前只暴露维度、指标和更新图表，所有指标聚合固定为 `sum`。这会限制真实 BI 分析，尤其是 count、avg、max/min、TopN、时间同比/环比。

**证据**

- `frontend/src/types/domain.ts:176-203`：query config 类型支持聚合、过滤、排序、TopN、时间对比。
- `frontend/src/features/charts/ChartConfigPanel.tsx:646-659`：`buildQueryConfig` 固定 `aggregation: 'sum'`。
- `backend/internal/services/dataset_query.go:247-317`：后端已有聚合、过滤、排序校验。

**建议**

1. 指标字段配置支持聚合方式、别名、格式化、单位、精度。
2. 增加过滤、排序、TopN、limit 的 UI。
3. 时间对比从类型定义落到前后端实现，明确时间字段识别和输出字段。
4. 保存前校验字段引用是否仍存在于数据集。

### P1-2：图表类型规则没有驱动交互校验

**问题判断**

`chartDefinitions` 已定义每种图表的 `minDimensions/minMeasures/requiresDataset`，但配置面板的预览按钮统一要求维度和指标都存在。这与指标卡、明细表、文本组件等类型的真实需求不一致。

**证据**

- `frontend/src/features/charts/chartUtils.ts:20-39`：不同图表定义了不同维度/指标数量。
- `frontend/src/features/charts/ChartConfigPanel.tsx:267-269`：统一要求 datasetId、dimensions、measures。

**建议**

1. 用 `chartDefinitions` 驱动预览按钮可用性、字段槽提示和保存校验。
2. 指标卡允许 0 维度 + 1 指标；明细表允许多字段但不强制指标。
3. 禁用态显示具体原因，例如“指标卡至少需要 1 个指标”。
4. 文本组件完全跳过数据源配置。

### P1-3：筛选栏与运行时预览数据耦合过强

**问题判断**

筛选控件候选值依赖 `runtimeRows` 生成，并会 normalize 掉不在候选值中的已选值。由于新保存会剥离 `previewRows`，重新打开草稿时可能没有 runtime rows，从而导致筛选值被清空或无法操作。

**证据**

- `frontend/src/store/designerStore.ts:76`：load 时尝试从历史 `previewRows` 恢复 runtimeRows。
- `frontend/src/store/designerStore.ts:207-210`：保存时剥离 `previewRows`。
- `frontend/src/features/charts/DashboardFilterBar.tsx:276-290`：normalize 会过滤不在候选中的 values。
- `frontend/src/features/charts/DashboardFilterBar.tsx:317-344`：候选值从 runtimeRows 或 previewRows 计算。

**建议**

1. 筛选配置和候选值分离，保存的筛选值不因当前预览为空被清除。
2. 候选值可从数据集 distinct query 获取，而不是只依赖图表预览数据。
3. 发布页提供消费者筛选控件，用户操作时重新过滤或重新查询。
4. 支持“默认筛选值”和“运行时筛选值”两个层次。

### P1-4：联动目前是静态配置，不是真正交互联动

**问题判断**

面板有 `enableLinkage/linkageMode`，但图表渲染没有点击事件流，没有选中态，没有清除联动，没有 highlight。当前更像“预设筛选配置”，不是用户理解中的图表联动。

**证据**

- `frontend/src/features/charts/ChartConfigPanel.tsx:408-434`：只配置参与联动和联动方式。
- `frontend/src/features/charts/ChartRenderer.tsx:502-540`：渲染器只读取 dashboard filters 做过滤。
- `frontend/src/features/charts/DashboardView.tsx:27-32`：发布页仅渲染图表。

**建议**

1. 建立事件模型：`chart click -> linkage event -> filter/highlight state -> target widgets`。
2. UI 显示当前联动条件，并提供“一键清除”。
3. 支持字段映射，例如 A 图 `region` 联动 B 图 `area_name`。
4. 区分编辑态联动配置和消费态联动操作。

### P1-5：前端权限判断与后端项目权限不一致

**问题判断**

后端已经有项目成员读写权限，但前端多个页面只用全局 `user.role === admin/editor` 判断是否可写。这样会出现项目 owner/editor 在全局角色为 viewer 时前端按钮被禁用，或者后端项目级只读但前端显示写入口。

**证据**

- `backend/internal/handlers/governance_helpers.go:99-119`：后端按项目成员/空间成员判断读写。
- `frontend/src/pages/ChartEditorPage.tsx:30`：前端 `canWrite` 来源是全局角色。
- `frontend/src/pages/WorkspacesPage.tsx:37`：空间页面也用全局角色判断管理能力。
- `frontend/src/pages/ChartsPage.tsx:73`：图表列表写权限也用全局角色。

**建议**

1. `/auth/me` 或 workspace/project 接口返回当前 project role。
2. 前端 `canWrite/canManage` 使用当前项目角色，而不是只看全局角色。
3. 后端 403 错误在前端转成明确提示：“你在当前项目是 viewer”。
4. 权限切换工作空间/项目后刷新按钮状态。

### P1-6：数据源安全基线仍需产品化

**问题判断**

数据源连接测试会按用户填写 host/port 发起服务端连接。SQL 只读校验依赖字符串规则，方向正确但不能替代数据库只读账号、网络隔离和执行超时策略。生产 BI 必须把这类能力当成安全产品能力，而不是仅技术校验。

**证据**

- `backend/internal/handlers/data_source_handler.go:198-213`：测试连接会打开用户配置的数据源。
- `backend/internal/services/data_source.go:18`：按数据源配置打开连接。
- `backend/internal/services/dataset_query.go:492-508`：只读 SQL 校验基于前缀、分号、注释、关键词。

**建议**

1. 数据源 host allowlist/denylist，禁止连接云元数据地址、内网敏感段、localhost 等高风险地址。
2. 数据库账号权限检测，提示必须使用只读账号。
3. MySQL/Postgres 设置 statement timeout/read-only transaction。
4. 连接测试结果展示“网络可达、账号权限、只读校验、版本信息”。

### P1-7：订阅还不是完整业务闭环

**问题判断**

订阅模型有 format、frequency、enabled、nextRunAt，但没有收件人、渠道、时区、失败重试；后端只有手动运行，当前 scheduler 是数据集缓存刷新，不调度 dashboard subscription。因此它更像“订阅记录”，还不是可交付订阅能力。

**证据**

- `backend/internal/models/models.go:278-294`：订阅模型缺少接收人/渠道。
- `backend/internal/handlers/dashboard_handler.go:451-500`：支持手动 run。
- `backend/internal/services/dataset_scheduler.go:14-47`：scheduler 只处理数据集刷新。

**建议**

1. 增加订阅渠道：邮件、webhook、企业微信/飞书/Slack 等。
2. 增加收件人、时区、发送时间、失败重试、最近错误。
3. 服务端 scheduler 扫描 `DashboardSubscription.nextRunAt` 并真实投递。
4. 前端治理面板展示投递历史和失败原因。

### P2-1：消费页缺少 viewer 端交互

**问题判断**

编辑器有筛选栏配置，但发布页和公开页只渲染 `DashboardView`，没有消费者可操作的筛选、刷新、查看数据、导出局部图表等能力。对业务用户来说，消费页是 BI 的主要价值场景，不应只是静态看板。

**证据**

- `frontend/src/pages/ChartEditorPage.tsx:227`：编辑器渲染 `DashboardFilterBar`。
- `frontend/src/features/charts/DashboardView.tsx:27-32`：消费页只渲染 widget。

**建议**

1. 发布页复用或拆出 viewer 版筛选栏。
2. 支持刷新数据、查看数据明细、图表局部导出。
3. 显示数据更新时间、缓存命中、查询耗时。
4. 嵌入页提供轻量模式，但仍保留必要错误态和加载态。

### P2-2：分享治理 UI 没有暴露完整能力

**问题判断**

API client 已有更新/删除 share link 能力，但治理面板主要支持创建和展示 token 前缀。过期时间、停用、删除、复制 embed 链接、访问统计等对真实分享管理很关键。

**证据**

- `frontend/src/api/client.ts:252-263`：有 update/delete share link API。
- `frontend/src/features/charts/DashboardGovernancePanel.tsx:183-206`：表格只展示名称、前缀、状态、嵌入。
- `backend/internal/handlers/dashboard_handler.go:281-331`：后端支持更新和删除。

**建议**

1. 分享列表提供复制分享链接、复制 embed 链接、停用、编辑、删除。
2. 创建时支持过期时间和可选访问密码。
3. 显示最近访问时间、访问次数、访问来源。
4. 支持按版本创建分享链接。

### P2-3：响应式和信息架构还偏后台桌面原型

**问题判断**

全局 `min-width: 1180px`，发布画布以绝对定位和固定宽度为主。编辑器偏桌面端是合理的，但发布消费页通常会被业务用户在不同尺寸查看，至少需要消费页响应式或缩放策略。

**证据**

- `frontend/src/styles/global.css:5-10`：根节点 `min-width: 1180px`。
- `frontend/src/features/charts/DashboardView.tsx:14-31`：发布画布根据 widget 绝对坐标计算宽高。
- `frontend/src/styles/global.css:1472-1478`：发布画布 overflow auto。

**建议**

1. 明确编辑器只支持桌面端，消费页单独做响应式。
2. 消费页支持缩放、适配容器、移动端单列布局。
3. 顶部导航增加 active 状态、面包屑和当前项目角色。
4. 空态、禁用态、权限原因用明确文案替代沉默禁用。

## 当前已改善但仍需验证的点

| 项目 | 当前状态 | 后续建议 |
|---|---|---|
| 图表配置支持 SQL 数据集 | 当前工作区 `ChartConfigPanel.tsx` 已出现 `sql` 选项 | 增加 e2e：创建 SQL 数据集 -> 编辑器选择 SQL -> 拖字段 -> 更新图表 -> 保存发布 |
| group/tag 跨项目引用 | 当前 diff 已把校验限定到 `project_id`，并补测试 | 运行后端测试并提交，继续检查 dataset/dataSource/share/subscription 的跨项目引用 |
| 单图渲染错误边界 | 已有 `SafeChartRenderer` | 发布页还需 widget 级查询错误，不只是渲染错误 |
| 查询日志 | 已有 DatasetQueryLog | 增加 actor/source/shareLinkId/ip/errorCode，治理面板可视化 |

## 优先级路线图

### P0：先保证主闭环正确

1. 发布原子化：保存当前配置、创建版本快照、发布、返回查看入口。
2. 数据集创建支持保存前预览和字段探测。
3. 查询权限下沉到数据执行层，执行 `Dataset.Policy`。
4. 发布页返回 widget 级运行状态和错误。
5. 空 workspace/project onboarding，避免核心按钮沉默禁用。
6. 数据源安全基线：host allowlist/denylist、只读账号、数据库级 timeout。

### P1：补可信语义和治理深度

1. Query builder 产品化：聚合、过滤、排序、TopN、时间对比。
2. 图表定义驱动校验，不同图表有不同字段要求。
3. 筛选值与运行时预览解耦，发布页支持 viewer 筛选。
4. 真正的图表交互联动：点击、筛选、高亮、清除。
5. 前端权限改用当前项目角色。
6. 查询/分享/导出审计可视化。
7. 订阅增加渠道、收件人、调度与失败重试。

### P2：提升消费体验和运营能力

1. 分享管理补齐复制、停用、编辑、删除、过期、访问统计。
2. 消费页响应式、缩放、移动端单列。
3. 导出支持指定 widget、多 widget、异步导出。
4. dirty state、离开确认、撤销/重做、布局冲突提示。
5. 项目成员治理增加最后 owner 保护、成员删除、目录循环检测、项目内标签唯一。

## 最终判断

LightBI 的产品方向是成立的，当前最有价值的不是继续堆更多图表类型，而是把“数据可信 -> 编辑可信 -> 发布可信 -> 消费可信 -> 治理可信”打通。

如果目标是作品集或面试展示，当前项目已经可以讲出完整架构和主流程。  
如果目标是生产级 BI，下一阶段应优先处理发布版本、数据集创建、查询权限、消费错误态和数据源安全，而不是继续扩展页面数量。
