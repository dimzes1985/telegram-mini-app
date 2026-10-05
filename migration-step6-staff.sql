-- ============================================
-- Step 6 migration: several staff members (masters / rooms).
-- Safe to run several times. Run in Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  -- Services this staff member performs; empty array = all services.
  service_ids UUID[] NOT NULL DEFAULT '{}',
  -- Personal schedule in the same format as users.working_hours;
  -- NULL = the business working hours.
  working_hours JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  -- Staff with bookings are archived instead of deleted.
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff (user_id);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own staff" ON staff;
CREATE POLICY "Users manage own staff" ON staff
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO authenticated;
GRANT ALL ON staff TO service_role;

-- Which staff member a booking is with (NULL = business without staff).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_bookings_staff_id ON bookings (staff_id);

-- Double-booking guards are now per staff member: two clients may book the
-- same time with different masters. Bookings without a staff member share
-- one "resource" (the zero uuid), exactly like before.
DROP INDEX IF EXISTS idx_bookings_slot_unique;
CREATE UNIQUE INDEX idx_bookings_slot_unique
  ON bookings (
    user_id,
    COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    booking_date,
    booking_time
  )
  WHERE status <> 'cancelled';

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    (COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    tsrange(booked_start, booked_end, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

NOTIFY pgrst, 'reload schema';
