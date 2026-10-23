#!/usr/bin/env bash
# Builds the whole demo database in the right order. Safe to rerun.
# Usage: ./database/run_all.sh [database_name]     (default: reflect)
set -e
DB="${1:-reflect}"
cd "$(dirname "$0")/.."
for f in schema seed seed/load_patients seed/seed_therapy seed/seed_engagement seed/seed_clinical seed/seed_rtm; do
  echo "==> $f.sql"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "database/$f.sql"
done
echo "Done."
