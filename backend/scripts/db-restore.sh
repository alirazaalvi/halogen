#!/usr/bin/env bash
# Restores a dump made by db-dump.sh into an EMPTY target database and verifies row counts.
#
#   TARGET_DATABASE_URL=postgresql://... bash scripts/db-restore.sh backups/<timestamp>
#
# The target needs the PostGIS extension available (Neon and Supabase provide it).
set -euo pipefail

: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL to the destination database}"
DUMP_DIR="${1:?Usage: db-restore.sh <dump-directory>}"
for tool in pg_restore psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Error: $tool not found in PATH."; exit 1; }
done
[[ -f "$DUMP_DIR/halogen.dump" ]] || { echo "Error: $DUMP_DIR/halogen.dump not found."; exit 1; }

if [[ -f "$DUMP_DIR/SHA256SUMS" ]]; then
  (cd "$DUMP_DIR" && { command -v sha256sum >/dev/null && sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; })
fi

existing=$(psql "$TARGET_DATABASE_URL" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'spatial_ref_sys'")
if [[ "$existing" != "0" && "${FORCE:-0}" != "1" ]]; then
  echo "Error: target already has $existing tables. Use an empty database, or set FORCE=1 to restore over it."
  exit 1
fi

if [[ "${SKIP_POSTGIS_CHECK:-0}" != "1" ]]; then
  psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis" >/dev/null
fi

restore_args=(--no-owner --no-acl --exit-on-error --dbname="$TARGET_DATABASE_URL")
[[ "${FORCE:-0}" == "1" ]] && restore_args+=(--clean --if-exists)
pg_restore "${restore_args[@]}" "$DUMP_DIR/halogen.dump"

echo "Verifying row counts..."
fail=0
while IFS=$'\t' read -r table expected; do
  actual=$(psql "$TARGET_DATABASE_URL" -tAc "SELECT COUNT(*) FROM \"$table\"")
  if [[ "$actual" != "$expected" ]]; then
    echo "MISMATCH $table: expected $expected, got $actual"
    fail=1
  fi
done < "$DUMP_DIR/row-counts.txt"

[[ "$fail" == "0" ]] && echo "All row counts match." || { echo "Row counts differ."; exit 1; }
