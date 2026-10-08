-- Step 9: promo codes for businesses.
--   kind 'trial' - free paid plan for trial_days (no card needed);
--   kind 'price' - special monthly price (e.g. founders' price 990 RUB).
-- Only the server (service_role) reads and writes these tables.

CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY CHECK (code = upper(code)),
  kind TEXT NOT NULL CHECK (kind IN ('trial', 'price')),
  plan TEXT NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro', 'business')),
  trial_days INT CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 365),
  price_rub INT CHECK (price_rub IS NULL OR price_rub > 0),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind <> 'trial' OR trial_days IS NOT NULL),
  CHECK (kind <> 'price' OR price_rub IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  plan TEXT NOT NULL,
  price_rub INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, user_id)
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions (user_id, created_at DESC);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promo_codes, promo_redemptions FROM anon, authenticated;
GRANT ALL ON promo_codes, promo_redemptions TO service_role;

-- Atomically uses one slot of a code for a user.
CREATE OR REPLACE FUNCTION redeem_promo_code(p_code TEXT, p_user UUID)
RETURNS promo_codes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c promo_codes;
BEGIN
  IF EXISTS (
    SELECT 1 FROM promo_redemptions WHERE code = upper(trim(p_code)) AND user_id = p_user
  ) THEN
    RAISE EXCEPTION 'already_used';
  END IF;
  UPDATE promo_codes SET used_count = used_count + 1
   WHERE code = upper(trim(p_code))
     AND active
     AND (max_uses IS NULL OR used_count < max_uses)
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING * INTO c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  INSERT INTO promo_redemptions (code, user_id, kind, plan, price_rub)
  VALUES (c.code, p_user, c.kind, c.plan, c.price_rub);
  RETURN c;
END $$;

REVOKE ALL ON FUNCTION redeem_promo_code(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_promo_code(TEXT, UUID) TO service_role;

-- Starter codes: a free month of Pro and the founders' price.
INSERT INTO promo_codes (code, kind, plan, trial_days, max_uses, note)
VALUES ('START30', 'trial', 'pro', 30, 100, 'Бесплатный месяц Pro')
ON CONFLICT (code) DO NOTHING;
INSERT INTO promo_codes (code, kind, plan, price_rub, max_uses, note)
VALUES ('OSNOVATEL', 'price', 'pro', 990, 20, 'Цена основателя: Pro за 990 ₽ навсегда')
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
