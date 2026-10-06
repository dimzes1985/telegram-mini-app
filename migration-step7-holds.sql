-- Step 7: temporary holds. When a customer picks a time, it is reserved
-- for them for a few minutes while they fill in the form, so nobody else
-- can take it in the meantime. Only the server (service_role) uses it.

CREATE TABLE IF NOT EXISTS booking_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  token TEXT NOT NULL UNIQUE,
  client_key TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_holds_business_date
  ON booking_holds (user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_booking_holds_client
  ON booking_holds (client_key, expires_at);

-- Two holds can never start at the same time for the same master.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_holds_slot_unique
  ON booking_holds (
    user_id,
    COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    booking_date,
    booking_time
  );

ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;
GRANT ALL ON booking_holds TO service_role;

NOTIFY pgrst, 'reload schema';
