# LightBI Release Checklist

Use this checklist before each daily version tag or pilot deployment.

## Required Gates

- [ ] `git status -sb`
- [ ] `git diff --check`
- [ ] `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...`
- [ ] `cd frontend && npm run typecheck`
- [ ] `cd frontend && npm run build`
- [ ] `cd frontend && npm run e2e`
- [ ] Update `docs/optimization/traceability.md` with changed files, commands, metrics, failures, and residual risks.

## Release Metrics

- E2E count:
- Build warnings:
- Main entrypoint KiB:
- `CHART_RENDER P95`:
- `EDITOR_INTERACTION P95`:
- Backend handler coverage:
- Known blockers:

## Docker Pilot

- [ ] Copy `.env.example` to `.env` and replace every `replace-with-*` value.
- [ ] Set `RUN_AUTO_MIGRATE=true` only for the initial controlled pilot migration, then return it to `false`.
- [ ] Keep `DATA_SOURCE_BLOCK_PRIVATE_NETWORKS=true` unless the pilot network policy has been explicitly approved.
- [ ] Start with `docker compose up --build`.
- [ ] Verify `http://localhost:3000`, `http://localhost:8080/api/health`, login, dashboard publish, share, export, and E2E smoke.

## Rollback Notes

- Preserve database backup before migration.
- If frontend is faulty, roll back the `frontend` image only.
- If backend schema/config is faulty, stop rollout and restore the database backup before restarting older backend image.
