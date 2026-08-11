-- MAX Messenger bot integration
-- Run this after the base schema to add MAX bot support columns.

ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_webhook_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bot_webhook_set BOOLEAN DEFAULT false;
