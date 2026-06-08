# Dashboard Performance Rules

## 目标

保证 LightBI Dashboard 在多图表、大数据、多接口、多交互场景下可用、可测、可优化。

## 1. 加载规则

- 首屏只加载核心页面能力和可视区域附近的图表。
- 非可视区域图表必须延后初始化；当前 `ChartRenderer` 的 IntersectionObserver 行为不能被移除。
- G2、S2、X6、导出、编辑器等重依赖必须按页面或图表类型动态加载。
- 新增重依赖必须通过 `npm run build` 检查 chunk 体积和 warning。
- Dashboard 配置、字段字典、低频枚举值可以缓存，但必须尊重 workspace/project 权限边界。
- 同 dataset、同 query 的重复请求应合并或命中缓存。

## 2. 渲染规则

- 多个图表不能无控制地同一时刻初始化，应按可视区域、优先级或批次渲染。
- 数据变化优先走 update/changeData，不允许默认 destroy + new。
- resize 必须统一 debounce；不可见图表不执行 resize 和重渲染。
- G2/S2 渲染必须记录 `CHART_RENDER`。
- 编辑器拖拽和缩放必须记录 `EDITOR_INTERACTION`。
- 单个图表失败必须展示错误态或空态，不能造成 Dashboard 整页白屏。

## 3. 大数据规则

- 后端能聚合、排序、筛选、limit 时，前端不能拉全量硬算。
- 趋势图展示层允许采样或聚合，但必须保留极值和关键拐点。
- 明细数据必须分页、虚拟滚动或按需加载。
- 表格导出走后端导出或异步任务，不通过前端渲染百万行。
- 大数据 rows 不进入 `ChartDocument`；保存 payload 必须剥离 `previewRows`。
- 运行时 rows 更新要限定到 widget 粒度，避免刷新整个 Dashboard store。

## 4. 交互规则

- pointermove、resize、filter、tooltip、brush 等高频动作必须节流或批处理。
- 拖拽和缩放过程中只更新必要几何字段。
- 筛选联动必须计算影响范围，不能一次交互刷新所有图表。
- 时间筛选和维度筛选必须优先复用已有 runtimeRows；确需重新 query 时要合并请求。
- 不可见图表不参与联动重渲染，除非其数据状态需要预热。

## 5. 验证规则

- 性能优化必须有优化前基线和优化后对比。
- 对比必须在相同页面、相同数据量、相同网络环境、相同操作路径下进行。
- 指标至少包括 FCP、LCP、INP、CHART_RENDER、EDITOR_INTERACTION、接口数量、资源体积、内存峰值。
- build warning 不能忽略；如果暂不处理，必须在结论里说明。
- e2e 本地 bind 或浏览器环境失败时，要明确是环境 blocker 还是代码 blocker。

## 6. 建议指标门槛

| 指标 | 目标 |
|---|---:|
| FCP | <= 1800 ms 为 good |
| LCP | <= 2500 ms 为 good |
| INP | <= 200 ms 为 good |
| CHART_RENDER | <= 100 ms 为 good，<= 300 ms 可接受 |
| EDITOR_INTERACTION | <= 100 ms 为 good，<= 300 ms 可接受 |

这些门槛沿用当前 `chartUtils.ts` 的 rating 逻辑；后续如调整评分，也要同步更新本文件。
