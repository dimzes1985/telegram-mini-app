-- ============================================
-- AI-Powered Telegram Mini App CRM & Booking System
-- Supabase Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- requests could both pass the check and occupy the same slot.
CREATE UNIQUE INDEX idx_bookings_slot_unique
  ON bookings (user_id, booking_date, booking_time)
  WHERE status <> 'cancelled';

-- Prevent overlapping bookings: a service takes duration_minutes, so a booking
-- blocks the whole [booking_time, booking_time + duration) window, not just its
-- starting minute. The trigger rejects an insert whose interval overlaps any
-- non-cancelled booking for the same business and date (errcode 23P01).
CREATE OR REPLACE FUNCTION prevent_overlapping_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_duration INT;
  new_start INT;
  new_end INT;
  existing_start INT;
  existing_end INT;
  rec RECORD;
BEGIN
  SELECT duration_minutes INTO new_duration
  FROM services
  WHERE id = NEW.service_id;

  IF new_duration IS NULL OR new_duration <= 0 THEN
    new_duration := 30;
  END IF;

  new_start := EXTRACT(HOUR FROM NEW.booking_time) * 60
             + EXTRACT(MINUTE FROM NEW.booking_time);
  new_end := new_start + new_duration;

  FOR rec IN
    SELECT b.booking_time, s.duration_minutes
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    WHERE b.user_id = NEW.user_id
      AND b.booking_date = NEW.booking_date
      AND b.status <> 'cancelled'
      AND b.id IS DISTINCT FROM NEW.id
  LOOP
    existing_start := EXTRACT(HOUR FROM rec.booking_time) * 60
                    + EXTRACT(MINUTE FROM rec.booking_time);
    existing_end := existing_start + COALESCE(rec.duration_minutes, 30);

    IF new_start < existing_end AND existing_start < new_end THEN
      RAISE EXCEPTION 'time slot already booked'
        USING ERRCODE = '23P01';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_overlapping_booking ON bookings;
CREATE TRIGGER trg_prevent_overlapping_booking
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_booking();

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
CREATE POLICY "Users see own profile" ON users
  FOR ALL USING (auth.uid() = id);

-- Users can manage their own services
CREATE POLICY "Users manage own services" ON services
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own bookings
CREATE POLICY "Users manage own bookings" ON bookings
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own AI usage rows
CREATE POLICY "Users manage own ai_usage" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own subscription
CREATE POLICY "Users manage own subscription" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own payments
CREATE POLICY "Users manage own payments" ON payments
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own chat history (server uses admin client anyway)
CREATE POLICY "Users manage own chat_messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- Service role (server-side metering) can read/write all ai_usage rows.
-- The server uses createAdminClient() which bypasses RLS.

-- Public read for services (Telegram customers need to browse)
CREATE POLICY "Public read services" ON services
  FOR SELECT USING (active = true);

-- Public insert for bookings (Telegram customers can book)
-- NOTE: direct inserts bypass route-level validation; the API route performs
-- conflict checks and Telegram initData verification before inserting.
CREATE POLICY "Public insert bookings" ON bookings
  FOR INSERT WITH CHECK (true);

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
