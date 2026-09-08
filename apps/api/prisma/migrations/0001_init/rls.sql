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

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
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
DROP POLICY IF EXISTS tenant_self ON tenants;
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

-- ---------------------------------------------------------------------------
-- Разрешение тенанта по slug
-- ---------------------------------------------------------------------------
-- Задача курицы и яйца: чтобы выставить app.tenant_id, его сначала надо
-- узнать, а политика tenant_self читать tenants до этого не даёт. Обычный
-- SELECT по slug из приложения всегда возвращал бы пусто, и ни один запрос
-- не проходил бы дальше middleware.
--
-- Дыру делаем узкой и явной: SECURITY DEFINER функция от роли с BYPASSRLS,
-- отдаёт ровно два поля по одному slug и ничего больше. Перечислить
-- тенантов через неё нельзя, читать их данные — тоже.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'furni_bootstrap') THEN
    CREATE ROLE furni_bootstrap NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION resolve_tenant(p_slug text)
RETURNS TABLE (id uuid, allowed_origins text[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id, COALESCE(t."allowedOrigins", ARRAY[]::text[])
  FROM tenants t
  WHERE t.slug = p_slug
$$;

ALTER FUNCTION resolve_tenant(text) OWNER TO furni_bootstrap;
-- BYPASSRLS снимает политику, но не заменяет GRANT: без прав на таблицу
-- функция падает с permission denied ещё до проверки политик
GRANT SELECT ON tenants TO furni_bootstrap;
REVOKE ALL ON FUNCTION resolve_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant(text) TO furni_app;
