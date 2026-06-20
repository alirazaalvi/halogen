#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/src/db/migrations"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/neighborhood_intelligence}"

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is required but not found in PATH."
  exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Error: migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
SQL

migration_files=()
while IFS= read -r file_path; do
  migration_files+=("$file_path")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if [[ ${#migration_files[@]} -eq 0 ]]; then
  echo "No migration files found in $MIGRATIONS_DIR"
  exit 0
fi

existing_deso_areas=$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.deso_areas') IS NOT NULL;")
applied_count=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM schema_migrations;")

# If DB was already provisioned before introducing schema_migrations,
# baseline current SQL files to avoid replaying destructive/non-idempotent migrations.
if [[ "$existing_deso_areas" == "t" && "$applied_count" == "0" ]]; then
  echo "Detected existing schema with empty migration history. Baselining current migrations..."
  for file_path in "${migration_files[@]}"; do
    filename="$(basename "$file_path")"
    checksum="$(shasum -a 256 "$file_path" | awk '{print $1}')"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$filename', '$checksum') ON CONFLICT (filename) DO NOTHING;" >/dev/null
    echo "  baselined $filename"
  done
  echo "Baseline complete."
  exit 0
fi

for file_path in "${migration_files[@]}"; do
  filename="$(basename "$file_path")"
  checksum="$(shasum -a 256 "$file_path" | awk '{print $1}')"

  already_applied=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$filename' LIMIT 1;")
  if [[ "$already_applied" == "1" ]]; then
    echo "Skipping $filename (already applied)"
    continue
  fi

  echo "Applying $filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file_path"

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$filename', '$checksum');" >/dev/null

  echo "Applied $filename"
done

echo "Migrations complete."
