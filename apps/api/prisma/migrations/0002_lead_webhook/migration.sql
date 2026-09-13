-- Куда отправлять заявку и чем подписывать вызов.
-- Пусто — заявка просто лежит в базе и ждёт, пока её заберут.
ALTER TABLE "tenants"
  ADD COLUMN "lead_webhook_url" TEXT,
  ADD COLUMN "lead_webhook_secret" TEXT;
