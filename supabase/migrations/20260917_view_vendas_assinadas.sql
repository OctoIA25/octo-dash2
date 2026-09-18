-- Migration: view `vendas_assinadas` — a fonte única de VGV e VGC
-- Data: 2026-09-17
-- Descrição: hoje o mesmo número é calculado em dois lugares e de dois jeitos.
--
--   server/kpis/kpisData.js  → soma `commercial_sales`, que CONGELOU em 01/09
--                              quando o sync da planilha foi desligado;
--   src/features/metricas/services/vendasAssinadasService.ts
--                            → soma `proposals`, com fallback de comissão.
--
-- Resultado prático: a aba KPIs mostra VGV/VGC de um retrato de 01/09 que nunca
-- mais se mexe, enquanto o resto da dash já lê a venda do funil no mesmo dia.
--
-- Portar a regra de comissão para o servidor em JS criaria a TERCEIRA cópia. O
-- comentário de src/features/forecast/utils/comissao.ts já avisa por quê:
-- "Persistir criaria uma segunda fonte de verdade que só discordaria da
-- primeira". Então a regra desce para o banco e os dois lados leem daqui.
--
-- Três decisões embutidas:
--
-- 1. FUSO. `signed_at` é timestamptz e o mês que o gestor enxerga é o de
--    São Paulo: uma venda assinada dia 31 às 22h BRT é dia 1º do mês seguinte
--    em UTC e mudaria de mês no relatório. A view já entrega `data_assinatura`
--    como DATE local, então quem consulta filtra por data e não erra a borda.
--
-- 2. COMISSÃO. `commission_total` quando gravado; senão 3,5% (lançamento) ou 6%
--    sobre o valor — a mesma regra de comissao.ts. O fallback não é decorativo:
--    19 de 19 vendas da Imobiliária 1 e 15 de 15 da Área de Teste não têm
--    comissão gravada. Somar a coluna crua zeraria o VGC desses dois tenants.
--
-- 3. security_invoker. Sem isso a view roda com os privilégios de quem a criou
--    e vaza VGV entre imobiliárias — foi o caso de
--    commercial_sales_team_leader_summary, apontado na auditoria.
--
-- `commercial_sales` NÃO é apagada aqui: vira histórico somente-leitura. A
-- remoção segue o caminho seguro (provar que está morta, renomear, depois
-- dropar), numa fatia própria.

-- ORDEM DO DEPLOY: esta migration vai ANTES do servidor desta versão.
-- server/kpis/kpisData.js passa a consultar `vendas_assinadas`; se o código
-- subir sem a view, a aba KPIs perde VGV e VGC (a função devolve zeros e loga,
-- não derruba o painel — mas os dois cards ficam zerados).

CREATE OR REPLACE VIEW public.vendas_assinadas
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.tenant_id,
  p.lead_id,
  p.agent_user_id,
  p.agent_name,
  COALESCE(p.value, 0)::numeric AS vgv,
  (CASE
     WHEN COALESCE(p.commission_total, 0) > 0 THEN p.commission_total
     ELSE round(
       COALESCE(p.value, 0) *
       (CASE WHEN 'lancamento' = ANY (COALESCE(l.classification, ARRAY[]::text[])) THEN 3.5 ELSE 6 END)
       / 100, 2)
   END)::numeric AS vgc,
  (p.signed_at AT TIME ZONE 'America/Sao_Paulo')::date AS data_assinatura
FROM public.proposals p
LEFT JOIN public.leads l ON l.id = p.lead_id
WHERE p.stage_id = 'proposta-assinada'
  AND p.signed_at IS NOT NULL;

COMMENT ON VIEW public.vendas_assinadas IS
  'Fonte única de VGV/VGC. Nasce de proposals em proposta-assinada; comissão '
  'gravada ou derivada (3,5% lançamento / 6% terceiros); data já no fuso de '
  'São Paulo. Substitui a leitura de commercial_sales, congelada em 01/09.';


-- ATENÇÃO AO GRANT ABAIXO. O `pg_default_acl` do schema `public` no Supabase
-- concede `arwdDxtm` a `anon` e `authenticated` em TODA relação nova — views
-- inclusive. Sem o REVOKE explícito, um `GRANT SELECT TO authenticated,
-- service_role` não restringe coisa alguma: a view já nasceu legível por
-- `anon`, que é a chave embarcada no bundle do browser. Medido no ambiente
-- local em 18/09/2026, com as três views deste plano nascendo `anon_le = t`.
-- `pg_dump` emite GRANT e nunca REVOKE, então isto também não aparece no dump.
REVOKE ALL ON public.vendas_assinadas FROM anon, authenticated;
GRANT SELECT ON public.vendas_assinadas TO authenticated, service_role;
