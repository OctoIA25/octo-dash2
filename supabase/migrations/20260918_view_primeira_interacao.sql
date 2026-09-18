-- Migration: view `primeira_interacao` — quando a LIA falou com o lead pela primeira vez
-- Data: 2026-09-18
-- Descrição: o card "Tempo Médio de Resposta" não mede resposta nenhuma.
--
-- A coluna que ele lê, `leads.first_response_at`, é gravada por
-- `setFirstResponseAtIfMissing` (src/features/leads/services/leadsService.ts:195),
-- chamada quando `isFirstResponse` é verdadeiro — e `isFirstResponse` é apenas
-- `status NOT IN ('Novos Leads','Novos Proprietários')` (:602). Ou seja: a
-- coluna registra o instante em que ALGUÉM ARRASTOU O CARD para fora da
-- primeira coluna do kanban. Não há relação com ter falado com o lead.
--
-- O que isso produz hoje na Lotus (medido em 18/09/2026):
--
--   leads com a coluna preenchida ...... 41 de 1.684 (2,4%)
--   média exibida no card .............. 18.605 min  (12,9 dias)
--   menor valor ........................ -5.871 min  (NEGATIVO)
--   maior valor ........................ 292.557 min (203 dias)
--   acima de 1 dia ..................... 28 dos 41
--
-- Um valor negativo é um lead importado cujo `created_at` veio do sistema de
-- origem; 203 dias é alguém limpando o kanban. O card anuncia isso como tempo
-- de resposta.
--
-- A fonte real é a primeira mensagem de SAÍDA no WhatsApp. Medido na mesma data:
--
--                       leads com contato   mediana
--   Lotus (30 dias) ...  264 de 320 (82%)   1,2 min
--   Lotus (7 dias) ....  135 de 153 (88%)   1,0 min
--   Japi  (30 dias) ...   88 de 340         0,3 min
--
-- A cobertura de 18,7% no total da base é lead antigo, anterior à integração do
-- WhatsApp; dentro da janela que a tela filtra, a métrica cobre 82–88%.
--
-- Três decisões embutidas:
--
-- 1. SAÍDA SEM AUTOR = LIA. De 15.513 mensagens de saída, apenas 14 têm
--    `sent_by_user_id`. A separação portanto é exata, não é palpite: sem autor
--    é a LIA (n8n), com autor é o corretor. Esta view cobre só o lado da LIA.
--    O lado do corretor mora em `lead_toques`, que tem RLS sem policy e não é
--    legível pelo PostgREST — decisão já documentada em
--    src/features/leads/services/toquesService.ts:4 ("Quem decide quem vê o
--    quê é o servidor"). Por isso ele é calculado no servidor, que usa
--    service_role, e NÃO entra aqui: uma view security_invoker tocando
--    `lead_toques` estouraria 42501 para todo usuário logado.
--
-- 2. MEDIANA, NÃO MÉDIA. A view entrega os minutos por lead e quem consome tira
--    a mediana. Na Lotus a média dos mesmos dados dá 2.432 min e a mediana dá
--    1,4 min: a média é dominada por uma cauda de leads recontatados semanas
--    depois. O plano do CEO já pede mediana.
--
-- 3. NEGATIVOS FORA. 5 leads foram contatados ANTES do próprio `created_at`
--    (importação que trouxe a data do sistema de origem). Todo consumidor hoje
--    já descarta negativo por conta própria; a regra sobe para cá para ninguém
--    precisar lembrar.
--
-- Uma linha por lead QUE FOI CONTATADO. Quem precisa da cobertura compara a
-- contagem daqui com o total de leads do período, que já lê de `leads`.

-- ORDEM DO DEPLOY: esta migration vai ANTES do código desta versão.
-- Sem a view, os consumidores perdem o tempo de primeira interação (mostram
-- "Sem dados"), não quebram.

CREATE OR REPLACE VIEW public.primeira_interacao
WITH (security_invoker = true) AS
SELECT
  l.tenant_id,
  l.id                                  AS lead_id,
  l.created_at                          AS lead_criado_em,
  min(m.wa_timestamp)                   AS primeiro_contato_em,
  (EXTRACT(EPOCH FROM (min(m.wa_timestamp) - l.created_at)) / 60)::numeric
                                        AS minutos_ate_primeiro_contato
FROM public.leads l
JOIN public.whatsapp_conversations c
  ON c.lead_id = l.id
 AND c.tenant_id = l.tenant_id          -- invariante verificada: 0 divergências
JOIN public.whatsapp_messages m
  ON m.conversation_id = c.id
WHERE m.direction = 'outbound'
  AND m.sent_by_user_id IS NULL         -- sem autor = LIA; com autor = corretor
  AND m.wa_timestamp IS NOT NULL
GROUP BY l.tenant_id, l.id, l.created_at
HAVING min(m.wa_timestamp) >= l.created_at;   -- decisão 3: negativos fora

COMMENT ON VIEW public.primeira_interacao IS
  'Fonte única do tempo até a LIA falar com o lead: primeira mensagem de saída '
  'sem autor no WhatsApp, em minutos desde a criação do lead. Uma linha por '
  'lead contatado, negativos já excluídos. Substitui leads.first_response_at, '
  'que na verdade marca a saída do card da primeira coluna do kanban. O lado '
  'do corretor sai de lead_toques, no servidor (RLS sem policy).';


-- ATENÇÃO AO GRANT ABAIXO. O `pg_default_acl` do schema `public` no Supabase
-- concede `arwdDxtm` a `anon` e `authenticated` em TODA relação nova — views
-- inclusive. Sem o REVOKE explícito, um `GRANT SELECT TO authenticated,
-- service_role` não restringe coisa alguma: a view já nasceu legível por
-- `anon`, que é a chave embarcada no bundle do browser. Medido no ambiente
-- local em 18/09/2026, com as três views deste plano nascendo `anon_le = t`.
-- `pg_dump` emite GRANT e nunca REVOKE, então isto também não aparece no dump.
REVOKE ALL ON public.primeira_interacao FROM anon, authenticated;
GRANT SELECT ON public.primeira_interacao TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- O outro lado: quando o CORRETOR falou com o lead.
--
-- Duas fontes, unidas porque nenhuma sozinha responde a pergunta:
--
--   1. saída no WhatsApp COM `sent_by_user_id` — 14 mensagens hoje, mas é o
--      registro exato de um corretor escrevendo pelo painel;
--   2. `lead_toques` — o toque de cadência que o próprio corretor registra
--      (ligação, whatsapp, visita), com autor em `executado_por`.
--
-- ESTA VIEW NÃO VAI PARA O BROWSER. `lead_toques` tem RLS sem policy e sem
-- GRANT: `authenticated` lendo daqui levaria 42501. A decisão de a tabela ser
-- server-only já está escrita em toquesService.ts:4 e é mantida — o GRANT
-- abaixo é só para `service_role`, que é quem o servidor Express usa.
--
-- COBERTURA HOJE: 9 toques na plataforma inteira, o primeiro de 17/09/2026
-- 21:29 — a cadência entrou no ar ontem. Não é uma métrica quebrada, é uma
-- métrica nova: mede desde que o instrumento existe e enche sozinha conforme
-- os corretores usam. Quem consome mostra "Sem dados" enquanto o período não
-- tiver toque, em vez de exibir uma mediana de 4 leads como se fosse a equipe.
--
-- `lead_source` = 'leads' apenas: um toque em `kenlo_leads` não tem par nesta
-- view, que nasce de `public.leads`. Hoje os 9 são 'leads'.
--
-- A junção é por TEXTO de propósito. `lead_toques.lead_id` é text; convertê-lo
-- para uuid faria a view inteira estourar no dia em que uma linha trouxesse um
-- id fora do formato. uuid→text nunca falha, o contrário sim.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.primeira_interacao_corretor
WITH (security_invoker = true) AS
WITH contatos AS (
  SELECT c.lead_id::text AS lead_id, c.tenant_id, m.wa_timestamp AS em
  FROM public.whatsapp_messages m
  JOIN public.whatsapp_conversations c ON c.id = m.conversation_id
  WHERE m.direction = 'outbound'
    AND m.sent_by_user_id IS NOT NULL
    AND m.wa_timestamp IS NOT NULL
    AND c.lead_id IS NOT NULL
  UNION ALL
  SELECT t.lead_id, t.tenant_id, t.executado_em
  FROM public.lead_toques t
  WHERE t.lead_source = 'leads'
    AND t.executado_em IS NOT NULL
)
SELECT
  l.tenant_id,
  l.id                                  AS lead_id,
  l.created_at                          AS lead_criado_em,
  min(ct.em)                            AS primeiro_contato_em,
  (EXTRACT(EPOCH FROM (min(ct.em) - l.created_at)) / 60)::numeric
                                        AS minutos_ate_primeiro_contato
FROM public.leads l
JOIN contatos ct
  ON ct.lead_id = l.id::text
 AND ct.tenant_id = l.tenant_id
GROUP BY l.tenant_id, l.id, l.created_at
HAVING min(ct.em) >= l.created_at;

COMMENT ON VIEW public.primeira_interacao_corretor IS
  'Tempo até o CORRETOR falar com o lead: primeira saída no WhatsApp com autor '
  'ou primeiro toque de cadência registrado, em minutos desde a criação do '
  'lead. Só service_role — nasce de lead_toques, que é server-only por decisão '
  '(RLS sem policy). Instrumento no ar desde 17/09/2026.';

REVOKE ALL ON public.primeira_interacao_corretor FROM anon, authenticated;
GRANT SELECT ON public.primeira_interacao_corretor TO service_role;
