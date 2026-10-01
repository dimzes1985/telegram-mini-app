-- ============================================
-- Security fixes: RLS hardening + anti-spam columns for bookings.
-- Safe to run several times. Run in Supabase SQL Editor.
--
-- 1) Owners could change privileged columns of their own profile (plan,
--    webhook secrets) and write to subscriptions / payments / ai_usage
--    directly with the public anon key. Now those tables are read-only for
--    owners; all writes go through the server (service_role).
-- 2) "Public insert bookings" let anyone insert bookings with the anon key,
--    bypassing initData verification and rate limits. Removed: the server
--    inserts bookings with service_role.
-- ============================================

-- ---------- users ----------
-- Columns referenced by the protection trigger (from migration-max.sql).
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_webhook_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_webhook_set BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS "Users see own profile" ON users;
DROP POLICY IF EXISTS "Users read own profile" ON users;
DROP POLICY IF EXISTS "Users update own profile" ON users;

CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Privileged columns can only be changed by the server (service_role) or
-- the SQL editor (postgres), never by the owner's own session.
CREATE OR REPLACE FUNCTION users_protect_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.bot_webhook_secret IS DISTINCT FROM OLD.bot_webhook_secret
       OR NEW.max_bot_webhook_secret IS DISTINCT FROM OLD.max_bot_webhook_secret
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Changing protected profile fields is not allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_protect_privileged ON users;
CREATE TRIGGER trg_users_protect_privileged
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_protect_privileged_columns();

-- ---------- subscriptions / payments / ai_usage / chat_messages: read-only ----------
DROP POLICY IF EXISTS "Users manage own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users read own subscription" ON subscriptions;
CREATE POLICY "Users read own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own payments" ON payments;
DROP POLICY IF EXISTS "Users read own payments" ON payments;
CREATE POLICY "Users read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own ai_usage" ON ai_usage;
DROP POLICY IF EXISTS "Users read own ai_usage" ON ai_usage;
CREATE POLICY "Users read own ai_usage" ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Users read own chat_messages" ON chat_messages;
CREATE POLICY "Users read own chat_messages" ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

-- ---------- bookings: no anonymous inserts ----------
DROP POLICY IF EXISTS "Public insert bookings" ON bookings;

-- ---------- functions ----------
-- Only the server may bump AI usage counters.
REVOKE EXECUTE ON FUNCTION increment_ai_usage(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_usage(UUID, TEXT) TO service_role;

-- SECURITY DEFINER functions must pin search_path.
ALTER FUNCTION handle_new_user() SET search_path = public;

-- ---------- bookings: source + customer identity for anti-spam ----------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS customer_messenger_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone_digits TEXT
    GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g'), '')) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_source_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_source_check
      CHECK (source IS NULL OR source IN ('telegram', 'max', 'mobile', 'ai', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_phone_digits
  ON bookings (user_id, customer_phone_digits)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_bookings_messenger_id
  ON bookings (user_id, source, customer_messenger_id)
  WHERE status <> 'cancelled';
