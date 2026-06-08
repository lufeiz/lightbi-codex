# LightBI Optimization Traceability

Date started: 2026-06-08

This file is the audit trail for the production-readiness optimization plan. Each item links the original risk, implementation scope, acceptance criteria, and verification commands.

| ID | Milestone | Risk / Product Gap | Implementation Scope | Acceptance Evidence |
|---|---|---|---|---|
| LBI-OPT-001 | Traceability | Improvements were not tied to measurable outcomes. | Add this traceability log and keep it updated per milestone. | This file exists and records changed areas, test commands, and residual risks. |
| LBI-OPT-002 | Query safety | Dataset queries could execute without actor/project/share context. | Add `DatasetQueryContext`, project-scoped dataset validation, and source metadata for editor, published, public, export, and scheduler queries. | Cross-project dataset query is rejected; query logs include source/project context in request summary. |
| LBI-OPT-003 | Publish atomicity | Publishing could snapshot stale saved config instead of the current editor payload. | Allow publish endpoint to receive current chart payload and snapshot inside one transaction. | Editing then publishing creates a version from the current payload. |
| LBI-OPT-004 | Public data minimization | Public share/embed returned full GORM `Chart` including internal relations. | Return a whitelisted chart DTO and hide creator/updater/private governance fields from public responses. | Public share response has no creator email/phone or internal relation objects. |
| LBI-OPT-005 | Runtime observability | Published/public runtime queries silently skipped widget failures. | Return widget-level runtime status with safe user-facing error messages. | Widget query failures are visible in API response and viewer UI. |
| LBI-OPT-006 | Chart config UX | Chart preview rules ignored chart registry and fixed metric aggregation to `sum`. | Drive preview eligibility from `chartDefinitions`; expose aggregation, sort, topN, and limit controls. | Metric card/detail table preview rules match registry; query payload contains selected aggregation/sort/topN/limit. |
| LBI-OPT-007 | Frontend performance | Editor drag/resize updated global state on every pointermove. | Batch geometry updates with `requestAnimationFrame` and preserve `EDITOR_INTERACTION` metrics. | Drag/resize interaction remains functional and emits bounded interaction metrics. |
| LBI-OPT-008 | Viewer experience | Published page was fixed-width and lacked runtime-aware error/empty states. | Add responsive viewer layout and widget runtime status rendering. | Viewer distinguishes no data, no dataset, and query failure. |
| LBI-OPT-009 | Production gates | Production boot could still allow short/default secrets, insecure cookies, auto migration, or unrestricted data-source targets. | Harden config validation for production secrets, cookie security, migration flags, data-source key, allowed hosts, and private-network blocking. | Unsafe production config is rejected; hardened production config passes. |
| LBI-OPT-010 | Data-source network safety | SQL data sources could point at private/internal hosts without a central policy. | Validate data-source hosts against allowlists and private-network blocking before create/update/test/query. | Private IPs are rejected; exact/wildcard/CIDR allowlists are covered by unit tests. |
| LBI-OPT-011 | Observability | API calls lacked a stable request correlation ID in responses. | Add request ID middleware and expose `X-Request-ID` through CORS. | Health response preserves incoming request ID and generates one when missing. |
| LBI-OPT-012 | Release gate | Validation commands were documented but not executable as one repeatable release check. | Add `scripts/verify-release.sh` with status, diff check, backend tests, frontend typecheck/build, and optional E2E. | Script can be run locally and its output is recorded in this file. |
| LBI-OPT-013 | Renderer lifecycle | G2/S2 data changes could recreate chart instances instead of updating existing instances. | Split initialization from data/size updates in `ChartRenderer`; use G2 `changeData` or mark data update and S2 `setDataCfg`/`setOptions`; emit renderer lifecycle events for smoke verification. | E2E verifies a second preview update emits `g2:update` without `destroy`, and `CHART_RENDER` remains recorded. |
| LBI-OPT-014 | Field reference integrity | Saving could accept widget field references that no longer exist in the selected dataset. | Extend chart config dataset validation to check dimension and measure field names against dataset fields before create/update/publish snapshot. | Backend integration test rejects missing dataset fields with the concrete missing field name. |
| LBI-OPT-015 | Product acceptance coverage | Milestone 1 scenarios were only partially covered by E2E. | Add Playwright coverage for SQL dataset selection, metric-card measure-only preview, detail-table dimension-only preview, invalid config save rejection, and query payload assertions. | E2E passes 4 scenarios and validates the expected query payload shapes. |
| LBI-OPT-016 | Query request efficiency | Repeated identical editor preview queries could issue duplicate network requests. | Add client-side in-flight dedupe and a short 30s cache for saved dataset preview/query requests, cleared when the access token changes. | E2E verifies the second identical preview update reuses cached data and does not send another `/datasets/:id/query` request. |
| LBI-OPT-017 | Bundle performance | Build still emitted large async vendor chunk warnings and main entrypoint warnings. | Split AntV and async vendor chunks by package/size; lazy-load AntD providers and the Router/App shell; replace initial AntD spinners with a CSS loading indicator. | `npm run build` compiles without webpack warnings; main entrypoint is 235 KiB. |
| LBI-OPT-018 | Viewer interaction | Published dashboard consumers could not adjust or clear configured business filters. | Make `DashboardView` own viewer filter state, render a compact read-only `DashboardFilterBar`, show active filter tags, and add responsive published-page filter styles. | E2E selects a published-page dimension filter, sees `区域：华东`, clears it, and the same run keeps editor/performance smoke passing. |
| LBI-OPT-019 | Dataset onboarding | SQL dataset creation still depended on manually typing field protocol before users could confirm schema. | Extend draft SQL preview to run read-only raw SQL with `LIMIT 20`, infer column roles/types, populate the frontend field confirmation table, and save the confirmed schema. | E2E creates a SQL dataset by testing SQL, auto-filling `region` and `revenue`, previewing rows, and asserting the save payload contains the confirmed fields. |
| LBI-OPT-020 | Permission UX | Core create buttons could be disabled without explaining whether the cause was missing project scope or insufficient project role. | Show explicit disabled reasons on chart, data-source, and dataset create actions; provide a project creation link when project scope is missing. | E2E logs in as a project viewer and verifies all three create buttons show `当前项目无写权限` and remain disabled. |
| LBI-OPT-021 | Readiness measurement | The original production-readiness report no longer reflected the optimized working tree. | Add `docs/optimization/reassessment-2026-06-08.md` with post-optimization score, P0 closure map, measured metrics, and external-production backlog. | Current controlled-trial readiness is reassessed at 7.1/10, with remaining production hardening explicitly separated. |

