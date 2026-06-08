# LightBI 生产上线客观评估报告

生成日期：2026-06-08  
分析范围：`/Users/lufeiz/Downloads/项目/codexProject/lightbi-codex` 当前工作树  
方法：第一性原理拆解 + 项目规则审阅 + 本地代码审阅 + 3 个只读 explorer 分视角评估 + 构建/测试验证

## 一句话判断

LightBI 不是空壳项目，已经具备 BI MVP 的主要骨架：登录鉴权、工作空间/项目权限、数据源、SQL 数据集、图表/仪表盘编辑器、发布分享、版本审计、导出和订阅都有实际代码落点。

但按生产环境上线标准看，它还不是可以直接承载企业生产数据的 BI 平台。当前更适合定位为 **可演示、可内测、可继续迭代的 BI MVP 骨架**。如果要面向真实生产环境，必须先补齐数据权限下沉、公开分享安全、发布原子性、迁移/部署/CI、可观测性和 E2E 稳定性。

综合生产就绪评分：**5.2 / 10**。

上线建议：**不建议直接生产上线；可以用于无敏感数据的演示、作品集、受控内测或继续工程化迭代。**

## 当前工作树状态

评估开始和结束时工作树均非干净状态：

- 已修改：`backend/internal/handlers/chart_handler.go`、`backend/internal/handlers/governance_integration_test.go`、`frontend/src/features/charts/ChartConfigPanel.tsx`
- 未跟踪：`AGENTS.md`、`docs/`、`PROJECT_EVALUATION_REPORT.md`、`PRODUCT_DESIGN_UX_OPTIMIZATION_REPORT.md`

本次只新增本报告文件，没有修改业务代码，也没有覆盖既有报告。当前未提交 diff 中已经修复了旧报告里的两个问题：图表配置面板支持 `sql` 数据集，以及 group/tag 引用按项目校验。

## 第一性原理

生产级 BI 的本质不是“能画图”，而是把数据变成 **可信、可复用、可发布、可消费、可追责、可恢复** 的决策资产。它至少要满足七个底层条件：

1. 数据来源可信：外部数据源接入必须受网络、账号、SQL、限流和审计约束。
2. 数据口径可信：字段、指标、聚合、过滤、权限策略要可验证、可复用、可演进。
3. 权限边界可信：用户、项目、分享链接、导出任务都不能绕过同一套数据访问策略。
4. 发布结果稳定：发布必须是原子快照，消费侧不能读到编辑中的不一致状态。
5. 故障显性可恢复：单个图表查询失败、渲染失败、导出失败必须可见、可定位、可审计。
6. 交付可重复：构建、部署、迁移、回滚、备份、CI/CD 必须可重复执行。
7. 运行可观测：日志、指标、trace、性能、告警、审计要形成闭环。

LightBI 现在已经覆盖了很多对象和页面，但多个关键生产闭环仍停留在 MVP 层。

## 多视角评分

| 视角 | 评分 | 结论 |
|---|---:|---|
| 后端/API/数据安全 | 5.3 / 10 | 路由、鉴权、refresh token、SQL 查询防线都有基础；但服务层缺 actor/scope，上线最大风险是跨项目 dataset/runtime 查询、公开分享 DTO 和数据源网络边界。 |
| 前端/BI 体验/渲染性能 | 5.3 / 10 | 编辑器、registry、错误边界、动态加载已成型；但图表字段规则未完全驱动 UI，联动不是真实图表交互，拖拽/渲染性能和响应式不足。 |
| 工程运维/质量门禁 | 4.2 / 10 | 本地脚本和 README 可用；但缺 Docker/部署/CI/CD/显式 migration/可观测性，生产交付不可重复。 |
| 综合生产就绪 | 5.2 / 10 | 适合继续迭代，不适合直接接生产数据、外部客户或高敏多租户场景。 |

## 主要优势

1. **主领域对象完整，不是纯 UI mock。** 后端模型覆盖 `Workspace`、`Project`、`Dataset`、`DataSource`、`Chart`、`ChartVersion`、`AuditLog`、`DashboardShareLink`、`DashboardSubscription`，并带 workspace/project 字段。证据：`backend/internal/models/models.go:78`、`backend/internal/models/models.go:107`、`backend/internal/models/models.go:207`、`backend/internal/models/models.go:229`、`backend/internal/models/models.go:245`、`backend/internal/models/models.go:259`、`backend/internal/models/models.go:278`。

