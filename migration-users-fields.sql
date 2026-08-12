-- ============================================
-- Add business profile fields to users table
-- The live DB was created from an older schema
-- that lacked these columns; schema.sql has them.
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "18:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "18:00", "enabled": true},
    "friday": {"start": "09:00", "end": "18:00", "enabled": true},
    "saturday": {"start": "10:00", "end": "14:00", "enabled": false},
    "sunday": {"start": "10:00", "end": "14:00", "enabled": false}
  }'::jsonb;
