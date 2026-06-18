-- M8 + M16: troca o GUC `app.current_tenant_id` (que o client JS nunca seta) por
-- isolamento real via tenant_memberships, e endurece a função count_leads_mensal.
--
-- IMPORTANTE: o banco real pode não conter todas estas tabelas/funções (algumas
-- migrações do repo não foram aplicadas — ex.: sales_transactions). Por isso TUDO é
-- guardado por existência (to_regclass/to_regprocedure): aplica onde existir, ignora o
-- resto. Idempotente.
--
-- Verificado (não quebra fluxo): sales_transactions/corretor_metrics são lidas pelo
-- frontend via client autenticado (@/lib/supabaseClient) com .eq('tenant_id', tenantId);
-- membros do tenant passam na checagem (o GUC nunca funcionou via JS). tenant_id é UUID.

-- ===== M8: GUC -> membership (sales_transactions, corretor_metrics, teams) =====
DO $$
DECLARE
  t text;
  alvos text[] := ARRAY['sales_transactions', 'corretor_metrics', 'teams'];
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'pulando %, tabela não existe', t;
      CONTINUE;
    END IF;

    -- Remove todas as policies antigas (inclui as do GUC app.current_tenant_id).
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- FOR ALL: owner da plataforma (email inline) OU membro do tenant. Só `authenticated`.
    EXECUTE format($pol$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (
          lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
          OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                     WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid())
        )
        WITH CHECK (
          lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
          OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                     WHERE tm.tenant_id = %I.tenant_id AND tm.user_id = auth.uid())
        )
    $pol$, t || '_tenant_isolation', t, t, t);
  END LOOP;
END $$;

-- ===== M16: count_leads_mensal (se existir) =====
-- Já é SECURITY INVOKER (RLS de `leads` aplica ao caller). Hardening: fixar search_path
-- e revogar EXECUTE de anon (não há motivo p/ anônimo contar leads).
DO $$
BEGIN
  IF to_regprocedure('public.count_leads_mensal(uuid)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.count_leads_mensal(uuid) SET search_path = public';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.count_leads_mensal(uuid) FROM anon';
  END IF;
END $$;
