-- ============================================
-- Fix increment_ai_usage RPC
-- VALUES used the column name "year_month"
-- instead of the parameter "p_year_month",
-- so every increment failed silently.
-- ============================================

CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id UUID,
  p_year_month TEXT
)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO ai_usage (user_id, year_month, messages_count)
  VALUES (p_user_id, p_year_month, 1)
  ON CONFLICT (user_id, year_month)
  DO UPDATE SET messages_count = ai_usage.messages_count + 1,
                updated_at = now()
  RETURNING messages_count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;
