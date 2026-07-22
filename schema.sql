-- ============================================
-- AI-Powered Telegram Mini App CRM & Booking System
-- Supabase Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Business Owners (extends Supabase auth.users)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  system_prompt TEXT DEFAULT 'You are a helpful assistant for our business. You can help customers learn about our services, pricing, and book appointments.',
  working_hours JSONB DEFAULT '{
    "monday": {"start": "09:00", "end": "18:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "18:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "18:00", "enabled": true},
    "friday": {"start": "09:00", "end": "18:00", "enabled": true},
    "saturday": {"start": "10:00", "end": "14:00", "enabled": false},
    "sunday": {"start": "10:00", "end": "14:00", "enabled": false}
  }'::jsonb,
  bot_token TEXT,
  bot_username TEXT,
  bot_webhook_set BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, business_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Services offered by businesses
-- ============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Bookings
-- ============================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_services_user_id ON services(user_id);
CREATE INDEX idx_services_active ON services(active) WHERE active = true;
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Users can only see/update their own profile
CREATE POLICY "Users see own profile" ON users
  FOR ALL USING (auth.uid() = id);

-- Users can manage their own services
CREATE POLICY "Users manage own services" ON services
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own bookings
CREATE POLICY "Users manage own bookings" ON bookings
  FOR ALL USING (auth.uid() = user_id);

-- Public read for services (Telegram customers need to browse)
CREATE POLICY "Public read services" ON services
  FOR SELECT USING (active = true);

-- Public insert for bookings (Telegram customers can book)
CREATE POLICY "Public insert bookings" ON bookings
  FOR INSERT WITH CHECK (true);

-- Public read for bookings (for confirmation lookup)
CREATE POLICY "Public read own bookings" ON bookings
  FOR SELECT USING (true);

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
