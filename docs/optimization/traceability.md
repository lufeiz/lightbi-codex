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
| LBI-OPT-022 | V1 asset metadata closure | Dashboard description, group, and tags existed in payload but were not editable in the editor header workflow. | Add an editor asset-info drawer backed by chart groups/tags, write description/groupId/tagIds into designer meta, keep `stripRuntimeConfig` persistence, and show an unclassified-asset warning before publish. | E2E edits asset description/group/tags, saves a clean payload without `previewRows`, and filters the dashboard list by group/tag. |
| LBI-OPT-023 | V2 dashboard information architecture | User-facing routes and list columns still mixed Chart and Dashboard concepts, including `首图类型`. | Add Dashboard semantic routes while keeping `/charts/*` compatibility, change the primary navigation to `仪表盘`, and replace first-chart-type list display with component count and data-health indicators. | E2E verifies `/dashboards` and `/dashboards/:id/edit`, old `/charts/:id/edit` compatibility, visible `组件数`/`数据健康`, and no visible `首图类型`. |
| LBI-OPT-024 | V3 dataset creation wizard | SQL dataset creation still presented one dense engineering form instead of a guided source-to-schema workflow. | Convert the dataset creation modal into a 5-step wizard for source selection, SQL test, field inference, field confirmation, and save configuration while preserving the existing dataset mutation payload. | E2E verifies the 5-step wizard, SQL test, preview rows, inferred field confirmation table, and saved schema payload. |
| LBI-OPT-025 | V4 query builder usability | Chart configuration still grouped dataset, fields, aggregation, sorting, limits, preview, and styles under broad tabs, making validation reasons harder to scan. | Rebuild the chart config form as a sequential Query Builder: dataset summary, fields, aggregation, filtering/sorting/TopN/Limit, style, and linkage settings; keep inline preview validation reasons visible. | E2E verifies the grouped Query Builder labels and concrete inline reasons for missing dataset, dimensions, and measures; existing metric-card/detail-table preview coverage remains green. |
| LBI-OPT-026 | V5 share governance productization | Share governance only created a link and displayed the one-time token, while update/delete/expires/embed-copy capabilities existed but were not productized. | Add authorized share token persistence for governance list DTOs, copy URL/embed-code actions, expiry status, edit enable/embed/expires modal, and delete action while keeping public DTO token-free. | E2E covers create, copy URL, copy embed code, edit/disable, expiry display, and delete; backend test verifies protected DTO has token and public DTO does not leak token/email/creator. |
| LBI-OPT-027 | V6 responsive consumption layout | Published dashboards reused the editor's fixed absolute canvas width, causing mobile horizontal scrolling and hiding freshness context. | Add a viewer-only responsive layout with desktop scale-to-fit stage, mobile single-column widget list, refresh-time metadata, and a narrow-screen override for the global desktop min-width. | E2E verifies a 12-widget dashboard emits `CHART_RENDER P95 <= 300ms`, mobile renders 12 single-column widgets, clear-filter action remains visible, and document horizontal scroll is absent. |
| LBI-OPT-028 | V7 backend filter candidates | Viewer filter candidates were derived from frontend runtime rows, so limited result sets could hide valid values and label fallback could match the wrong field. | Add `GET /api/datasets/:id/distinct-values?field=&limit=`, enforce project read scope, load viewer filter options from the backend, show affected widget count, and remove loose label matching. | Backend test covers distinct-values limit/truncation and cross-project rejection; E2E verifies backend-only value `华北` appears and can be selected while showing `影响 1 个组件`. |
| LBI-OPT-029 | V8 editor efficiency tools | Core editor operations lacked undo/redo and common widget-level productivity actions, making layout iteration slow and risky. | Add a bounded designer history stack for discrete actions and expose undo, redo, duplicate, left-align, and undoable delete controls in the editor header without recording RAF pointermove updates. | E2E covers copy, undo, redo, left-align, delete, and undo-delete; existing `EDITOR_INTERACTION` RAF batching remains unchanged. |
| LBI-OPT-030 | V9 security quick fixes and CI | CSV export could emit formula-leading cells, and login/public share/export endpoints had no basic abuse guard; CI release gate was absent. | Escape CSV cells starting with `=`, `+`, `-`, or `@`; add in-memory rate-limit middleware to login, public share/embed, and export routes; add GitHub Actions release gate. | Backend tests cover CSV formula escaping and existing governance flows; CI workflow runs backend tests, frontend install/typecheck/build/E2E. |
| LBI-OPT-031 | V10 controlled pilot closure | The repo lacked minimum Docker/Compose deployment artifacts, a release checklist, and a pilot reassessment artifact. | Add backend/frontend Dockerfiles, nginx config, compose file, root `.env.example`, release checklist, and controlled-pilot reassessment. | `scripts/verify-release.sh --skip-e2e` is the release closeout gate; reassessment records controlled pilot readiness at 7.6/10 and external enterprise production readiness at 6.8/10. |

