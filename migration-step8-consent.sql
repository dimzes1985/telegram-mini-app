-- Step 8: when the customer gave consent to personal data processing.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
