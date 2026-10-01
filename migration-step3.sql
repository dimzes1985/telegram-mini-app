-- ============================================
-- Step 3 migration: "My bookings" for customers + reminders.
-- Safe to run several times. Run in Supabase SQL Editor.
-- ============================================

-- Secret token that lets a customer of the mobile web app see and cancel
-- their own booking (stored only on their device).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS manage_token UUID DEFAULT gen_random_uuid();
UPDATE bookings SET manage_token = gen_random_uuid() WHERE manage_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings (manage_token);

-- Who cancelled the booking and when the reminder was sent.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_cancelled_by_check') THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'owner'));
  END IF;
END $$;

-- Reminder cron looks up tomorrow's active bookings that were not reminded yet.
CREATE INDEX IF NOT EXISTS idx_bookings_reminders
  ON bookings (booking_date)
  WHERE status <> 'cancelled' AND reminder_sent_at IS NULL;
