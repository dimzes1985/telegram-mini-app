-- ============================================
-- Atomic double-booking protection (exclusion constraint).
--
-- The previous BEFORE INSERT trigger (migration-slot-overlap-trigger.sql) only
-- compared against rows that were already COMMITTED. Under READ COMMITTED two
-- concurrent inserts each miss the other's uncommitted row, so both pass the
-- check and lock overlapping intervals. The unique index
-- idx_bookings_slot_unique only covers an identical start time, not overlapping
-- intervals with different starts.
--
-- This migration materializes each booking's exact interval and lets Postgres
-- enforce non-overlap atomically at the GiST index level, which is also correct
-- under concurrency.
--
-- Run in the Supabase SQL editor AFTER migration-slot-overlap-trigger.sql.
-- ============================================

-- btree_gist provides the GiST equality operator class for uuid (user_id).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Interval snapshot: booking_date + booking_time .. + service duration.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booked_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS booked_end TIMESTAMP;

-- 2) Backfill existing rows (services are guaranteed by the FK).
UPDATE bookings b
SET booked_start = b.booking_date + b.booking_time,
    booked_end   = b.booking_date + b.booking_time
                   + make_interval(mins => COALESCE(s.duration_minutes, 30))
FROM services s
WHERE s.id = b.service_id
  AND (b.booked_start IS NULL OR b.booked_end IS NULL);

-- 3) Refuse to add the constraint if the race already produced overlapping
--    pairs; they must be resolved manually first. The error reports how many.
DO $$
DECLARE
  conflicts INT;
BEGIN
  SELECT COUNT(*) INTO conflicts
  FROM bookings a
  JOIN bookings b
    ON a.id < b.id
   AND a.user_id = b.user_id
   AND a.status <> 'cancelled'
   AND b.status <> 'cancelled'
   AND tsrange(a.booked_start, a.booked_end, '[)')
       && tsrange(b.booked_start, b.booked_end, '[)');

  IF conflicts > 0 THEN
    RAISE EXCEPTION
      'Cannot add bookings_no_overlap: % overlapping active booking pair(s) already exist. Resolve them, then re-run.',
      conflicts;
  END IF;
END $$;

ALTER TABLE bookings
  ALTER COLUMN booked_start SET NOT NULL,
  ALTER COLUMN booked_end SET NOT NULL;

-- 4) Keep the snapshot in sync on insert and on update (e.g. time/service
--    changes). Runs BEFORE the constraints, so the values are set by the time
--    the exclusion constraint is evaluated.
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

DROP TRIGGER IF EXISTS trg_bookings_set_interval ON bookings;
CREATE TRIGGER trg_bookings_set_interval
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_set_interval();

-- 5) Atomic non-overlap: at most one active booking may hold a given
--    [booked_start, booked_end) instant range per business.
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_no_overlap;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tsrange(booked_start, booked_end, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

-- 6) Remove the now-superseded trigger-based check.
DROP TRIGGER IF EXISTS trg_prevent_overlapping_booking ON bookings;
DROP FUNCTION IF EXISTS prevent_overlapping_booking();