2. **认证基础比普通 demo 扎实。** refresh token 使用 HttpOnly cookie，落库为 hash，刷新过程在事务中加行锁并执行单次轮换。证据：`backend/internal/handlers/auth_handler.go:196`、`backend/internal/handlers/auth_handler.go:198`、`backend/internal/handlers/auth_handler.go:212`、`backend/internal/handlers/auth_handler.go:302`。

3. **图表配置协议有前后端护栏。** 前端保存 `ChartDocument.version = 2`，保存时剥离 `previewRows`；后端限制 widget 数、字段引用、文本长度，并清洗 `textHtml`。证据：`frontend/src/store/designerStore.ts:167`、`frontend/src/store/designerStore.ts:207`、`frontend/src/features/charts/chartConfigValidation.ts:10`、`backend/internal/handlers/chart_config.go:14`、`backend/internal/handlers/chart_config.go:84`。

4. **数据集查询方向正确。** 查询层具备字段白名单、聚合白名单、过滤/排序校验、limit 上限、查询超时、并发闸门、缓存和审计日志。证据：`backend/internal/services/dataset_query.go:93`、`backend/internal/services/dataset_query.go:123`、`backend/internal/services/dataset_query.go:247`、`backend/internal/services/dataset_query.go:266`、`backend/internal/services/dataset_query.go:348`、`backend/internal/services/dataset_query.go:492`。

5. **前端渲染有基础可靠性意识。** 图表有错误边界，G2/S2 动态 import，IntersectionObserver 延迟初始化，富文本前端 DOMPurify。证据：`frontend/src/features/charts/ChartRenderer.tsx:36`、`frontend/src/features/charts/ChartRenderer.tsx:72`、`frontend/src/features/charts/ChartRenderer.tsx:121`、`frontend/src/features/charts/ChartRenderer.tsx:252`、`frontend/src/features/charts/ChartRenderer.tsx:429`、`frontend/src/features/charts/ChartRenderer.tsx:350`。

6. **生产配置已有初步安全校验。** `production/prod` 会拒绝默认 JWT secret、默认 MySQL DSN、默认 seed 密码、默认数据源密钥和生产 seed。证据：`backend/internal/config/config.go:61`、`backend/internal/config/config.go:65`、`backend/internal/config/config.go:88`、`backend/internal/config/config.go:104`。

7. **验证命令存在且大部分通过。** 本次 `go test ./...`、前端 `typecheck` 和生产 `build` 均通过，说明基础工程完整性尚可。

## 生产阻断风险

### P0-1：数据查询权限没有下沉到服务层

`ExecuteDatasetQuery` 只接收 `datasetID` 和 query request，不接收 actor、project、share link、source 等上下文。登录态 query 在 handler 层先做项目读权限，但发布页、公开分享、导出会从 chart config 里的 `datasetId` 直接执行查询。保存 chart config 时也没有验证每个 widget 的 `datasetId` 必须属于同项目。

这违反生产 BI 的核心原则：**数据访问策略必须贴近数据执行层，而不是依赖每个 handler 自觉检查。**

证据：

- `backend/internal/services/dataset_query.go:93`
- `backend/internal/handlers/dataset_handler.go:304`
- `backend/internal/handlers/dashboard_handler.go:599`
- `backend/internal/handlers/dashboard_handler.go:635`
- `backend/internal/handlers/chart_config.go:84`

风险：如果某个用户能构造或保留跨项目 `datasetId`，公开页、导出或发布 runtime query 可能绕过项目隔离读取数据。

### P0-2：公开分享返回完整 Chart 对象，公开 DTO 不够收敛

公开分享接口校验 token、enabled、expiresAt、allowEmbed，这是优点。但接口返回 `publishedDashboard{Chart: chart}`，并且 public share 预加载 `Creator`。`models.User` 包含 email/phone JSON 字段，`Chart` 也包含 config、tags、group、creator 等内部对象。

