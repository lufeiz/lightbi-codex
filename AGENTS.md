# LightBI Agent Instructions

This file is the project-level trigger chain for Codex agents working in this repository. It routes common LightBI tasks to the concrete Skills and Rules under `docs/skills-and-rules/`.

## Default Project Workflow

1. Inspect repository state with `git status -sb` before editing, staging, committing, or pushing.
2. Preserve unrelated user changes. Do not revert or stage files outside the current task.
3. When a request matches a trigger below, read the listed file(s) before proposing or implementing changes.
4. In the final response, state which project Skill/Rule files were used and what validation was run.
5. If the request is in Chinese, answer in Chinese unless the user asks otherwise.

## Trigger Chain

| User request or task signal | Load first | Also load when changing code |
|---|---|---|
| Dashboard opens slowly, chart rendering is slow, filtering/linkage is slow, memory grows, bundle size concern | `docs/skills-and-rules/skills/dashboard-performance-diagnosis.md` | `docs/skills-and-rules/rules/dashboard-performance-rules.md`, `docs/skills-and-rules/rules/bi-code-review-checklist.md` |
| Add a new chart type, renderer, chart config option, chart palette entry, or chart registry item | `docs/skills-and-rules/skills/new-chart-type-onboarding.md` | `docs/skills-and-rules/rules/bi-chart-rules.md`, `docs/skills-and-rules/rules/schema-api-rules.md`, `docs/skills-and-rules/rules/bi-code-review-checklist.md` |
| Online or staging chart issue: blank chart, wrong data, broken linkage, published/share/embed issue, version rollback issue | `docs/skills-and-rules/skills/chart-online-issue-diagnosis.md` | `docs/skills-and-rules/rules/bi-chart-rules.md`, `docs/skills-and-rules/rules/schema-api-rules.md`, `docs/skills-and-rules/rules/bi-code-review-checklist.md` |
| Review Chart, Dashboard, Dataset Query, publish/share/embed, renderer, or filter/linkage changes | `docs/skills-and-rules/rules/bi-code-review-checklist.md` | `docs/skills-and-rules/rules/bi-chart-rules.md`, `docs/skills-and-rules/rules/schema-api-rules.md`, `docs/skills-and-rules/rules/dashboard-performance-rules.md` as relevant |
| Change `ChartDocument`, `ChartConfig`, dataset query API, runtime rows, filters, publish/share/export API, or backend config normalize | `docs/skills-and-rules/rules/schema-api-rules.md` | `docs/skills-and-rules/rules/bi-chart-rules.md`, `docs/skills-and-rules/rules/bi-code-review-checklist.md` |
| Unsure which project Skill/Rule applies | `docs/skills-and-rules/README.md` | Load the most specific file after classifying the task |

## Execution Protocol

After loading the triggered file(s):

1. Classify the task into one of: performance diagnosis, new chart onboarding, online issue diagnosis, schema/API change, code review, or documentation-only update.
2. Map the task to the current code anchors listed in the loaded file.
3. Keep edits scoped to those anchors.
4. Validate by blast radius:
   - Frontend type/schema changes: `cd frontend && npm run typecheck`
   - Frontend rendering/bundle changes: `cd frontend && npm run build`
   - Editor, published/share/embed, filter/linkage flows: `cd frontend && npm run e2e`
   - Backend schema/query/auth/publish/share/export changes: `cd backend && GOCACHE=/private/tmp/lightbi-go-cache go test ./...`
   - Documentation-only changes: `git diff --check`
5. If a validation command is not run, say why.

## Important Boundaries

- `docs/skills-and-rules/` files are project-level runbooks. They do not replace globally installed Codex Skills.
- `AGENTS.md` provides the repository trigger route: when the task matches a trigger, agents should load the relevant runbook before acting.
- For cross-project reusable automation, create or update a real Codex Skill under `/Users/lufeiz/.codex/skills/` instead of only editing this repository.