## Daily Version Register

The 10-workday plan uses `2026-06-30` as `lastday`. A workday version is complete only when its trace item, implementation scope, targeted acceptance test, required release gate, and measured result are recorded here. This run accelerated V1-V10 into one local working set on 2026-06-16; to avoid misleading Git history, the authoritative per-day boundary is this trace ledger, and the Git release marker should be cut at the validated lastday closeout unless the history is rebuilt into separate commits from scratch.

| Version | Planned Date | Trace ID | Version Label | Required Gate | Measured Result |
|---|---:|---|---|---|---|
| V1 | 2026-06-17 | LBI-OPT-022 | `lightbi-v01-asset-info` | Frontend typecheck, build, targeted E2E, full E2E | Full E2E 7 passed; build warnings 0; main entrypoint 236 KiB; persisted payload contains 0 `previewRows`. |
| V2 | 2026-06-18 | LBI-OPT-023 | `lightbi-v02-dashboard-ia` | Frontend typecheck, build, targeted E2E, full E2E | Full E2E 8 passed; build warnings 0; main entrypoint 236 KiB; visible main path uses `仪表盘`. |
| V3 | 2026-06-19 | LBI-OPT-024 | `lightbi-v03-dataset-wizard` | Frontend typecheck, build, targeted E2E, full E2E | Full E2E 8 passed; build warnings 0; main entrypoint 236 KiB; SQL dataset success path is 5 steps. |
| V4 | 2026-06-22 | LBI-OPT-025 | `lightbi-v04-query-builder` | Frontend typecheck, build, targeted E2E, `git diff --check` | Full E2E 9 passed; build warnings 0; main entrypoint 238 KiB; inline invalid-config reasons are visible. |
| V5 | 2026-06-23 | LBI-OPT-026 | `lightbi-v05-share-governance` | Backend Go tests, frontend typecheck, build, targeted E2E, `git diff --check` | Full E2E 10 passed; build warnings 0; main entrypoint 238 KiB; public DTO leaks 0 token/email/creator fields. |
| V6 | 2026-06-24 | LBI-OPT-027 | `lightbi-v06-responsive-viewer` | Frontend typecheck, build, targeted E2E, performance smoke, `git diff --check` | Targeted `CHART_RENDER P95` 7.30 ms; full-suite sample 7.60 ms; main entrypoint 239 KiB; mobile horizontal scroll 0. |
| V7 | 2026-06-25 | LBI-OPT-028 | `lightbi-v07-filter-candidates` | Backend Go tests, frontend typecheck, build, targeted E2E, `git diff --check` | Backend distinct-values tests passed; build warnings 0; main entrypoint 239 KiB; filter scope shows `影响 1 个组件`. |
| V8 | 2026-06-26 | LBI-OPT-029 | `lightbi-v08-editor-tools` | Frontend typecheck, build, targeted E2E, `git diff --check` | Editor tools E2E passed for copy, undo, redo, align, delete, undo-delete; build warnings 0; main entrypoint 239 KiB. |
| V9 | 2026-06-29 | LBI-OPT-030 | `lightbi-v09-security-ci` | Backend Go tests and `git diff --check` | Backend tests passed for CSV formula escaping and governance flows; CI release gate added; CSV formula-leading cells escaped. |
| V10 Lastday | 2026-06-30 | LBI-OPT-031 | `lightbi-lastday-2026-06-30` | `scripts/verify-release.sh --skip-e2e`, full E2E | Release gate passed; full E2E 13 passed; latest `CHART_RENDER P95` 6.10 ms; build warnings 0; main entrypoint 239 KiB; controlled-pilot readiness 7.6/10. |

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
- 2026-06-16 LBI-OPT-022:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "editor can manage asset metadata"` first failed for the expected missing asset-info entry, then passed after implementation outside the sandbox after the sandboxed run failed with `listen EPERM 127.0.0.1:3001`. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint remains 236 KiB. `cd frontend && npm run e2e` passed outside the sandbox: 7 Playwright tests passed. The new E2E asserts edited asset metadata, list filtering by group/tag, and persisted payload text does not contain `previewRows`.
- 2026-06-16 LBI-OPT-023:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "dashboard information architecture"` first failed for the expected missing `仪表盘` navigation, then passed after implementation outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint remains 236 KiB. `cd frontend && npm run e2e` passed outside the sandbox: 8 Playwright tests passed.
- 2026-06-16 LBI-OPT-024:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "dataset creation can test SQL"` first failed for the expected missing wizard steps, then passed after implementation outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint remains 236 KiB. `cd frontend && npm run e2e` passed outside the sandbox: 8 Playwright tests passed.
- 2026-06-16 LBI-OPT-025:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "query builder exposes grouped"` first failed for the expected missing `.query-builder-flow`, then passed after implementation outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 238 KiB. `git diff --check` passed. `cd frontend && npm run e2e` passed outside the sandbox: 9 Playwright tests passed.
- 2026-06-16 LBI-OPT-026:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed. `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "share governance can"` first failed for the expected missing `.share-link-table`, then passed after implementation outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 238 KiB. `git diff --check` passed. `cd frontend && npm run e2e` passed outside the sandbox: 10 Playwright tests passed.
- 2026-06-16 LBI-OPT-027:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "published dashboard adapts"` first failed for missing refresh-time/mobile layout, then passed after implementation outside the sandbox. Measured `V6 CHART_RENDER P95 7.30ms` in the targeted run and `7.60ms` in the full-suite run. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 239 KiB. `git diff --check` passed. A full `cd frontend && npm run e2e` run printed 11 passed, but teardown required manual interrupt and returned code 130; rerun required before release-gate signoff.
- 2026-06-16 LBI-OPT-028:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` first failed for the expected missing `/datasets/:id/distinct-values` route, then passed after implementation. `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "viewer filter candidates"` passed outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 239 KiB. `git diff --check` passed.
- 2026-06-16 LBI-OPT-029:
  `cd frontend && npm run typecheck` passed. `cd frontend && npm run e2e -- --grep "editor efficiency tools"` passed outside the sandbox. `cd frontend && npm run build` passed with no webpack warnings; main entrypoint is 239 KiB. `git diff --check` passed.
