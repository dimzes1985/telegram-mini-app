-- ============================================
-- Prevent overlapping bookings.
-- A service takes duration_minutes, so a booking occupies the interval
-- [booking_time, booking_time + duration). This trigger rejects any insert
-- whose interval overlaps a non-cancelled booking of the same business and
-- date, guarding the race between the API-level conflict check and the insert
-- (the exact-start unique index still handles the "same minute" case).
--
-- Run in the Supabase SQL editor.
-- ============================================

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
