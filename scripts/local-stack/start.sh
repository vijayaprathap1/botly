#!/usr/bin/env bash
# LOCAL TEST HARNESS: Postgres (already running) + PostgREST + auth gateway.
# Usage: POSTGREST_BIN=/path/to/postgrest bash scripts/local-stack/start.sh
# Writes .env.local-stack with the Supabase env vars for `next start`.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JWT_SECRET="${JWT_SECRET:-local-harness-jwt-secret-at-least-32-characters}"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/botly_test}"
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}"
cat > /tmp/botly-postgrest.conf <<CONF
db-uri = "postgres://authenticator:authenticator@localhost:5432/${DB:-botly_test}"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$JWT_SECRET"
server-port = 54330
server-host = "127.0.0.1"
CONF
"$POSTGREST_BIN" /tmp/botly-postgrest.conf > /tmp/botly-postgrest.log 2>&1 &
echo $! > /tmp/botly-postgrest.pid
node scripts/local-stack/gateway.mjs > /tmp/botly-gateway.log 2>&1 &
echo $! > /tmp/botly-gateway.pid
eval "$(node scripts/local-stack/keys.mjs)"
cat > .env.local-stack <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
ENV
sleep 1
echo "PostgREST + gateway running. Env written to .env.local-stack"
