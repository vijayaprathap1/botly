#!/usr/bin/env bash
# Recreate a local Postgres database with the Supabase shim, all migrations and the seed.
# Files in supabase/migrations run in lexical order, so 0011_launch_guards.sql
# (when present) runs before 0012_analytics.sql. 0012 does not require 0011.
# Usage: DB=botly_test bash scripts/local-db.sh   (needs a local Postgres + psql)
set -euo pipefail
DB="${DB:-botly_test}"
PSQL="${PSQL:-sudo -u postgres psql -v ON_ERROR_STOP=1 -q}"
cd "$(dirname "$0")/.."
$PSQL -c "drop database if exists $DB with (force)" -c "create database $DB"
$PSQL -d "$DB" -f scripts/local-db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  $PSQL -d "$DB" -f "$f"
done
if [ "${SEED:-1}" = "1" ]; then
  echo "→ supabase/seed.sql"
  $PSQL -d "$DB" -f supabase/seed.sql
fi
echo "Database $DB ready."