- 2026-06-16 LBI-OPT-030:
  `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...` passed after CSV formula escaping, route-level rate limiting, and CI workflow changes. `git diff --check` passed.
- 2026-06-16 LBI-OPT-031:
  Added Docker/Compose deployment artifacts, `.env.example`, `docs/optimization/release-checklist.md`, and `docs/optimization/reassessment-2026-06-30.md`. `scripts/verify-release.sh --skip-e2e` passed: status, diff check, backend tests, frontend typecheck, and frontend build. `cd frontend && npm run e2e` passed outside the sandbox: 13 Playwright tests passed, with `V6 CHART_RENDER P95 7.40ms`.
- 2026-06-16 Daily Version Register / lastday closeout:
  Added the V1-V10 daily version ledger with `2026-06-30` as `lastday`. `git diff --check` passed. `scripts/verify-release.sh --skip-e2e` passed after the ledger update: backend Go tests, frontend typecheck, frontend build, 0 build warnings, main entrypoint 239 KiB. `cd frontend && npm run e2e` failed inside the sandbox with `listen EPERM 127.0.0.1:3001`, then passed outside the sandbox: 13 Playwright tests passed, with `V6 CHART_RENDER P95 6.10ms`.

## Residual Risks

- Full deployment CI/CD, Prometheus/OpenTelemetry, and backup/restore remain outside this implementation slice.
