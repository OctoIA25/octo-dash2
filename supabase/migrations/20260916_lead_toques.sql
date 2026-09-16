-- ============================================================
-- Cadência do corretor — os 10 quadrados do modal do lead
--
-- CONTEXTO
-- A gestão quer responder "qual toque converte mais" e "em qual cadência o
-- corretor desiste". A LIA já registra os toques dela em `lia_followups`, mas o
-- toque HUMANO (ligação, WhatsApp manual, e-mail, visita) não existia em lugar
-- nenhum: medido em 16/set/2026, `whatsapp_messages.sent_by_user_id` teve 14
-- mensagens de corretor na história inteira e 0 nos últimos 30 dias, e
-- `lead_events` não tem tipo para contato. Esta tabela é esse registro.
--
-- POR QUE NÃO EM lia_followups
-- Aquela tabela é escrita pelo app da LIA e modela AGENDAMENTO (pending → sent
-- → cancelled/expired). Um toque humano já nasce executado e tem resultado. Não
-- há duas verdades aqui: o toque humano não está em lugar nenhum hoje. A tela
-- junta as duas fontes na leitura (LIA só conta quando a mensagem de fato saiu).
--
-- O NÚMERO DO TOQUE NÃO É COLUNA
-- É a posição do toque na ordem cronológica do lead (LIA + corretor), calculada
-- na leitura. Um contador gravado erraria no primeiro toque da LIA reportado
-- fora de ordem — `lia_followups.attempt_number` recomeça a cada assunto e é o
-- exemplo vivo disso.
--
-- POR QUE NÃO FOREIGN KEY em lead_id / executado_por
-- Mesmo desenho de lead_events: lead_id é TEXT + lead_source porque `leads` e
-- `kenlo_leads` têm ids independentes. Sem FK para o usuário porque apagar um
-- corretor não pode apagar o histórico que alimenta a métrica.
--
-- ORDEM DE DEPLOY
--   1. Esta migration.
--   2. Deploy (servidor + front saem juntos no proxy-production).
-- Inverter quebra só a seção nova: a rota devolve 500 e o card mostra o erro.
-- ============================================================

SET lock_timeout = '10s';

-- ------------------------------------------------------------
-- BLOCO 1 — tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_toques (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id             text NOT NULL,
  lead_source         text NOT NULL CHECK (lead_source IN ('leads', 'kenlo_leads')),
  canal               text NOT NULL CHECK (canal IN ('whatsapp', 'ligacao', 'email', 'presencial')),
  resultado           text NOT NULL CHECK (resultado IN ('respondeu', 'nao_respondeu', 'numero_errado', 'nao_contatar')),
  observacao          text CHECK (observacao IS NULL OR char_length(observacao) <= 1000),
  proximo_toque_em    timestamptz,
  -- Quando o toque aconteceu. Hoje é sempre o instante do clique (a tela não
  -- aceita data passada); a coluna é separada de created_at para isso poder
  -- mudar sem migrar dado.
  executado_em        timestamptz NOT NULL DEFAULT now(),
  executado_por       uuid NOT NULL,
  -- Nome no momento do toque (user_profiles.full_name ou e-mail), como
  -- lead_events.ator_nome: o quadrado mostra quem fez sem join por linha.
  executado_por_nome  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- BLOCO 2 — índice
-- A leitura é sempre "toques deste lead, em ordem".
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lead_toques_lead
  ON public.lead_toques (tenant_id, lead_id, executado_em);

-- ------------------------------------------------------------
-- BLOCO 3 — segurança
--
-- RLS ligada e SEM policy, como lia_followups / lead_events: tabela 100%
-- server-side. Quem pode ver e registrar é decidido em
-- server/leadToques/index.js (dono do lead ou gestão) — a RLS de `leads` neste
-- banco está frouxa demais para uma policy nova se apoiar nela.
-- O REVOKE também impede forjar toque pelo PostgREST: sem GRANT, nem um
-- authenticated com JWT válido insere ou apaga linha. GRANT explícito ao
-- service_role porque projeto novo do Supabase não dá mais privilégio
-- automático em tabela nova.
-- ------------------------------------------------------------
ALTER TABLE public.lead_toques ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_toques FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.lead_toques TO service_role;

COMMENT ON TABLE public.lead_toques IS
  'Toques do corretor com o lead (1 linha por toque): canal, resultado, próximo toque, quem e quando. Junto com lia_followups (enviadas) forma os 10 quadrados de cadência do modal do lead. Escrita e leitura só via servidor (service_role) — RLS ligada sem policy de propósito.';
COMMENT ON COLUMN public.lead_toques.lead_id IS
  'Id do lead como texto, na tabela indicada por lead_source. Sem FK: o join é feito na leitura.';
COMMENT ON COLUMN public.lead_toques.executado_por IS
  'auth.users.id de quem registrou. Sem FK: apagar o usuário não pode apagar a métrica.';

-- ------------------------------------------------------------
-- BLOCO 4 — prova
-- Sem INSERT de mentira: a linha apareceria como toque real no card.
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'idx_lead_toques_lead'),
         'índice por lead não existe';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lead_toques'::regclass),
         'RLS não está habilitada';
  ASSERT NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
            WHERE table_schema = 'public' AND table_name = 'lead_toques'
              AND grantee IN ('anon', 'authenticated')
         ), 'anon/authenticated ainda têm grant na tabela';
  ASSERT has_table_privilege('service_role', 'public.lead_toques', 'INSERT'),
         'service_role sem INSERT';

  RAISE NOTICE 'OK — lead_toques pronta';
END $$;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TABLE IF EXISTS public.lead_toques;
