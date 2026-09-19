-- ============================================================
-- O extrato da distribuição (P1.1).
--
-- Decidido em 19/09/2026: a Lia continua distribuindo e o Octo responde "de
-- quem é este lead". Com a decisão de um lado e a gravação do outro, sem
-- extrato não há como auditar nenhuma das duas pontas — nem provar que a
-- regra respondeu o que devia, nem que a Lia seguiu a resposta.
--
-- Cada linha é UM ACONTECIMENTO, nunca um estado: a tabela só cresce. É o que
-- permite responder "por que este lead foi para este corretor" meses depois,
-- e é por isso que `motivo` é obrigatório.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.distribuicao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- O lead pode ainda não existir quando a Lia consulta — ela pergunta antes
  -- de gravar. Por isso é nullable, e `lead_ref` guarda o que ela mandou.
  lead_id uuid,
  lead_ref text,

  evento text NOT NULL,
  corretor_id uuid,
  /** O que a regra respondeu: captador_do_imovel, roleta_em_ordem, etc. */
  motivo text NOT NULL,
  /** 'terceiros' | 'lancamento' | 'indefinido' */
  tipo text,
  /** O prazo de atendimento já calculado pela janela do expediente. */
  prazo_ate timestamptz,
  /** Quem perguntou: 'lia' (API key) ou 'dashboard' (sessão de usuário). */
  origem text NOT NULL DEFAULT 'lia',
  detalhes jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT distribuicao_eventos_evento_ck CHECK (evento IN (
    'consultado',   -- a Lia perguntou e o Octo respondeu
    'enviado',      -- a Lia atribuiu ao corretor
    'atendido',     -- mensagem ao lead ou atividade agendada
    'expirou',      -- passou do prazo sem atendimento
    'roleta',       -- foi para o próximo da fila
    'bolsao',       -- foi para o bolsão
    'manual'        -- alguém atribuiu na mão
  )),
  CONSTRAINT distribuicao_eventos_origem_ck CHECK (origem IN ('lia', 'dashboard', 'sistema'))
);

-- O painel ao vivo (P1.3) lê os últimos acontecimentos da imobiliária.
CREATE INDEX IF NOT EXISTS distribuicao_eventos_tenant_idx
  ON public.distribuicao_eventos (tenant_id, created_at DESC);

-- "Por que este lead foi para este corretor" é a pergunta mais frequente.
CREATE INDEX IF NOT EXISTS distribuicao_eventos_lead_idx
  ON public.distribuicao_eventos (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- ------------------------------------------------------------
-- Quem enxerga o quê
--
-- O pg_default_acl deste Postgres concede tudo a anon em toda relação nova de
-- public: sem o REVOKE, o extrato de distribuição nasceria legível — e
-- gravável — pela chave que vai no bundle do navegador.
-- ------------------------------------------------------------
REVOKE ALL ON public.distribuicao_eventos FROM anon, authenticated;
GRANT SELECT ON public.distribuicao_eventos TO authenticated;
GRANT ALL ON public.distribuicao_eventos TO service_role;

ALTER TABLE public.distribuicao_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer membro LÊ o extrato da própria imobiliária: o corretor precisa
-- poder ver por que um lead saiu dele.
CREATE POLICY distribuicao_eventos_select ON public.distribuicao_eventos
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- NINGUÉM escreve pelo navegador. Extrato que o usuário pode escrever não é
-- extrato. Quem grava é o servidor, com a chave de serviço.

COMMIT;
