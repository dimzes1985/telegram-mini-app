-- ============================================
-- Step 5 migration: flexible slot grid + pause between bookings.
-- Safe to run several times. Run in Supabase SQL Editor.
-- ============================================

-- slot_step_minutes: NULL = step equals the service duration (old behaviour),
--                    otherwise 15 / 30 / 60.
-- buffer_minutes:    pause after every booking (cleanup, preparation).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slot_step_minutes INT,
  ADD COLUMN IF NOT EXISTS buffer_minutes INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_slot_step_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_slot_step_check
      CHECK (slot_step_minutes IS NULL OR slot_step_minutes IN (15, 30, 60));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_buffer_minutes_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_buffer_minutes_check
      CHECK (buffer_minutes BETWEEN 0 AND 120);
  END IF;
END $$;

-- The booked interval now includes the business pause, so the exclusion
-- constraint bookings_no_overlap also guarantees the pause between clients.
-- The interval is only recomputed when date, time or service change, so a
-- plain status change (confirm / cancel) never conflicts because the pause
-- setting was changed later.
CREATE OR REPLACE FUNCTION bookings_set_interval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dur INT;
  buf INT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.booking_date = OLD.booking_date
     AND NEW.booking_time = OLD.booking_time
     AND NEW.service_id = OLD.service_id
     AND OLD.booked_start IS NOT NULL
     AND OLD.booked_end IS NOT NULL THEN
    NEW.booked_start := OLD.booked_start;
    NEW.booked_end := OLD.booked_end;
    RETURN NEW;
  END IF;

  SELECT duration_minutes INTO dur FROM services WHERE id = NEW.service_id;
  IF dur IS NULL OR dur <= 0 THEN
    dur := 30;
  END IF;

  SELECT COALESCE(buffer_minutes, 0) INTO buf FROM users WHERE id = NEW.user_id;
  IF buf IS NULL OR buf < 0 THEN
    buf := 0;
  END IF;

  NEW.booked_start := NEW.booking_date + NEW.booking_time;
  NEW.booked_end   := NEW.booked_start + make_interval(mins => dur + buf);
  RETURN NEW;
END;
$$;
