#!/usr/bin/env bash
# Dumps the database for migration to another Postgres (e.g. Neon/Supabase behind Cloudflare Hyperdrive).
#
#   DATABASE_URL=postgresql://... bash scripts/db-dump.sh [output-dir]
#
# Writes: halogen.dump (pg_dump custom format), schema.sql, row-counts.txt, SHA256SUMS.
# Refuses to dump a database that has not had the data-reliability migrations (019+) applied,
# so removed synthetic rows are not carried over. Override with ALLOW_UNMIGRATED=1.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the source database}"
for tool in pg_dump psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Error: $tool not found in PATH."; exit 1; }
done

OUT_DIR="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ "${ALLOW_UNMIGRATED:-0}" != "1" ]]; then
  applied=$(psql "$DATABASE_URL" -tAc \
    "SELECT COUNT(*) FROM schema_migrations WHERE filename >= '019'" 2>/dev/null || echo "missing")
  if [[ "$applied" == "missing" || "$applied" -lt 3 ]]; then
    echo "Error: migrations 019-021 are not applied on the source database."
    echo "Run: DATABASE_URL=... bash scripts/db-migrate.sh   (then dump again)"
    echo "Or set ALLOW_UNMIGRATED=1 to dump anyway."
    exit 1
  fi
fi

mkdir -p "$OUT_DIR"
echo "Dumping to $OUT_DIR"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$OUT_DIR/halogen.dump"
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl --file="$OUT_DIR/schema.sql"

# Row counts per user table, used by db-restore.sh to verify the copy.
psql "$DATABASE_URL" -tA -F $'\t' -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name NOT IN ('spatial_ref_sys')
  ORDER BY table_name" | while IFS=$'\t' read -r table; do
  count=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM \"$table\"")
  printf '%s\t%s\n' "$table" "$count"
done > "$OUT_DIR/row-counts.txt"

(cd "$OUT_DIR" && { command -v sha256sum >/dev/null && sha256sum halogen.dump schema.sql row-counts.txt || shasum -a 256 halogen.dump schema.sql row-counts.txt; } > SHA256SUMS)

echo "Done."
cat "$OUT_DIR/row-counts.txt"
