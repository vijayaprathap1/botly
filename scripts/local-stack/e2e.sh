#!/usr/bin/env bash
# LOCAL TEST HARNESS: fresh DB → PostgREST + auth gateway + fake Resend → next start → Playwright.
# Needs: local Postgres (psql), a PostgREST binary (POSTGREST_BIN), `npm run build` done with .env.local.
set -euo pipefail
cd "$(dirname "$0")/../.."
stop() { for f in /tmp/botly-postgrest.pid /tmp/botly-gateway.pid /tmp/botly-resend.pid /tmp/botly-next.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done; }
stop
for p in 3000 54321 54330 54340; do fuser -k "$p/tcp" 2>/dev/null || true; done
bash scripts/local-db.sh > /dev/null
rm -f /tmp/botly-magic-links.log /tmp/botly-fake-resend.jsonl
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}" bash scripts/local-stack/start.sh > /dev/null
node tests/e2e/fake-resend.mjs > /tmp/botly-fake-resend.log 2>&1 & echo $! > /tmp/botly-resend.pid
npx next start -p 3000 > /tmp/botly-next.log 2>&1 & echo $! > /tmp/botly-next.pid
for i in $(seq 1 30); do curl -sf http://localhost:3000/privacy > /dev/null && break; sleep 0.5; done
status=0
MAGIC_LINK_LOG=/tmp/botly-magic-links.log npx playwright test "$@" || status=$?
[ "${KEEP_RUNNING:-0}" = "1" ] || stop
exit $status
