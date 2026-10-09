-- Step 11: requests from the landing page (questions, "set it up for me").
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'question' CHECK (kind IN ('question', 'setup', 'chat')),
  name TEXT NOT NULL,
  contact TEXT,
  niche TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON leads FROM anon, authenticated;
GRANT ALL ON leads TO service_role;
