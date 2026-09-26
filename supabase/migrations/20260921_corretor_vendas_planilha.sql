-- =============================================================================
-- `corretor_vendas_planilha`: o número de vendas do ranking da planilha de
-- comissionamento, por corretor e por mês.
--
-- POR QUE UMA TABELA
-- A planilha é editada à mão e lida de hora em hora (server/rankingPlanilha).
-- Guardar o resultado da leitura deixa a tela independente do Google: se a
-- planilha sair do ar, o último número lido continua aparecendo, com a data.
--
-- POR QUE O NOME DA PLANILHA É PARTE DA CHAVE
-- O casamento com o corretor cadastrado é por nome e nem sempre acontece (a
-- base ainda tem "Fernanda Souza" e "Fernanda" como pessoas diferentes — P0.2
-- do plano). Linha sem `user_id` é justamente o que precisa aparecer para
-- alguém arrumar; se a chave fosse o user_id, essas linhas se atropelariam.
--
-- ESTE NÚMERO NÃO É O DA DASH. A Dash conta vendas pelas propostas assinadas;
-- a planilha tem outras (Terceiros, parcerias). Por isso a tela rotula a
-- origem, e este dado nunca sobrescreve o cálculo próprio.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.corretor_vendas_planilha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ano smallint NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  nome_planilha text NOT NULL,
  -- Nulo = nome da planilha que não casou com nenhum corretor cadastrado.
  user_id uuid,
  nivel text,
  equipe text,
  vendas integer NOT NULL CHECK (vendas >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ano, mes, nome_planilha)
);

CREATE INDEX IF NOT EXISTS idx_corretor_vendas_planilha_user
  ON public.corretor_vendas_planilha (tenant_id, user_id, ano, mes)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.corretor_vendas_planilha ENABLE ROW LEVEL SECURITY;

-- Leitura: quem é da imobiliária. Escrita é só do job (service_role, que passa
-- por cima de RLS) — sem policy de INSERT/UPDATE de propósito.
DROP POLICY IF EXISTS corretor_vendas_planilha_select_tenant ON public.corretor_vendas_planilha;
CREATE POLICY corretor_vendas_planilha_select_tenant
  ON public.corretor_vendas_planilha
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = corretor_vendas_planilha.tenant_id
      AND tm.user_id = auth.uid()
  ));

-- O pg_default_acl do Supabase concede leitura a anon em toda tabela nova. A RLS
-- já barra (a policy exige membro do tenant), mas a chave pública do navegador
-- não tem por que alcançar esta tabela — cinto e suspensório.
REVOKE ALL ON public.corretor_vendas_planilha FROM anon;
GRANT SELECT ON public.corretor_vendas_planilha TO authenticated;

COMMENT ON TABLE public.corretor_vendas_planilha IS
  'Ranking de vendas lido da planilha de comissionamento (server/rankingPlanilha). Fonte externa: não substitui o cálculo da Dash.';
