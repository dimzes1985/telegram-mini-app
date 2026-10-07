#!/bin/bash
# /opt/slot/restore-db.sh: loads the dump from the old Supabase
# (/opt/slot/migrate/*.sql.gz, uploaded by the "Migrate database" workflow).
set -euo pipefail
cd /opt/slot/migrate
PSQL="docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 -q"

# PG17-only settings are not understood by the PG15 server.
clean() { gunzip -c "$1" | sed -e '/^SET transaction_timeout/d' -e '/^\\restrict/d' -e '/^\\unrestrict/d'; }

echo "== extensions"
echo 'CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' | $PSQL

echo "== auth users"
clean auth.sql.gz | $PSQL 2>&1 | grep -v "already exists" | tail -20 || true

echo "== public schema and data"
# The public schema already exists in a fresh Supabase.
clean public.sql.gz | sed -e '/^CREATE SCHEMA "public";/d' -e '/^COMMENT ON SCHEMA "public"/d' | $PSQL 2>&1 | tail -40 || true

echo "== trigger on auth.users"
cat <<'SQL' | $PSQL
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
NOTIFY pgrst, 'reload schema';
SQL

echo "== row counts"
cat <<'SQL' | docker exec -i supabase-db psql -U supabase_admin -d postgres -At
select 'auth.users', count(*) from auth.users
union all select 'users', count(*) from public.users
union all select 'services', count(*) from public.services
union all select 'bookings', count(*) from public.bookings;
SQL
