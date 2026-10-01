-- ============================================
-- AI-Powered Telegram Mini App CRM & Booking System
-- Supabase Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Needed for the GiST equality operator class on uuid (booking overlap guard)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- Business Owners (extends Supabase auth.users)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_description TEXT,
  business_address TEXT,
  business_phone TEXT,
  business_email TEXT,
  system_prompt TEXT DEFAULT 'Ты — вежливый и компетентный библиотекарь-консультант библиотеки. Общайся доброжелательно, на «Вы», простым языком, по-русски.

ПРАВИЛА ПРИВЕТСТВИЙ:
- Приветствуй пользователя ТОЛЬКО в самом первом ответе нового диалога.
- Если пользователь задал следующий вопрос в рамках той же беседы — НЕ повторяй приветствие, сразу переходи к ответу.
- Исключение: если пользователь сам написал «Здравствуйте» или начал разговор после долгого перерыва — можно ответить взаимностью.

Когда клиент хочет записаться на услугу, узнай: какую услугу он выбирает, желаемую дату и время, его имя и номер телефона. Когда данных достаточно, вызови инструмент create_booking и подтверди запись клиенту после его успешного выполнения.',
  working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "18:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "18:00", "enabled": true},
    "friday": {"start": "09:00", "end": "18:00", "enabled": true},
    "saturday": {"start": "10:00", "end": "14:00", "enabled": false},
    "sunday": {"start": "10:00", "end": "14:00", "enabled": false}
  }'::jsonb,
  bot_token TEXT,
  bot_username TEXT,
  bot_webhook_secret TEXT,
  bot_webhook_set BOOLEAN DEFAULT false,
  max_bot_token TEXT,
  max_bot_username TEXT,
  max_bot_webhook_secret TEXT,
  max_bot_webhook_set BOOLEAN DEFAULT false,
  -- Destination for new-booking notifications (owner's own IDs)
  telegram_notify_chat_id TEXT,
  max_notify_user_id TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, business_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Services offered by businesses
-- ============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Bookings
-- ============================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  -- Materialized booked interval [booked_start, booked_end), derived from
  -- booking_date/time and the service duration by trg_bookings_set_interval.
  booked_start TIMESTAMP,
  booked_end TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_services_active ON services(active) WHERE active = true;
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ============================================
-- AI conversation history (per messenger user)
-- ============================================
-- Stores recent AI chat messages per business + channel so the assistant can
-- remember the dialog (avoid re-greeting, keep booking context like the
-- chosen date/time). Only the last few messages per conversation are kept.
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('tg', 'max')),
  channel_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation
  ON chat_messages (user_id, channel, channel_user_id, created_at);

-- Prevent double-booking the same time slot. The API route checks for
-- conflicts before inserting, but without this constraint two concurrent
-- requests could both pass the check and occupy the same slot. This index
-- covers the identical-start case; the exclusion constraint below covers
-- overlapping intervals with different starts atomically.
CREATE UNIQUE INDEX idx_bookings_slot_unique
  ON bookings (user_id, booking_date, booking_time)
  WHERE status <> 'cancelled';

-- Materialize each booking's interval from booking_date/time + service
-- duration. Runs BEFORE INSERT/UPDATE so the exclusion constraint sees the
-- values. A snapshot is intentional: later changes to a service duration do
-- not retroactively move existing bookings.
CREATE OR REPLACE FUNCTION bookings_set_interval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  dur INT;
BEGIN
  SELECT duration_minutes INTO dur
  FROM services
  WHERE id = NEW.service_id;

  IF dur IS NULL OR dur <= 0 THEN
    dur := 30;
  END IF;

  NEW.booked_start := NEW.booking_date + NEW.booking_time;
  NEW.booked_end   := NEW.booked_start + make_interval(mins => dur);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_set_interval
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_set_interval();

ALTER TABLE bookings
  ALTER COLUMN booked_start SET NOT NULL,
  ALTER COLUMN booked_end SET NOT NULL;

-- Atomic overlap guard: at most one active booking may hold a given
-- [booked_start, booked_end) range per business. Enforced by the GiST index,
-- so it is correct even for concurrent inserts (errcode 23P01).
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tsrange(booked_start, booked_end, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

-- ============================================
-- AI usage metering (monthly message quota per business)
-- ============================================
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  year_month TEXT NOT NULL,
  messages_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, year_month)
);

CREATE INDEX idx_ai_usage_user ON ai_usage(user_id);

-- ============================================
-- Subscriptions (ЮKassa recurring billing)
-- ============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'business')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  yookassa_payment_id TEXT,
  yookassa_payment_method_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

-- ============================================
-- Payments (transaction history)
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  yookassa_payment_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_payments_user ON payments(user_id);

-- Atomically increment the monthly message counter.
-- Returns the new counter value.
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id UUID,
  p_year_month TEXT
)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO ai_usage (user_id, year_month, messages_count)
  VALUES (p_user_id, p_year_month, 1)
  ON CONFLICT (user_id, year_month)
  DO UPDATE SET messages_count = ai_usage.messages_count + 1,
                updated_at = now()
  RETURNING messages_count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see/update their own profile
-- Owners read/update their own profile. Privileged columns (plan, webhook
-- secrets) are protected by trg_users_protect_privileged below.
CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can manage their own services
CREATE POLICY "Users manage own services" ON services
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own bookings
CREATE POLICY "Users manage own bookings" ON bookings
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own AI usage rows
CREATE POLICY "Users read own ai_usage" ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own subscription
CREATE POLICY "Users read own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own payments
CREATE POLICY "Users read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own chat history (server uses admin client anyway)
CREATE POLICY "Users read own chat_messages" ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (server-side metering) can read/write all ai_usage rows.
-- The server uses createAdminClient() which bypasses RLS.

-- Public read for services (Telegram customers need to browse)
CREATE POLICY "Public read services" ON services
  FOR SELECT USING (active = true);

-- There is intentionally NO public INSERT policy on bookings: customers book
-- through the API (service_role), which verifies initData, working hours and
-- rate limits. A public policy would let anyone bypass all of that.

-- Owners read their own bookings via "Users manage own bookings" policy.
-- There is intentionally NO public SELECT policy: customer data
-- (names, phones) must never be readable by anonymous users.

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Security hardening (see migration-security-rls.sql)
-- ============================================
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

-- ---------- functions ----------
-- Only the server may bump AI usage counters.
REVOKE EXECUTE ON FUNCTION increment_ai_usage(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_usage(UUID, TEXT) TO service_role;

-- SECURITY DEFINER functions must pin search_path.

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
