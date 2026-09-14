-- Migration: liga RLS em commercial_sales, commercial_sales_import_batches e bug_reports
-- Data: 2026-09-14
--
-- 1) commercial_sales / commercial_sales_import_batches
-- As policies por tenant JÁ EXISTEM, mas o RLS estava desligado, então não
-- valiam: qualquer usuário logado, de qualquer imobiliária, lia e alterava as
-- vendas (VGV, comissões, cliente_nome) de todos os tenants — inclusive pelas
-- views commercial_sales_monthly_summary/broker_summary, que são
-- security_invoker. O anon já tinha sido fechado em 20260910.
-- Quem acessa: o front lê sempre filtrando pelo próprio tenant
-- (commercialSalesService); a edge function sync-commercial-sales-google-sheet,
-- server/kpis e server/agent-telemetry usam service_role (ignora RLS).
-- Simulado em 14/09 numa transação desfeita: corretor da Lótus (único tenant
-- com vendas) continua vendo 74 de 74 vendas e 8 linhas do resumo mensal;
-- usuário de outro tenant passa de 74 para 0.
--
-- 2) bug_reports
-- anon tinha SELECT/INSERT/UPDATE/DELETE e o RLS estava desligado. As duas
-- policies antigas comparavam tenant_id com auth.jwt()->>'tenant_id', claim que
-- o app não emite — ligar o RLS com elas quebraria o envio do report
-- (SupportService faz insert + select do registro). Trocadas por policies que
-- olham tenant_memberships, como o resto do app.
-- Simulado em 14/09 (desfeito): corretor da Lótus envia e lê o próprio report;
-- report em tenant alheio é barrado; anon é barrado.
--
-- FORA DAQUI (de propósito): lia_fila_vistas, lia_regras, lia_bolsao_estado.
-- Nenhum código deste repositório as usa — são do app da Lia — e sem saber com
-- qual chave a Lia acessa (anon ou service_role), ligar RLS pode derrubá-la.
--
-- ROLLBACK:
--   ALTER TABLE public.commercial_sales DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.commercial_sales_import_batches DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.bug_reports DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON public.bug_reports TO anon;
--   DROP POLICY "bug_reports insert membro do tenant" ON public.bug_reports;
--   DROP POLICY "bug_reports select membro do tenant" ON public.bug_reports;
--   CREATE POLICY "Users can insert reports" ON public.bug_reports AS PERMISSIVE FOR INSERT TO public
--     WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id'::text));
--   CREATE POLICY "Users can view own tenant reports" ON public.bug_reports AS PERMISSIVE FOR SELECT TO public
--     USING ((tenant_id = (auth.jwt() ->> 'tenant_id'::text)) OR ((auth.jwt() ->> 'role'::text) = 'admin'::text));

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1 -------------------------------------------------------------------------
ALTER TABLE public.commercial_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_sales_import_batches ENABLE ROW LEVEL SECURITY;

-- 2 -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Users can view own tenant reports" ON public.bug_reports;

-- tenant_id é text nesta tabela; o owner pode estar com tenant 'owner'.
CREATE POLICY "bug_reports insert membro do tenant" ON public.bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

CREATE POLICY "bug_reports select membro do tenant" ON public.bug_reports
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

REVOKE ALL ON public.bug_reports FROM anon;
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
