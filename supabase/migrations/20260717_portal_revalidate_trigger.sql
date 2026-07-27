-- Revalidação on-demand do Portal público via pg_net.
--
-- Fecha o ciclo ISR do briefing:
--   dashboard grava lançamento/condomínio → trigger → net.http_post →
--   POST {portal}/api/revalidate → Next revalida /lotus-home e /lotus-lancamentos.
--
-- Sem isto, o Portal só atualiza quando a janela ISR (1h) expira. Com isto,
-- reflete a mudança em segundos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISÕES / CUIDADOS:
-- - Usa pg_net (net.http_post): HTTP ASSÍNCRONO, NÃO bloqueia o INSERT/UPDATE do
--   dashboard. Se o Portal estiver fora do ar, a escrita no dash não falha.
-- - Config (URL do Portal + secret) fica numa tabela `portal_config` de 1 linha,
--   NÃO hard-coded no corpo do trigger. Assim dá para trocar a URL/secret sem
--   recriar a função (e o secret não vaza em \df).
-- - FALHA SILENCIOSA: se a URL não estiver configurada (deploy do Portal ainda
--   não feito), o trigger não faz nada — não quebra o dashboard. É seguro aplicar
--   ANTES do Portal existir; basta preencher portal_config no go-live.
-- - O trigger é AFTER INSERT/UPDATE/DELETE FOR EACH STATEMENT (não FOR EACH ROW):
--   uma alteração em lote (ex. importação) dispara UMA revalidação, não N. Evita
--   inundar o /api/revalidate.
-- - Segurança: a chamada envia o header x-revalidate-secret; o Portal rejeita
--   (401) sem ele. O secret vem da config, nunca exposto ao cliente.
--
-- ⚠️ PREENCHER NO GO-LIVE (quando o Portal tiver URL de produção):
--   UPDATE public.portal_config
--      SET portal_url = 'https://SEU-PORTAL.vercel.app',
--          revalidate_secret = 'O_MESMO_SECRET_DO_ENV_REVALIDATE_SECRET_DO_PORTAL';
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_portal_revalidate_lancamentos ON public.lancamentos;
--   DROP TRIGGER IF EXISTS trg_portal_revalidate_condominios ON public.condominios;
--   DROP FUNCTION IF EXISTS public.portal_revalidate();
--   DROP TABLE IF EXISTS public.portal_config;
--   -- (pg_net pode ficar habilitado; é inócuo.)
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ APLICAÇÃO: CREATE TRIGGER pega AccessExclusiveLock nas tabelas; com o
--    dashboard ativo pode dar "deadlock detected" (a transação inteira reverte —
--    nada fica pela metade). Rodar em baixo tráfego; se deadlockar, reexecutar
--    (idempotente). lock_timeout curto faz falhar rápido em vez de travar.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Extensão pg_net (HTTP a partir do Postgres). Idempotente.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Config de 1 linha: URL do Portal + secret. Sem RLS pública; só service_role
--    e owner leem (é dado sensível — contém o secret).
CREATE TABLE IF NOT EXISTS public.portal_config (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- garante 1 linha só
  portal_url        TEXT,          -- ex 'https://portal.vercel.app' (sem barra final)
  revalidate_secret TEXT,          -- == REVALIDATE_SECRET do env do Portal
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.portal_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.portal_config ENABLE ROW LEVEL SECURITY;
-- Sem policies = ninguém acessa via anon/authenticated (PostgREST). Só
-- service_role (bypass RLS) e o trigger (SECURITY DEFINER) leem. Secret protegido.

-- 3. Função de trigger: lê a config e dispara o POST se a URL estiver definida.
-- search_path = '' + tudo schema-qualificado (public.*, net.*): boa prática do
-- Supabase para SECURITY DEFINER, evita escalonamento de privilégio.
CREATE OR REPLACE FUNCTION public.portal_revalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cfg public.portal_config%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.portal_config WHERE id = 1;

  -- Falha silenciosa: sem URL configurada (Portal ainda não no ar), não faz nada.
  IF cfg.portal_url IS NULL OR length(cfg.portal_url) = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url     := cfg.portal_url || '/api/revalidate',
    body    := jsonb_build_object('source', TG_TABLE_NAME, 'op', TG_OP),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-revalidate-secret', COALESCE(cfg.revalidate_secret, '')
               )
  );

  RETURN NULL; -- AFTER trigger: valor de retorno é ignorado.
EXCEPTION WHEN OTHERS THEN
  -- Nunca deixar a revalidação quebrar a escrita do dashboard.
  RAISE WARNING 'portal_revalidate falhou: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- 4. Triggers por STATEMENT (uma revalidação por operação, não por linha).
DROP TRIGGER IF EXISTS trg_portal_revalidate_lancamentos ON public.lancamentos;
CREATE TRIGGER trg_portal_revalidate_lancamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos
  FOR EACH STATEMENT EXECUTE FUNCTION public.portal_revalidate();

DROP TRIGGER IF EXISTS trg_portal_revalidate_condominios ON public.condominios;
CREATE TRIGGER trg_portal_revalidate_condominios
  AFTER INSERT OR UPDATE OR DELETE ON public.condominios
  FOR EACH STATEMENT EXECUTE FUNCTION public.portal_revalidate();

COMMIT;
