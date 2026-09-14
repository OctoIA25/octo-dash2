-- Migration: índice (tenant_id, source_crm) em kenlo_leads e índice parcial
-- dos leads "novo + não atendido" em bolsao
-- Data: 2026-09-14
--
-- Problema 1: após ciclos de sync o provider do Contact2Sale
-- (server/contact2sale/provider.js, buildCursorPatch) conta os leads do tenant:
--   count exact WHERE tenant_id = ? AND source_crm = 'contact2sale'
-- pg_stat_statements: 112 chamadas, 5,4s de média. EXPLAIN ANALYZE no maior
-- tenant: 9,4s — Index Scan em idx_kenlo_leads_tenant_id + Filter source_crm,
-- 71.689 linhas, 8.733 buffers lidos do disco. kenlo_leads tem 85,4k linhas,
-- 412 MB (raw_data em TOAST) e 15 índices, nenhum com source_crm. O count
-- desse tenant casa 84% da tabela: lia o heap quase inteiro.
-- Por que este índice: com (tenant_id, source_crm) o count vira Index Only Scan
-- (visibility map 99,5% all-visible) e não toca o heap. Só 6 combinações de
-- chave → deduplicação do btree, ~1,5 MB (igual a
-- idx_kenlo_leads_tenant_is_exclusive). Custo de escrita: +1 inserção de btree
-- por INSERT; tenant_id/source_crm não mudam, então UPDATE HOT segue HOT.
--
-- Problema 2: o pg_cron roda public.expire_bolsao_leads() a cada minuto
-- (5.231 chamadas, 1,28s de média desde 10/set). O loop da função filtra
--   WHERE b.status = 'novo' AND b.atendido = false
-- e isso é Seq Scan em bolsao: descarta ~80,8k linhas para devolver as poucas
-- dezenas que casam (37 hoje), todo minuto (seq_tup_read ~439M).
-- Por que este índice: parcial com o MESMO predicado da função. O planner
-- normaliza os dois lados igual — o plano mostra
-- (NOT atendido) AND ((status)::text = 'novo'::text) — e prova a implicação.
-- Se a função mudar o filtro (IS NOT TRUE, IN (...)), o índice deixa de servir.
-- A chave não filtra nada no loop (o predicado já filtra); tenant_id é a coluna
-- do join com tenant_bolsao_config e a primeira de qualquer leitura por tenant.
-- Tamanho: uma folha (~16 kB). Custo de escrita: só entram linhas novo + não
-- atendido; atendido passa a bloquear HOT, mas status e corretor_responsavel já
-- são indexados (hoje só 254 de 2.436 UPDATEs em bolsao são HOT).
-- NÃO atende (de propósito) as consultas do PostgREST com
-- (atendido = $1 OR atendido IS NULL) nem status = $1 AND tenant_id = $2 sem
-- atendido: o predicado não as implica.
--
-- COMO APLICAR:
-- 1) No SQL editor, cada statement num run SEPARADO — o arquivo inteiro num run
--    vira transação e CONCURRENTLY falha com ERROR 25001.
-- 2) Build cancelado no meio deixa índice INVALID — e com IF NOT EXISTS a
--    re-execução PULA a criação achando que existe. Antes de reaplicar, checar:
--      SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--    e, se listar algo daqui, rodar sozinho: DROP INDEX CONCURRENTLY <nome>;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kenlo_leads_tenant_source_crm
  ON public.kenlo_leads (tenant_id, source_crm);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bolsao_novo_nao_atendido
  ON public.bolsao (tenant_id)
  WHERE status = 'novo' AND atendido = false;

COMMENT ON INDEX public.idx_kenlo_leads_tenant_source_crm IS
  'Contagem de leads do Contact2Sale (provider.js buildCursorPatch): WHERE tenant_id AND source_crm, via Index Only Scan. 2026-09-14.';

COMMENT ON INDEX public.idx_bolsao_novo_nao_atendido IS
  'Loop do expire_bolsao_leads() (pg_cron a cada minuto): predicado idêntico ao WHERE da função — não alterar um sem o outro. 2026-09-14.';

-- Como verificar depois:
-- 1) Contagem C2S → esperado "Index Only Scan using idx_kenlo_leads_tenant_source_crm"
--    com Heap Fetches perto de 0:
--      EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM public.kenlo_leads
--       WHERE tenant_id = '<tenant_id>' AND source_crm = 'contact2sale';
-- 2) Loop da função → esperado Index Scan (ou Bitmap) "using
--    idx_bolsao_novo_nao_atendido on bolsao b" no lugar do Seq Scan. O Hash Join
--    com Seq Scan em leads pode continuar: o planner ainda estima ~7,5k linhas porque
--    trata status e atendido como independentes.
--      EXPLAIN (ANALYZE, BUFFERS) SELECT b.id, c.horario_funcionamento, l.status
--        FROM public.bolsao b
--        LEFT JOIN public.tenant_bolsao_config c ON c.tenant_id = b.tenant_id
--        LEFT JOIN public.leads l ON l.id = b.source_lead_id
--       WHERE b.status = 'novo' AND b.atendido = false
--         AND b.tenant_id IS NOT NULL AND COALESCE(c.bolsao_enabled, true) = true;
-- 3) Uso real (plano genérico do PostgREST e plano do plpgsql): idx_scan subindo.
--      SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--       WHERE indexrelname IN ('idx_kenlo_leads_tenant_source_crm', 'idx_bolsao_novo_nao_atendido');
