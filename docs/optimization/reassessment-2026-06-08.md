# LightBI Optimization Reassessment

Date: 2026-06-08

This reassessment preserves the original production-readiness report as the baseline and measures the current working tree after the staged optimization items in `docs/optimization/traceability.md`.

## Summary

Current readiness judgment: **7.1 / 10 for controlled internal trial / near-production use**.

External production judgment: **not ready for unrestricted enterprise production** until CI/CD, explicit database migrations, observability, backup/restore, and production data-source operating controls are implemented.

Baseline score from `PRODUCTION_READINESS_ASSESSMENT_2026-06-08.md`: **5.2 / 10**.

Measured improvement: **+1.9 points** in this implementation slice.

## Scorecard

| Area | Baseline | Current | Evidence |
|---|---:|---:|---|
| Backend/API/data security | 5.3 | 7.2 | `LBI-OPT-002` to `LBI-OPT-005`, `LBI-OPT-009` to `LBI-OPT-011`, `LBI-OPT-014`, `LBI-OPT-019` |
| Frontend/BI product experience | 5.3 | 7.4 | `LBI-OPT-006` to `LBI-OPT-008`, `LBI-OPT-013`, `LBI-OPT-015` to `LBI-OPT-020` |
| Engineering quality gates | 4.2 | 6.7 | `LBI-OPT-012`, repeated backend tests, frontend typecheck/build, 6-test Playwright suite |
| Overall controlled-trial readiness | 5.2 | 7.1 | Local release gate and traceability are now repeatable; external production hardening remains open |

## P0 Closure Map

| Original P0 | Current status | Trace evidence |
|---|---|---|
| P0-1 Query permission not in service layer | Closed for project-scope enforcement and query context | `LBI-OPT-002`, `LBI-OPT-014` |
| P0-2 Public share returned full Chart object | Closed for public DTO minimization | `LBI-OPT-004` |
| P0-3 Publish was not atomic | Closed for current-payload publish snapshot path | `LBI-OPT-003` |
| P0-4 Runtime query failures were hidden | Closed for widget runtime status and viewer display | `LBI-OPT-005`, `LBI-OPT-008`, `LBI-OPT-018` |
| P0-5 Data-source and SQL boundary too weak | Partially closed; production operating policy still needed | `LBI-OPT-009`, `LBI-OPT-010`, `LBI-OPT-019` |
| P0-6 Production delivery chain missing | Partially closed by local release script only | `LBI-OPT-012` |
| P0-7 E2E gate not green | Closed for local Playwright suite; CI gate still needed | `LBI-OPT-015`, `LBI-OPT-016`, `LBI-OPT-018`, `LBI-OPT-019`, `LBI-OPT-020` |

## Measured Results

| Metric | Baseline | Current |
|---|---:|---:|
| Frontend main entrypoint | 798 KiB in original assessment; 560 KiB before final split | 236 KiB |
| Webpack warnings | 2 warnings in original assessment; later vendor warnings remained | 0 warnings |
| Playwright E2E | 1/2 passed after sandbox escalation in original assessment | 6/6 passed outside sandbox |
| Backend tests | Passing | Passing |
| Frontend typecheck | Passing | Passing |
| Release gate | Missing | `scripts/verify-release.sh --skip-e2e` passing |
| Traceability | Missing | `LBI-OPT-001` to `LBI-OPT-020` |

## Remaining External Production Backlog

These are intentionally not claimed as complete in this slice:

- CI/CD workflow that runs backend tests, frontend typecheck/build, Playwright E2E, and release artifact checks on every PR.
- Explicit database migration files with checksums, rollback policy, and backup/restore rehearsal.
- Production observability: structured logs, metrics, traces, alerting, frontend performance upload, query failure alerting.
- Production data-source operations: mandatory read-only database users, statement timeout at DB/session level, outbound network policy outside app code, credential rotation.
- SQL hardening beyond regex and allowlist: AST parser or database-enforced read-only transaction strategy.
- Share/export governance depth: share link edit/disable/delete UX, access statistics, async export for large datasets, export failure retry/audit.
- Disaster recovery and capacity planning: restore drill, query concurrency sizing, rate limiting, and tenant-level quotas.

## Final Judgment

The current working tree has moved from **BI MVP skeleton** to **controlled internal-trial / near-production candidate**. The core product loop is now substantially stronger: dataset creation can test SQL and infer fields, charts can be configured with productized query options, publishing is transactional, public DTOs are minimized, runtime failures are visible, viewer filters are usable, and local release gates are repeatable.

It is still not a full external-production BI platform until the deployment, migration, observability, recovery, and production data-source operating controls above are completed.
