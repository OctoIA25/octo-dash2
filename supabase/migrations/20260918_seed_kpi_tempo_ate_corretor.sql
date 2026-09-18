-- ============================================================
-- MIGRATION (dados): a segunda métrica de primeira interação.
-- Idempotente. Não altera estrutura.
--
-- Acompanha 20260918_view_primeira_interacao.sql, que separou "a LIA falou"
-- de "o corretor falou". O card que existia (`tempoMedioResposta`) passa a
-- dizer o que realmente mede e ganha um par.
--
-- POR QUE NÃO ESCREVE DESCRIÇÃO AQUI. O texto do (i) de uma métrica NATIVA
-- mora em código (`src/features/kpis/domain/kpiDictionary.ts`), junto do
-- catálogo de chaves. A definição de uma métrica nativa é decidida pela conta
-- que o servidor faz; se o texto morasse aqui, cada imobiliária teria a sua
-- cópia e nada impediria a descrição de dizer uma coisa enquanto o código
-- calcula outra — que é o defeito que este bloco do plano veio consertar.
--
-- A coluna `description` continua sendo do GESTOR: o que ele escrever em
-- Configurações ganha do dicionário, porque a tela é dele. Hoje ela está
-- vazia nas 14 métricas nativas dos 8 tenants, então todos veem o dicionário.
-- ============================================================

-- 1) O card que já existia passa a dizer o que mede. O NOME é configurável por
--    imobiliária (o gestor pode renomear), então ele mora no banco mesmo.
UPDATE public.dashboard_kpis
   SET name = 'Tempo até a LIA responder'
 WHERE metric_key = 'tempoMedioResposta'
   AND name = 'Tempo Médio de Resposta';   -- não sobrescreve quem já renomeou

-- 2) O par novo. is_system = false: o gestor pode ocultar.
INSERT INTO public.dashboard_kpis
  (tenant_id, name, description, category_id, unit, source, metric_key, is_system, is_featured, display_order)
SELECT te.id, 'Tempo até o corretor falar', '', 'operacao', 'count', 'crm',
       'tempoAteCorretor', false, false, 5
FROM public.tenants te
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk
   WHERE dk.tenant_id = te.id AND dk.metric_key = 'tempoAteCorretor'
);
