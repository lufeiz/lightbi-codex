#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_E2E=0

for arg in "$@"; do
  case "$arg" in
    --skip-e2e)
      SKIP_E2E=1
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

echo "==> Repository status"
git -C "$ROOT" status -sb

echo "==> Whitespace diff check"
git -C "$ROOT" diff --check

echo "==> Backend tests"
(
  cd "$ROOT/backend"
  GOCACHE="${GOCACHE:-/private/tmp/lightbi-go-cache}" go test ./...
)

echo "==> Frontend typecheck"
(
  cd "$ROOT/frontend"
  npm run typecheck
)

echo "==> Frontend build"
(
  cd "$ROOT/frontend"
  npm run build
)

if [[ "$SKIP_E2E" -eq 1 ]]; then
  echo "==> Frontend E2E skipped by --skip-e2e"
else
  echo "==> Frontend E2E"
  (
    cd "$ROOT/frontend"
    npm run e2e
  )
fi