公开访问应该返回专用 DTO，只暴露消费端需要的信息。

证据：

- `backend/internal/handlers/dashboard_handler.go:29`
- `backend/internal/handlers/dashboard_handler.go:119`
- `backend/internal/handlers/dashboard_handler.go:125`
- `backend/internal/models/models.go:10`
- `backend/internal/models/models.go:222`

风险：公开链接可能泄露创建者联系方式、内部配置和治理对象结构。

### P0-3：发布不是严格原子闭环

已有 chart 的“发布”只调用 `api.publishChart(chartId)`，不会先保存当前编辑器内存态；后端 publish 基于数据库里已有 chart config 创建版本快照。另一路“保存并发布”调用 `saveDashboard('published')`，但 `Create/Update` 路径只是写 status，不创建版本快照。

生产 BI 的发布必须是“保存当前 payload -> 校验 -> 创建不可变版本 -> 更新发布指针 -> 审计”的原子动作。

证据：

- `frontend/src/pages/ChartEditorPage.tsx:138`
- `frontend/src/pages/ChartEditorPage.tsx:145`
- `frontend/src/pages/ChartEditorPage.tsx:159`
- `backend/internal/handlers/chart_handler.go:253`
- `backend/internal/handlers/chart_handler.go:337`
- `backend/internal/handlers/dashboard_handler.go:644`

风险：用户以为发布的是刚编辑的内容，实际发布旧版本；或者状态为 published 但版本治理缺少对应快照。

### P0-4：发布/公开消费侧查询失败被吞掉

公开页和已发布页执行 widget runtime query 时，如果单个图表查询失败，后端直接 `continue`；前端收到缺失 rows 后显示通用占位“配置数据源后点击更新图表”。业务消费者无法知道是无数据、未配置、无权限还是查询失败。

证据：

- `backend/internal/handlers/dashboard_handler.go:617`
- `backend/internal/handlers/dashboard_handler.go:635`
- `backend/internal/handlers/dashboard_handler.go:637`
- `frontend/src/features/charts/ChartRenderer.tsx:653`
- `frontend/src/features/charts/ChartRenderer.tsx:691`

风险：生产事故会被伪装成空图表，无法定位、无法告警、无法追责。

### P0-5：外部数据源和 SQL 边界不足以承载生产数据

SQL 数据集做了单语句、SELECT/WITH、禁用关键字和参数绑定，这是必要基础。但它仍是字符串/正则防线，不是 SQL AST，也不是数据库强制只读。数据源 host/port 由 editor 填写并可测试连接，缺少内网 denylist、出口 allowlist 或连接代理隔离；连接失败还直接返回底层错误。

证据：

- `backend/internal/services/dataset_query.go:492`
- `backend/internal/services/dataset_query.go:502`
- `backend/internal/services/data_source.go:18`
- `backend/internal/services/data_source.go:64`
- `backend/internal/handlers/data_source_handler.go:191`
- `backend/internal/handlers/data_source_handler.go:204`

风险：SSRF/内网探测、危险 SELECT 扩展、弱只读保障、连接错误泄露内部网络细节。

### P0-6：生产交付链路缺失

仓库未发现 Dockerfile、docker-compose、K8s/Helm、CI workflow、部署脚本、反向代理配置、环境分层模板。README 明确是本地启动说明，并提示生产建议显式 migration，但没有给出迁移工具链。后端仍以 `AutoMigrate` 为主体，versioned migration 当前只有 baseline no-op。

证据：

- `README.md:136`
- `README.md:195`
- `README.md:255`
- `backend/internal/database/database.go:21`
- `backend/internal/database/database.go:56`
- `frontend/package.json:5`

风险：生产环境不可重复发布，数据库变更不可控，失败回滚和备份恢复没有工程支撑。

### P0-7：E2E 门禁不绿，且测试覆盖不足

本次后端单测和前端静态检查通过，但 E2E 提权后实际结果为 1 通过、1 失败。失败用例在登录按钮 click 等待稳定时 30 秒超时。后端 `go test -cover ./...` 显示 handlers 覆盖率 15.6%，database/router/middleware 为 0%。前端只有一份 Playwright mock API happy path，没有组件/单元测试。

