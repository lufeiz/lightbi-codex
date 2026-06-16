# LightBI Controlled Pilot Reassessment

Date: 2026-06-30 target version closure draft

## Score

- Controlled pilot readiness: 7.6/10
- External enterprise production readiness: 6.8/10

The 10-version product/frontend track closes the main MVP usability gaps and adds a minimum security/release gate. It is suitable for a controlled pilot with known users, limited data-source scope, and manual operational supervision. It is not yet a broad external enterprise production release because observability, backup/restore drills, async export, and mature CI/CD environment promotion are still incomplete.

## Evidence

- E2E coverage target moves from 6 to at least 12 scenarios across login, dashboard IA, editor preview, asset metadata, query builder, dataset wizard, share governance, responsive viewer, backend filter candidates, editor efficiency, permission UX, and invalid config rejection.
- Build warning target remains 0.
- Main entrypoint budget remains below 236 KiB * 110% = 259.6 KiB.
- `CHART_RENDER P95` target for the 12-widget smoke is <= 300ms.
- Backend test coverage now includes public DTO safety, share token governance DTO, dataset distinct-values project scope, CSV formula escaping, publish snapshot, and dataset reference scope.

## Closed Pilot Risks

- Product metadata can be edited and filtered.
- User-facing IA uses Dashboard semantics while keeping old `/charts/*` compatibility.
- SQL dataset creation is a guided source-to-schema workflow.
- Query Builder exposes dataset, fields, aggregation, sorting, TopN, limit, and inline validation reasons.
- Share governance supports create, copy URL, copy embed code, edit, disable, expiry display, and delete.
- Published dashboard has desktop scale-to-fit and mobile single-column layout.
- Viewer filter candidates come from a backend distinct-values API.
- Editor has undo, redo, copy, align, and undoable delete for core widget operations.
- CSV export escapes formula-leading cells.
- CI release gate and Docker/Compose pilot artifacts exist.

## Remaining Production Backlog

- Prometheus/OpenTelemetry metrics and alerting.
- Backup/restore automation and restore drills.
- SQL AST parsing and stricter query governance.
- Async export for large dashboards.
- Environment promotion pipeline with signed images and deployment approvals.
- Load testing against realistic dataset sizes and concurrent viewers.
