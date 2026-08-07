-- ============================================
-- Migration: add AI usage metering, subscriptions,
-- payments, plan column, webhook secret, and fix RLS leak.
-- Safe to run on a database that already has the
-- original schema.sql applied (users/services/bookings).
-- Idempotent: can be re-run without errors.
-- ============================================

-- Add new columns to users (if not present)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_webhook_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_webhook_set BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business'));

-- ============================================
-- AI usage metering (monthly message quota per business)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  year_month TEXT NOT NULL,
  messages_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);

-- ============================================
-- Subscriptions (ЮKassa recurring billing)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
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

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ============================================
-- Payments (transaction history)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  yookassa_payment_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

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
-- RLS: remove the insecure public SELECT policy
-- on bookings (leaked customer names/phones)
-- ============================================
DROP POLICY IF EXISTS "Public read own bookings" ON bookings;

-- Enable RLS on the new tables
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policies for new tables
CREATE POLICY "Users manage own ai_usage" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own subscription" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own payments" ON payments
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- updated_at triggers for new tables
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_usage_updated_at ON ai_usage;
CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
