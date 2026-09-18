-- ============================================================
-- MIGRATION (dados): a segunda métrica de primeira interação + o dicionário
-- das duas. Idempotente. Não altera estrutura.
--
-- Acompanha 20260918_view_primeira_interacao.sql, que separou "a LIA falou"
-- de "o corretor falou". O card que existia (`tempoMedioResposta`) passa a
-- dizer o que realmente mede e ganha um par.
--
-- A descrição não é decoração: é o texto do (i) que o plano pede em cada
-- contador, e é onde fica escrito de onde o número sai. Um card que anuncia
-- minutos sem dizer de qual evento até qual evento é como o antigo "Tempo
-- Médio de Resposta", que media card arrastado no kanban.
-- ============================================================

-- 1) O card que já existia passa a dizer o que mede.
UPDATE public.dashboard_kpis
   SET name = 'Tempo até a LIA responder',
       description = 'Mediana do tempo entre o lead entrar na base e a LIA '
                  || 'enviar a primeira mensagem no WhatsApp. Conta só os '
                  || 'leads que receberam mensagem no período; sem nenhum, o '
                  || 'card mostra "Sem dados" em vez de zero.'
 WHERE metric_key = 'tempoMedioResposta';

-- 2) A taxa de atendimento sai da mesma fonte, então descreve a mesma coisa.
UPDATE public.dashboard_kpis
   SET description = 'Percentual dos leads do período que a LIA chegou a '
                  || 'contatar pelo WhatsApp. Antes contava lead cujo card '
                  || 'saiu da primeira coluna do kanban, que é outra coisa.'
 WHERE metric_key = 'taxaAtendimento';

-- 3) O par novo. is_system = false: o gestor pode ocultar.
INSERT INTO public.dashboard_kpis
  (tenant_id, name, description, category_id, unit, source, metric_key, is_system, is_featured, display_order)
SELECT te.id,
       'Tempo até o corretor falar',
       'Mediana do tempo entre o lead entrar na base e o corretor falar com '
       || 'ele — primeira mensagem enviada pelo painel ou primeiro toque de '
       || 'cadência registrado. A cadência entrou no ar em 17/09/2026, então '
       || 'este número começa raso e enche conforme a equipe registra os '
       || 'toques. Período sem toque mostra "Sem dados".',
       'operacao', 'count', 'crm', 'tempoAteCorretor', false, false, 5
FROM public.tenants te
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk
   WHERE dk.tenant_id = te.id AND dk.metric_key = 'tempoAteCorretor'
);
