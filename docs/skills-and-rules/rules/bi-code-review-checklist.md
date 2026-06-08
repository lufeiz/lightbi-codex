# BI Code Review Checklist

用于 Chart、Dashboard、Dataset Query、发布分享、图表渲染相关变更的 review。优先找会造成数据错误、权限泄漏、历史配置失效、性能退化和线上白屏的问题。

## 1. 协议边界

- [ ] 是否绕过 `ChartDocument` 或 `ChartWidget`，直接保存图表库 option？
- [ ] 是否让 renderer 直接依赖业务接口原始返回结构？
- [ ] 是否新增 `ChartType` 但没有同步前端类型、label、registry 和后端 `ValidChartType`？
- [ ] 是否新增 schema 字段但没有默认值、normalize 或兼容逻辑？
- [ ] 是否把 `previewRows`、图表实例、DOM 引用或大数据写入持久化 config？

## 2. Renderer 生命周期

- [ ] 是否有 init、render/update、resize、destroy/cleanup？
- [ ] 数据变化是否优先 update/changeData，而不是默认销毁重建？
- [ ] 动态 import 失败是否有可见错误态？
- [ ] 单个 widget 渲染失败是否被错误边界隔离？
- [ ] cleanup 是否释放 chart/sheet/graph instance？
- [ ] 是否解绑 observer、window event listener、timer、requestAnimationFrame？

## 3. 数据和字段

- [ ] `dimensions`、`measures` 是否去重、去空、长度受限？
- [ ] `fieldLabels` 是否只做展示名映射，没有替代稳定字段名？
- [ ] `query` 是否完整表达维度、指标、过滤、排序、limit？
- [ ] 数据集字段不存在时是否能提示，而不是静默空白？
- [ ] 大数据是否下推到后端聚合、筛选、排序或 limit？
- [ ] SQL 数据集是否继续保持只读校验、参数绑定和审计？

## 4. 性能

- [ ] 是否引入重依赖但没有动态加载或 build 体积检查？
- [ ] 是否破坏可视区域优先渲染？
- [ ] 是否让不可见图表执行 resize 或重渲染？
- [ ] 高频事件是否缺少 throttle、debounce 或批处理？
- [ ] 是否用全量 rows 做前端硬算？
- [ ] 是否记录或保留 `CHART_RENDER`、`EDITOR_INTERACTION` 指标？

## 5. 联动和筛选

- [ ] 图表是否通过统一 `DashboardFilters` 协作，而不是互相直接调用？
- [ ] `chartIds`、`fieldsByChart`、field、label 的匹配是否正确？
- [ ] 时间筛选找不到 time field 时是否有安全 fallback？
- [ ] 联动影响范围是否过大？
- [ ] 高频联动是否合并触发？

## 6. 发布、分享、导出和权限

- [ ] 发布版本是否保存快照并写审计？
- [ ] 回滚后 config 是否仍能 normalize 和渲染？
- [ ] 分享链接是否校验 enabled、allowEmbed、expiresAt？
- [ ] 公开访问是否只暴露允许的数据和能力？
- [ ] 导出是否尊重 widgetId、权限和数据量限制？
- [ ] workspace/project 隔离是否没有被绕过？

## 7. 稳定性和安全

- [ ] loading、empty、error 是否都有用户可见状态？
- [ ] 接口失败是否有兜底，不会导致整页白屏？
- [ ] 字段缺失、类型异常、空数据是否可处理？
- [ ] 富文本是否继续 DOMPurify sanitize？
- [ ] 后端是否 sanitize `textHtml` 并剥离 runtime-only 字段？
- [ ] 错误信息是否避免泄露敏感连接串、token 或 SQL 细节？

## 8. 验证

- [ ] 前端类型变更执行 `npm run typecheck`。
- [ ] 前端渲染、依赖或 bundle 变更执行 `npm run build`。
- [ ] 编辑器、发布、分享、筛选或交互变更执行 `npm run e2e`。
- [ ] 后端 schema、query、权限、发布治理变更执行 `GOCACHE=/private/tmp/lightbi-go-cache go test ./...`。
- [ ] 不能执行的命令必须说明原因，并区分环境 blocker 与代码 blocker。
