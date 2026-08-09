-- =============================================================================
-- Índice para a contagem de leads por corretor (GET /api/v1/brokers).
--
-- A rota passou a contar no banco (uma COUNT por corretor) em vez de baixar as
-- linhas e contar no Node — o jeito antigo lia colunas inexistentes e, mesmo
-- corrigido, empacaria no teto de 1000 linhas do PostgREST.
--
-- Sem índice, cada COUNT é um scan das linhas do tenant: medido em ~2,1s a frio
-- e ~100ms morno sobre um tenant com 71.626 leads, com 77 corretores ativos
-- (~3,5s para a rota inteira). Com o índice o filtro vira lookup.
--
-- attended_by_name é o vínculo que existe nos dados (attended_by_id vem
-- preenchido em ~1% das linhas), por isso ele é a segunda coluna do índice
-- composto — tenant_id primeiro porque TODA query da rota filtra por tenant.
--
-- Sem CONCURRENTLY de propósito: o editor SQL do Supabase roda dentro de uma
-- transação e CONCURRENTLY não é permitido ali (25001). A tabela tem ~84k
-- linhas, então o CREATE INDEX comum termina em menos de um segundo — a janela
-- em que escritas ficam bloqueadas é desprezível.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_kenlo_leads_tenant_attended_by_name
  ON public.kenlo_leads (tenant_id, attended_by_name);

-- attended_by_id é raro mas é o vínculo forte quando existe; índice parcial para
-- não pagar por 99% de linhas nulas.
CREATE INDEX IF NOT EXISTS idx_kenlo_leads_tenant_attended_by_id
  ON public.kenlo_leads (tenant_id, attended_by_id)
  WHERE attended_by_id IS NOT NULL;
