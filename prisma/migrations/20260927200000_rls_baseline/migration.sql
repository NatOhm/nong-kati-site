-- Production review (High): deny-by-default RLS baseline for every
-- application table. The Prisma models hold customers, orders, gift codes,
-- payments, administrator rows and authentication tokens; until now NO
-- migration enabled row-level security, so if these tables live in a
-- Data-API-exposed schema with grants to `anon`/`authenticated`, any client
-- credential could read or mutate another customer's data.
--
-- What this baseline does:
--   1. ENABLE ROW LEVEL SECURITY on every application table — with no
--      policies created, Postgres denies every row to non-owner roles.
--      Deny-by-default: a future Data API exposure grants nothing.
--   2. Revokes every privilege from `anon`, `authenticated` and
--      `supabase_realtime_admin` — the roles Supabase client surfaces use —
--      so the tables are invisible to the Data API regardless of the
--      schema's API exposure setting.
--
-- What is deliberately NOT here:
--   - FORCE ROW LEVEL SECURITY: it would apply RLS to the TABLE OWNER —
--     the role Prisma connects as — and break every query the app makes.
--     The owner bypasses plain ENABLE RLS, so the application keeps its
--     full access while client roles are locked out.
--   - Any permissive policy: none of these tables is ever read/written by
--     an end-user Postgres role; all access flows through the Next.js API
--     (service role). If a table ever needs direct client access, it must
--     ship a reviewed, narrowly scoped policy in a new migration.
--
-- Every statement is guarded (IF EXISTS / DO blocks) because CI runs
-- migrations against a plain Postgres 16 where the Supabase roles do not
-- exist; the outcome is identical where they do.

DO $$
DECLARE
  t text;
  table_names text[] := ARRAY[
    'Category', 'Product', 'ProductAlias', 'InventorySnapshot', 'StockMove',
    'Cart', 'CartItem', 'Customer', 'WishlistItem', 'TopUpLog', 'Coupon',
    'CouponRedemption', 'Order', 'OrderItem', 'GiftCode', 'CodeUploadBatch',
    'PaymentAttempt', 'Invoice', 'Refund', 'SiteSetting', 'AdminUser',
    'AdminChallengeConsumed', 'AdminSession', 'AuditLog', 'Tag', 'ProductTag',
    'SupportTicket', 'NotificationRead', 'MagicLinkToken',
    'PasswordResetToken', 'PhoneOtpToken', 'DataSubjectRequest',
    'HeroSlide', 'EmailOutbox', 'AdminBackupCode',
    -- Prisma's own migration-history table (created by `migrate deploy`
    -- itself, owner-only access, never read by clients) — included so the
    -- CI verification "every public table has RLS" holds exactly.
    '_prisma_migrations'
  ];
BEGIN
  FOREACH t IN ARRAY table_names LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM supabase_realtime_admin';
  END IF;
END $$;