## Verification Log

- 2026-06-08 LBI-OPT-002/LBI-OPT-003/LBI-OPT-004/LBI-OPT-005:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed.
- 2026-06-08 LBI-OPT-006/LBI-OPT-007/LBI-OPT-008:
  `cd frontend && npm run typecheck` passed.
- 2026-06-08 LBI-OPT-007/LBI-OPT-008:
  `cd frontend && npm run build` passed with warnings. Main entrypoint is 560 KiB after route/layout/vendor splitting; remaining warnings are `vendor-antd` 245 KiB, `vendor-antv` 2.05 MiB, and `vendor` 1.33 MiB.
- 2026-06-08 LBI-OPT-006/LBI-OPT-007:
  `cd frontend && npm run e2e` passed outside the sandbox after the sandboxed run failed with `listen EPERM 127.0.0.1:3001`.
- 2026-06-08 LBI-OPT-009/LBI-OPT-010/LBI-OPT-011:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed. Coverage includes hardened production config acceptance/rejection, data-source private-network and allowlist policy, public DTO/runtime status, atomic publish snapshot, and request ID header behavior.
- 2026-06-08 LBI-OPT-012:
  `scripts/verify-release.sh --skip-e2e` passed. It ran `git status -sb`, `git diff --check`, backend Go tests, frontend typecheck, and frontend build. E2E was verified separately because sandboxed Playwright webServer binding failed with `listen EPERM 127.0.0.1:3001`.
- 2026-06-08 LBI-OPT-006/LBI-OPT-007/LBI-OPT-008/LBI-OPT-012:
  `cd frontend && npm run e2e` passed outside the sandbox: 2 Playwright tests passed. The editor smoke captures `CHART_RENDER` and `EDITOR_INTERACTION`, with `EDITOR_INTERACTION <= 300ms`.
- 2026-06-08 LBI-OPT-013/LBI-OPT-015:
  `cd frontend && npm run typecheck` passed after splitting renderer initialization/update paths and adding Playwright product acceptance assertions.
