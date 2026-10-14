#!/bin/bash
# /opt/slot/restore-db.sh: loads the dump from the old Supabase
# (/opt/slot/migrate/*.sql.gz, uploaded by the "Migrate database" workflow).
set -euo pipefail
umask 077
# Legacy migration helper, not a general production recovery procedure.
# Explicitly require an isolated target and never default to the live DB.
: "${RESTORE_CONTAINER:?Set an isolated target container}"
: "${RESTORE_DATABASE:?Set the target database name}"
if [[ "$RESTORE_CONTAINER" == "supabase-db" ]]; then
  echo "Refusing to run the legacy migration helper against the live container." >&2
  exit 2
fi
if [[ "${CONFIRM_ISOLATED_RESTORE:-}" != "yes" ]]; then
  echo "Set CONFIRM_ISOLATED_RESTORE=yes after checking the isolated target." >&2
  exit 2
fi
cd "${RESTORE_SOURCE_DIR:-/opt/slot/migrate}"
PSQL=(docker exec -i "$RESTORE_CONTAINER" psql -U "${RESTORE_USER:-supabase_admin}" -d "$RESTORE_DATABASE" -v ON_ERROR_STOP=1 -q)

# PG17-only settings are not understood by the PG15 server.
clean() { gunzip -c "$1" | sed -e '/^SET transaction_timeout/d' -e '/^\\restrict/d' -e '/^\\unrestrict/d'; }

echo "== extensions"
echo 'CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' | "${PSQL[@]}"

echo "== auth users"
clean auth.sql.gz | "${PSQL[@]}"

echo "== public schema and data"
# The public schema already exists in a fresh Supabase.
clean public.sql.gz | sed -e '/^CREATE SCHEMA "public";/d' -e '/^COMMENT ON SCHEMA "public"/d' | "${PSQL[@]}"

echo "== trigger on auth.users"
cat <<'SQL' | "${PSQL[@]}"
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
NOTIFY pgrst, 'reload schema';
SQL

echo "== row counts"
cat <<'SQL' | "${PSQL[@]}" -At
select 'auth.users', count(*) from auth.users
union all select 'users', count(*) from public.users
union all select 'services', count(*) from public.services
union all select 'bookings', count(*) from public.bookings;
SQL