证据：

- `frontend/e2e/lightbi.spec.ts:13`
- `frontend/e2e/lightbi.spec.ts:27`
- `frontend/e2e/lightbi.spec.ts:45`
- `frontend/package.json:5`

风险：发布前无法稳定证明核心链路可用；真实前后端契约、分享/embed、SQL、导出、权限错误态没有足够自动化覆盖。

## 重要非阻断问题

1. **图表规则没有完整驱动配置 UI。** `metricCard` 定义 0 维度 + 1 指标，`detailTable` 定义 1 维度 + 0 指标，但更新预览统一要求维度和指标都存在。证据：`frontend/src/features/charts/chartUtils.ts:22`、`frontend/src/features/charts/ChartConfigPanel.tsx:214`、`frontend/src/features/charts/ChartConfigPanel.tsx:267`。

2. **查询协议未被产品化消费。** 类型和后端支持 aggregation、filters、sorts、topN、timeComparison，但配置面板只暴露维度/指标，指标聚合固定 `sum`。证据：`frontend/src/types/domain.ts:176`、`frontend/src/features/charts/ChartConfigPanel.tsx:646`、`backend/internal/services/dataset_query.go:651`。

3. **联动更像静态筛选，不是真实图表联动。** 配置面板只有开关和模式，渲染器没有 chart click/brush/select 事件流，发布查看页也没有消费态筛选栏。证据：`frontend/src/features/charts/ChartConfigPanel.tsx:407`、`frontend/src/features/charts/ChartRenderer.tsx:502`、`frontend/src/features/charts/DashboardView.tsx:31`。

4. **渲染和拖拽性能还有生产风险。** G2/S2 数据变化会走 effect 重建实例；拖拽/缩放每个 pointermove 都写 Zustand，没有 throttle/debounce。证据：`frontend/src/features/charts/ChartRenderer.tsx:113`、`frontend/src/features/charts/ChartRenderer.tsx:210`、`frontend/src/features/charts/DesignerCanvas.tsx:82`、`frontend/src/features/charts/DesignerCanvas.tsx:104`。

5. **响应式和可访问性不足。** 全局 `min-width: 1180px`，发布画布最小 960px，编辑器固定三列，画布 widget 主要依赖 pointer。证据：`frontend/src/styles/global.css:9`、`frontend/src/styles/global.css:370`、`frontend/src/features/charts/DashboardView.tsx:14`、`frontend/src/features/charts/DesignerCanvas.tsx:125`。

6. **配置安全还不完整。** 生产配置没有强制 `COOKIE_SECURE=true`，没有校验 secret 长度/熵，也没有拒绝 `.env.example` 中 `replace-with-*` 占位值。证据：`backend/internal/config/config.go:47`、`backend/internal/config/config.go:88`、`backend/internal/handlers/auth_handler.go:302`、`backend/.env.example:4`。

7. **可观测性未闭环。** 目前主要是 Gin 默认 logger、简单 health、前端 dispatch performance event；没有结构化日志、request id、Prometheus/OpenTelemetry、告警、前端指标上报。证据：`backend/internal/router/router.go:18`、`backend/internal/router/router.go:41`、`frontend/src/features/charts/chartUtils.ts:86`、`frontend/src/features/charts/chartUtils.ts:185`。

## 验证结果

| 命令 | 结果 | 说明 |
|---|---|---|
| `git status -sb` | 通过 | 工作树非干净，见“当前工作树状态”。 |
| `GOCACHE=/private/tmp/lightbi-go-cache go test ./...` | 通过 | 后端测试通过。 |
| `GOCACHE=/private/tmp/lightbi-go-cache go test -cover ./...` | 通过但覆盖不足 | handlers 15.6%，services 46.7%，config 42.9%，database/router/middleware 0%。 |
| `npm run typecheck` | 通过 | TypeScript 检查通过。 |
| `npm run build` | 通过但有警告 | Webpack compiled with 2 warnings；`main` 798 KiB，多个 async chunks 439-942 KiB，超过 244 KiB 推荐阈值。 |
| `npm run e2e` | 失败 | 沙箱内先因 `listen EPERM 127.0.0.1:3001` 失败；提权后 2 条用例中 1 条通过、1 条因登录按钮 click 等待 stable 超时失败。 |

