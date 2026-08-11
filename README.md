# Telegram Mini App — Бронирование услуг

Mini App для бизнеса (например, библиотеки, салона, студии), позволяющее клиентам:

- просматривать услуги и рабочие часы в Telegram и MAX Messenger;
- бронировать слоты в режиме реального времени;
- общаться с бизнесом через AI-ассистента на базе OpenAI (GPT-4o-mini).

Владелец бизнеса управляет всем через веб-интерфейс: услуги, бронирования, расписание, бизнес-инфо, тарифы и оплату.

## Стек

- **Next.js 16** (App Router), React 19, TypeScript, Tailwind CSS
- **Supabase** (PostgreSQL, Auth, RLS)
- **OpenAI API** (`gpt-4o-mini`) — AI-ассистент в чате
- **ЮKassa** — приём подписок (Free / Pro / Business)
- **Telegram Bot API** — вебхук с `secret_token` на каждый бизнес
- **MAX Bot API** — вебхук с `X-Max-Bot-Api-Secret` на каждый бизнес

## Тарифы

| Тариф | Цена | AI-сообщений/мес | Услуг | Брендинг |
|-------|------|------------------|-------|----------|
| Free | 0 ₽ | 50 | 3 | — |
| Pro | 1490 ₽/мес | 1000 | 50 | — |
| Business | 4990 ₽/мес | 10000 | ∞ | + |

## Настройка

### 1. Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```bash
cp .env.example .env
```

| Переменная | Назначение |
|------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (публичный) ключ Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role ключ (обходит RLS, только на сервере) |
| `NEXT_PUBLIC_APP_URL` | Публичный https-URL деплоя (не localhost) |
| `OPENAI_API_KEY` | Ключ OpenAI для AI-ассистента |
| `YOOKASSA_SHOP_ID` | Идентификатор магазина ЮKassa |
| `YOOKASSA_SECRET_KEY` | Секретный ключ ЮKassa (доступ к API) |
| `CRON_SECRET` | Секрет для cron-эндпоинта продления подписок |

### 2. База данных

1. Создайте проект в [Supabase](https://supabase.com).
2. В SQL Editor выполните содержимое [`schema.sql`](./schema.sql) — создаются таблицы `users`, `services`, `bookings`, `ai_usage`, `subscriptions`, `payments`, RLS-политики и функции.
3. Включите Supabase Auth (email-пароль) и Telegram-авторизацию, если используется.
4. Включите **Realtime** для таблицы `bookings` — обновления расписания мгновенно отражаются у клиентов.

### 3. Telegram-бот

1. Создайте бота через [@BotFather](https://t.me/BotFather) и получите токен.
2. Укажите токен в настройках бизнеса в админке.
3. Вызовите "Настроить бота" — приложение автоматически зарегистрирует вебхук по адресу:

```
https://your-domain.com/api/bot/webhook/{businessId}
```

с уникальным `secret_token` для каждого бизнеса.

### 4. MAX-бот

1. Создайте бота на платформе MAX:
   - верифицируйте профиль организации/ИП/самозанятого на [business.max.ru](https://business.max.ru);
   - создайте чат-бота и получите токен доступа (раздел **Чат-боты → Расширенные настройки → Настроить**, либо команда **«Получить токен»** в боте [«MAX для бизнеса»](https://max.ru/business_bot));
2. Укажите токен в настройках бизнеса в админке (поле MAX Messenger Bot).
3. Вызовите "Настроить бота" — приложение зарегистрирует вебхук-подписку:

```
https://your-domain.com/api/max/webhook/{businessId}
```

с уникальным `secret` (заголовок `X-Max-Bot-Api-Secret`) для каждого бизнеса.

4. Привяжите мини-приложение к боту на платформе MAX — укажите URL приложения
   `https://your-domain.com/app`. Кнопка «Записаться» в чате открывает мини-приложение
   с `start_param`, равным `businessId`.

> Примечание: для работы MAX-бота требуется HTTPS. MAX прекращает поддержку вебхуков по HTTP с 25 мая 2026.

### 5. ЮKassa

1. Зарегистрируйте магазин в ЮKassa и получите `shop_id` и секретный ключ.
2. Укажите в `.env` переменные `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`.
3. В кабинете ЮKassa настройте HTTP-уведомления на URL:

```
https://your-domain.com/api/billing/webhook
```

4. Для рекуррентных списаний (автопродление Pro/Business) включите **saved_income** (рекуррентные платежи) в настройках магазина.

### 6. Cron продления подписок

Для автопродления подписок раз в день вызывайте:

```
GET https://your-domain.com/api/cron/renew-subscriptions
Authorization: Bearer <CRON_SECRET>
```

Пример для cron-сервиса (Vercel Cron, GitHub Actions и т.п.):

```bash
curl -X GET https://your-domain.com/api/cron/renew-subscriptions \
  -H "Authorization: Bearer <CRON_SECRET>"
```

## Запуск

```bash
npm install
npm run dev
```

Продакшен-сборка:

```bash
npm run build
npm start
```

## Структура API

| Эндпоинт | Назначение | Защита |
|----------|------------|--------|
| `/api/bot/webhook/[businessId]` | Вебхук Telegram-бота | `secret_token` |
| `/api/bot/setup` | Регистрация вебхука бота | Auth |
| `/api/bot/commands` | Команды бота | Auth |
| `/api/max/webhook/[businessId]` | Вебхук MAX-бота | `X-Max-Bot-Api-Secret` |
| `/api/max/setup` | Подписка на обновления MAX-бота | Auth |
| `/api/public/services` | Публичные услуги | — |
| `/api/timeslots` | Доступные слоты | Service role |
| `/api/bookings` | Создание/список броней | initData + rate limit |
| `/api/chat` | AI-ассистент | initData + rate limit + квота |
| `/api/services` | CRUD услуг | Auth + лимит тарифа |
| `/api/settings` | Настройки бизнеса | Auth |
| `/api/billing/checkout` | Создание платежа ЮKassa | Auth |
| `/api/billing/webhook` | Уведомления ЮKassa | Подпись |
| `/api/billing/status` | Статус подписки | Auth |
| `/api/billing/cancel` | Отмена подписки | Auth |
| `/api/cron/renew-subscriptions` | Автопродление | `CRON_SECRET` |

## Безопасность

- **RLS**: клиентские политики ограничены собственными строками; чувствительные данные читаются серверными роутами через service role.
- **initData**: верификация Telegram/MAX initData (HMAC-SHA256) для публичных мутаций.
- **Rate limiting**: in-memory лимитер (20 запросов/мин для чата, 10/мин для бронирования).
- **AI-квота**: месячный лимит сообщений зависит от тарифа, учитывается через `ai_usage`.

## Миграции

- `migration.sql` — расширение базовой схемы (вебхуки ботов, тарифы, AI-квота).
- `migration-max.sql` — поддержка MAX-бота (`max_bot_token`, `max_bot_username`, `max_bot_webhook_secret`, `max_bot_webhook_set`).
