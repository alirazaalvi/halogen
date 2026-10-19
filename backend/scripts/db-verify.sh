#!/usr/bin/env bash
# Reports whether a database holds this application's data.
#
#   DATABASE_URL=postgresql://... bash scripts/db-verify.sh
#   docker exec -i ni-postgres psql -U postgres -d neighborhood_intelligence < scripts/db-verify.sql
#
# Read-only. Prints table row counts, data quality, migration level and a verdict.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$(dirname "$0")/db-verify.sql"
