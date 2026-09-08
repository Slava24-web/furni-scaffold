-- Row-Level Security. Применяется ПОСЛЕ prisma migrate deploy.
-- Это страховка от ошибки в коде приложения, а не основной механизм:
-- фильтр по tenant_id в запросах тоже обязателен (CLAUDE.md, правило 5).
--
-- Механика: каждый запрос выполняется в транзакции, где выставлен
-- SET LOCAL app.tenant_id = '<uuid>'. Политика сравнивает его с колонкой.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'products', 'assets', 'materials',
    'option_groups', 'options', 'product_rules', 'scenes', 'leads'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE нужен, иначе владелец таблицы обходит политику
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id())
    $f$, t);
  END LOOP;
END $$;

-- Таблица tenants читается только сервисной ролью (провижининг, биллинг).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants
  USING (id = current_tenant_id());

-- Роль приложения. НЕ должна быть владельцем таблиц и НЕ должна иметь BYPASSRLS.
-- Пароль задаётся при провижининге, здесь плейсхолдер.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'furni_app') THEN
    CREATE ROLE furni_app LOGIN;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO furni_app;
GRANT USAGE ON SCHEMA public TO furni_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO furni_app;