- 2026-06-08 LBI-OPT-014:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed. Coverage includes rejection of a chart config that references missing dataset field `missing_revenue`.
- 2026-06-08 LBI-OPT-013/LBI-OPT-015:
  `cd frontend && npm run e2e` passed outside the sandbox: 4 Playwright tests passed. Coverage includes SQL dataset selection, metric card `0 dimensions + 1 metric`, detail table `1 dimension + 0 metrics`, invalid save rejection, `CHART_RENDER`, `EDITOR_INTERACTION <= 300ms`, and renderer lifecycle update without destroy.
- 2026-06-08 LBI-OPT-013:
  `cd frontend && npm run build` passed with warnings. Main entrypoint remains 560 KiB; remaining warnings are `vendor-antd` 245 KiB, `vendor-antv` 2.05 MiB, and `vendor` 1.33 MiB.
- 2026-06-08 LBI-OPT-016:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e` passed outside the sandbox: 4 Playwright tests passed, including a request-count assertion that the second identical preview update keeps `/api/datasets/1/query` at one network request.
- 2026-06-08 LBI-OPT-016:
  `cd frontend && npm run build` passed with warnings. Main entrypoint remains 560 KiB; remaining warnings are unchanged.
- 2026-06-08 LBI-OPT-017:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run build` compiled successfully with no webpack warnings. Main entrypoint is 235 KiB, down from the previous 560 KiB in this optimization slice.
- 2026-06-08 LBI-OPT-017:
  `cd frontend && npm run e2e` passed outside the sandbox: 4 Playwright tests passed after lazy-loading AntD providers and moving `BrowserRouter` into the lazy App module.
- 2026-06-08 LBI-OPT-012/LBI-OPT-017:
  `scripts/verify-release.sh --skip-e2e` passed. It reran `git diff --check`, backend Go tests, frontend typecheck, and frontend build; build reported main entrypoint 235 KiB and no webpack warnings.
- 2026-06-08 LBI-OPT-018:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 236 KiB after adding published-page filter styles.
- 2026-06-08 LBI-OPT-018:
  `cd frontend && npm run e2e` passed outside the sandbox: 4 Playwright tests passed. Coverage includes published-page dimension filter selection, active filter summary, clear filter action, editor preview cache, `CHART_RENDER`, and `EDITOR_INTERACTION <= 300ms`.
- 2026-06-08 LBI-OPT-012/LBI-OPT-018:
  `scripts/verify-release.sh --skip-e2e` passed after the trace update. It reran `git diff --check`, backend Go tests, frontend typecheck, and frontend build; build reported main entrypoint 236 KiB and no webpack warnings. E2E remains separately verified above because it requires sandbox escalation for local server binding.
- 2026-06-08 LBI-OPT-019:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed. Coverage includes draft SQL preview helpers for limit capping, preview SQL generation, and type inference.
- 2026-06-08 LBI-OPT-019:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e` passed outside the sandbox: 5 Playwright tests passed, including SQL dataset field inference and confirmed-schema save payload assertions.
- 2026-06-08 LBI-OPT-019:
  `cd frontend && npm run build` passed with no webpack warnings. Main entrypoint remains 236 KiB.
- 2026-06-08 LBI-OPT-012/LBI-OPT-019:
  `scripts/verify-release.sh --skip-e2e` passed after the SQL dataset onboarding trace update. It reran `git diff --check`, backend Go tests, frontend typecheck, and frontend build; build reported main entrypoint 236 KiB and no webpack warnings. E2E remains separately verified above because it requires sandbox escalation for local server binding.
- 2026-06-08 LBI-OPT-020:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e` passed outside the sandbox: 6 Playwright tests passed, including project viewer disabled-reason assertions for chart, data-source, and dataset create actions.
- 2026-06-08 LBI-OPT-020:
  `cd frontend && npm run build` passed with no webpack warnings. Main entrypoint remains 236 KiB.
- 2026-06-08 LBI-OPT-012/LBI-OPT-020:
  `scripts/verify-release.sh --skip-e2e` passed after the permission UX trace update. It reran `git diff --check`, backend Go tests, frontend typecheck, and frontend build; build reported main entrypoint 236 KiB and no webpack warnings. E2E remains separately verified above because it requires sandbox escalation for local server binding.
- 2026-06-08 LBI-OPT-021:
  Added `docs/optimization/reassessment-2026-06-08.md`. This is a documentation-only measurement artifact; validation is `git diff --check`.

## Residual Risks

- Full deployment CI/CD, Prometheus/OpenTelemetry, and backup/restore remain outside this implementation slice.
