-- ============================================
-- Step 4 migration: days off / holidays.
-- Safe to run several times. Run in Supabase SQL Editor.
-- (Lunch breaks are stored inside users.working_hours, no migration needed.)
-- ============================================

CREATE TABLE IF NOT EXISTS business_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE business_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own closures" ON business_closures;
CREATE POLICY "Users manage own closures" ON business_closures
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