## 上线前 P0 清单

1. **查询上下文下沉**：为 `ExecuteDatasetQuery` 增加 `QueryContext{actorID, projectID, source, shareLinkID, ip, userAgent}`，在服务层校验 dataset 与 chart/project/share 策略，落实 `Dataset.Policy`。

2. **保存/发布校验 dataset 引用**：后端 normalize chart config 时解析所有 widget 的 `datasetId`，确认 dataset 属于同一 project，字段仍存在，敏感字段不能公开分享或导出。

3. **公开分享专用 DTO**：公开 API 不返回 GORM `Chart` 全对象，不返回 creator email/phone，不暴露内部治理字段；公开访问写访问日志和失败审计。

4. **发布原子化**：提供 `SaveAndPublish` 或事务动作：保存当前 payload、校验、创建版本快照、更新发布状态、返回版本信息、写审计；公开分享绑定发布快照而不是可变当前配置。

5. **runtime 状态协议**：后端返回每个 widget 的 `success/empty/error/cached/durationMs/errorCode`，前端区分未配置、无数据、查询失败、无权限、字段失效。

6. **数据源与 SQL 加固**：数据源 host allowlist/denylist、私网策略或连接代理；强制生产只读 DB 账号；SQL 使用解析器或数据库只读事务/statement timeout；连接错误脱敏。

7. **生产部署和迁移**：补 Docker/部署脚本/反向代理/静态资源托管/健康检查；迁移从 `AutoMigrate` 转为显式 migration 文件、checksum、回滚、备份恢复流程。

8. **CI/CD 门禁**：增加 CI workflow，至少跑后端 test/coverage、前端 typecheck/build/e2e、lint、安全扫描、构建体积检查；E2E 必须稳定为绿。

9. **可观测性闭环**：结构化日志、request id、错误码、Prometheus/OpenTelemetry、关键业务指标、前端性能上报、查询失败告警、审计失败处理。

## P1 改进路线

1. 用 `chartDefinitions` 驱动配置面板、预览按钮、保存校验和空态说明。
2. 把聚合、排序、TopN、过滤、时间对比做成可配置 UI，而不是固定 `sum`。
3. 做真实图表联动：chart click/brush/select -> `DashboardFilters` -> 影响范围计算 -> 目标 widget 刷新/高亮。
4. 优化 G2/S2 生命周期：保留实例，数据变化走 update/changeData，resize debounce，不可见图表不重渲染。
5. 做发布消费页响应式：查看态和编辑态画布分离，支持缩放、移动端单列或嵌入容器适配。
6. 数据集创建支持保存前 SQL 预览、自动识别字段、字段角色/类型确认、schema 变更影响提示。
7. 订阅从应用内记录扩展到真实投递通道，并加入投递失败重试/告警。

## 最终结论

这个项目的优点是 **对象完整、方向正确、工程不是空壳、已有部分安全和验证意识**。它已经能展示一个 BI 系统从数据源、数据集、编辑器到发布治理的主干能力。

它距离生产上线的差距不是“再补几个页面”，而是生产 BI 最关键的底层保障还不够：数据权限没有下沉到执行层，公开分享 DTO 和 runtime 状态不安全，发布不原子，外部数据源边界不够硬，迁移/部署/CI/可观测性缺位，E2E 当前不绿。

客观判断：**当前可作为高质量 MVP/作品集/受控内测基础，不应直接作为企业生产 BI 平台上线。**

## 本次使用的 Skill/Rule

- 全局 Skill：`bi-engineering-helper`
- Superpowers：`using-superpowers`、`dispatching-parallel-agents`
- 项目规则：`AGENTS.md`
- 项目 runbook/rules：`docs/skills-and-rules/README.md`、`docs/skills-and-rules/rules/bi-code-review-checklist.md`、`docs/skills-and-rules/rules/schema-api-rules.md`、`docs/skills-and-rules/rules/bi-chart-rules.md`、`docs/skills-and-rules/rules/dashboard-performance-rules.md`
