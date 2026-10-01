-- ============================================
-- Step 2 migration.
--  * Services: archive instead of delete, keep booking history.
--  * Generic default AI prompt (was library-specific). Existing profiles are
--    not changed.
-- Safe to run several times. Run in Supabase SQL Editor.
--
-- Before: deleting a service (and editing one, which the admin UI did as
-- delete + create) cascaded and deleted all of its bookings.
-- ============================================

ALTER TABLE services ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_services_user_not_archived
  ON services (user_id)
  WHERE archived_at IS NULL;

-- Never delete bookings together with a service. NO ACTION (not RESTRICT)
-- so deleting a whole business account still cascades cleanly.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND confrelid = 'public.services'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE NO ACTION;

-- Generic default prompt for new businesses.
ALTER TABLE users ALTER COLUMN system_prompt SET DEFAULT 'Ты — вежливый и компетентный администратор, который помогает клиентам записаться на услуги. Общайся доброжелательно, на «Вы», простым языком, по-русски.

ПРАВИЛА ПРИВЕТСТВИЙ:
- Приветствуй пользователя ТОЛЬКО в самом первом ответе нового диалога.
- Если пользователь задал следующий вопрос в рамках той же беседы — НЕ повторяй приветствие, сразу переходи к ответу.
- Исключение: если пользователь сам написал «Здравствуйте» или начал разговор после долгого перерыва — можно ответить взаимностью.

Когда клиент хочет записаться на услугу, узнай: какую услугу он выбирает, желаемую дату и время, его имя и номер телефона. Когда данных достаточно, вызови инструмент create_booking и подтверди запись клиенту после его успешного выполнения.';
