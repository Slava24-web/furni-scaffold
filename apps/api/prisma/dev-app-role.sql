-- Роль приложения для ЛОКАЛЬНОЙ РАЗРАБОТКИ И CI.
--
-- Приложение обязано ходить в БД под ролью без SUPERUSER, без владения
-- таблицами и без BYPASSRLS. Суперпользователь игнорирует политики RLS
-- целиком — даже FORCE ROW LEVEL SECURITY на него не действует, и вся
-- изоляция тенантов превращается в декорацию.
--
-- В проде пароль задаётся провижинингом и в репозитории не хранится.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'furni_app') THEN
    CREATE ROLE furni_app LOGIN PASSWORD 'furni_app';
  ELSE
    ALTER ROLE furni_app LOGIN PASSWORD 'furni_app';
  END IF;
END $$;
