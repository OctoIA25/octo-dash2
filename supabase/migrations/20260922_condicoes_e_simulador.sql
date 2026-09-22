-- ============================================================
-- Tabela de condição + simulador de fluxo de pagamento (P2.2)
--
-- O plano abre com um aviso, e ele manda nesta migration:
--
--   "Antes de começar: pedir ao Erick a tabela de condições da Santa Ângela
--    para usar como modelo. NÃO INVENTAR REGRA DE CONSTRUTORA."
--
-- Então o que nasce aqui é o LUGAR das regras, não as regras. Nenhuma linha de
-- condição é semeada. Enquanto o Erick não passar a tabela da Santa Ângela, o
-- simulador abre dizendo que não há condição cadastrada e qual falta — em vez
-- de simular com número inventado, que é o jeito mais caro de errar: sai em
-- PDF, com o logo da casa, na mão do cliente.
--
-- POR QUE O MOTOR DE CÁLCULO NÃO ESTÁ AQUI
-- Ele é TypeScript (`src/features/simulador/fluxo.ts`), não plpgsql. O
-- simulador recalcula a cada tecla digitada: uma ida ao banco por tecla é
-- lenta e, offline, é uma tela que trava. E o mesmo módulo serve à tela, ao
-- PDF e, se precisar, ao servidor — uma fonte para a conta, que é a regra do
-- chefe aplicada a cálculo em vez de a dado.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A tabela de condição
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.condicoes_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  /**
   * A condição é DO empreendimento, ou é o padrão DA construtora.
   *
   * O plano escreve "empreendimento_id (ou construtora_id como padrão)". As
   * duas colunas existem, e o CHECK obriga exatamente uma: uma linha com as
   * duas seria ambígua na hora de escolher, e a escolha aconteceria em
   * silêncio.
   */
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  construtora_id uuid REFERENCES public.construtoras(id) ON DELETE CASCADE,
  CONSTRAINT condicao_pertence_a_um CHECK (
    (lancamento_id IS NOT NULL) <> (construtora_id IS NOT NULL)
  ),

  /** Como a equipe chama: "Tabela set/26". */
  nome text NOT NULL,

  vigente_de date NOT NULL,
  /** Nulo = vigente até segunda ordem. */
  vigente_ate date,
  CONSTRAINT vigencia_coerente CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),

  -- ---- os limites que a construtora impõe --------------------
  /** Entrada mínima, em % do valor da unidade. */
  entrada_min_pct numeric(5, 2) CHECK (entrada_min_pct IS NULL
    OR (entrada_min_pct >= 0 AND entrada_min_pct <= 100)),
  /** Valor mínimo do ato, em reais. */
  ato_min_valor numeric(14, 2) CHECK (ato_min_valor IS NULL OR ato_min_valor >= 0),

  mensais_max_qtd smallint CHECK (mensais_max_qtd IS NULL OR mensais_max_qtd > 0),
  /**
   * 'fixas' | 'decrescentes'.
   *
   * O motor só calcula 'fixas'. 'decrescentes' fica aceito aqui porque a
   * tabela da construtora pode dizer isso — e o motor, nesse caso, RECUSA a
   * simulação em vez de chutar a regra de decréscimo. Ver o comentário em
   * `fluxo.ts`: há mais de uma convenção de mercado para "decrescentes", e
   * escolher uma sem a tabela é exatamente o que o plano proíbe.
   */
  mensais_tipo text NOT NULL DEFAULT 'fixas'
    CHECK (mensais_tipo IN ('fixas', 'decrescentes')),

  permite_balao boolean NOT NULL DEFAULT false,
  balao_max_qtd smallint CHECK (balao_max_qtd IS NULL OR balao_max_qtd >= 0),
  /**
   * Em quais meses do fluxo o balão pode cair — por exemplo {6,12,18,24}, os
   * aniversários do contrato. Vazio com `permite_balao` ligado quer dizer
   * "em qualquer mês".
   */
  balao_meses_permitidos smallint[],

  /** Teto do que pode ser financiado em banco na entrega, em % do valor. */
  financiamento_pct_max numeric(5, 2) CHECK (financiamento_pct_max IS NULL
    OR (financiamento_pct_max >= 0 AND financiamento_pct_max <= 100)),

  /** Nome do índice, não o valor dele: "INCC", "IGP-M". */
  indice_obra text,
  indice_pos_chaves text,
  /** Juros ao mês do pós-chaves, em %. */
  juros_pos_chaves_am numeric(6, 3) CHECK (juros_pos_chaves_am IS NULL
    OR juros_pos_chaves_am >= 0),

  desconto_a_vista_pct numeric(5, 2) CHECK (desconto_a_vista_pct IS NULL
    OR (desconto_a_vista_pct >= 0 AND desconto_a_vista_pct <= 100)),

  observacoes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/**
 * Duas tabelas vigentes ao mesmo tempo para o mesmo empreendimento é a falha
 * silenciosa deste item: o simulador escolheria uma das duas sem avisar, e
 * metade das propostas sairia pela tabela velha.
 *
 * O banco recusa a sobreposição. `daterange` com fim aberto cobre o "vigente
 * até segunda ordem", e o `WHERE` separa os dois donos possíveis — duas
 * construtoras podem ter tabelas no mesmo período, o que não é conflito.
 */
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE INDEX IF NOT EXISTS condicoes_lancamento_idx
  ON public.condicoes_pagamento (tenant_id, lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS condicoes_construtora_idx
  ON public.condicoes_pagamento (tenant_id, construtora_id) WHERE construtora_id IS NOT NULL;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'condicoes_sem_sobreposicao_lancamento') THEN
    ALTER TABLE public.condicoes_pagamento ADD CONSTRAINT condicoes_sem_sobreposicao_lancamento
      EXCLUDE USING gist (
        lancamento_id WITH =,
        daterange(vigente_de, vigente_ate, '[]') WITH &&
      ) WHERE (lancamento_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'condicoes_sem_sobreposicao_construtora') THEN
    ALTER TABLE public.condicoes_pagamento ADD CONSTRAINT condicoes_sem_sobreposicao_construtora
      EXCLUDE USING gist (
        construtora_id WITH =,
        daterange(vigente_de, vigente_ate, '[]') WITH &&
      ) WHERE (construtora_id IS NOT NULL);
  END IF;
END
$do$;

-- ------------------------------------------------------------
-- 2. A simulação salva
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  /** Opcional: dá para simular antes de existir lead. */
  lead_id uuid,
  corretor_id uuid NOT NULL,

  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  tipologia_id uuid REFERENCES public.tipologias(id) ON DELETE SET NULL,
  /**
   * `ON DELETE SET NULL`, e não CASCADE: apagar a tabela de condição não pode
   * apagar o histórico do que já foi apresentado a um cliente.
   */
  condicao_id uuid REFERENCES public.condicoes_pagamento(id) ON DELETE SET NULL,

  /** O que o corretor digitou. */
  entradas jsonb NOT NULL,
  /**
   * O que o motor devolveu — FOTOGRAFIA, não referência.
   *
   * Uma simulação salva é o que foi mostrado ao cliente naquele dia. Se ela
   * fosse recalculada a partir da condição atual, mudar a tabela mudaria
   * retroativamente o que "foi prometido" — e ninguém saberia. Por isso o
   * resultado é gravado inteiro, com o nome e a vigência da condição usada.
   */
  resultado jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulacoes_lead_idx
  ON public.simulacoes (tenant_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS simulacoes_corretor_idx
  ON public.simulacoes (tenant_id, corretor_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Quem enxerga o quê
--
-- Ao contrário das tipologias, NADA aqui é público. A tabela de condição é
-- regra comercial da construtora, e a simulação tem a renda declarada de uma
-- família — dado pessoal sensível que não tem por que sair do tenant.
-- ------------------------------------------------------------
REVOKE ALL ON public.condicoes_pagamento FROM anon, authenticated;
REVOKE ALL ON public.simulacoes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condicoes_pagamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulacoes TO authenticated;
GRANT ALL ON public.condicoes_pagamento TO service_role;
GRANT ALL ON public.simulacoes TO service_role;

ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS condicoes_membro_le ON public.condicoes_pagamento;
CREATE POLICY condicoes_membro_le ON public.condicoes_pagamento
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

/**
 * Quem EDITA a tabela de condição é quem administra, não qualquer corretor.
 *
 * Um corretor que possa baixar a entrada mínima de 20% para 5% fecha negócio
 * que a construtora não aceita — e o erro só aparece na assinatura. Simular,
 * qualquer um simula; mudar a regra, não.
 */
DROP POLICY IF EXISTS condicoes_admin_escreve ON public.condicoes_pagamento;
CREATE POLICY condicoes_admin_escreve ON public.condicoes_pagamento
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

/** A simulação é de quem fez; quem administra vê as da casa. */
DROP POLICY IF EXISTS simulacoes_minhas_ou_admin ON public.simulacoes;
CREATE POLICY simulacoes_minhas_ou_admin ON public.simulacoes
  FOR SELECT TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND (corretor_id = auth.uid() OR public.is_tenant_admin_or_owner(tenant_id)))
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS simulacoes_corretor_grava ON public.simulacoes;
CREATE POLICY simulacoes_corretor_grava ON public.simulacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    corretor_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 4. Qual condição vale hoje
--
-- A do empreendimento manda; sem ela, cai na padrão da construtora. Função e
-- não view: a data é parâmetro, porque reabrir uma simulação de ontem tem de
-- achar a tabela que valia ontem.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condicao_vigente(
  p_lancamento_id uuid,
  p_data date DEFAULT CURRENT_DATE
)
RETURNS public.condicoes_pagamento
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  -- COALESCE, e não só o DEFAULT: quem chama pelo PostgREST manda os
  -- parâmetros por nome, e mandar `p_data: null` NÃO usa o DEFAULT — usa NULL.
  -- Aí `vigente_de <= NULL` é nulo, nenhuma linha casa, e a tela diz "não há
  -- tabela cadastrada" com a tabela cadastrada na frente. Custou uma ida ao
  -- navegador para aparecer.
  SELECT c.* FROM public.condicoes_pagamento c
   WHERE c.vigente_de <= COALESCE(p_data, CURRENT_DATE)
     AND (c.vigente_ate IS NULL OR c.vigente_ate >= COALESCE(p_data, CURRENT_DATE))
     AND (
       c.lancamento_id = p_lancamento_id
       OR c.construtora_id = (SELECT l.construtora_id FROM public.lancamentos l
                               WHERE l.id = p_lancamento_id)
     )
   -- A do empreendimento primeiro: `construtora_id` nulo ordena antes.
   ORDER BY c.lancamento_id NULLS LAST
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.condicao_vigente(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condicao_vigente(uuid, date) TO authenticated, service_role;

COMMENT ON TABLE public.condicoes_pagamento IS
  'Regras de pagamento por empreendimento (ou padrão da construtora). O motor de cálculo é src/features/simulador/fluxo.ts; aqui ficam só os limites. Nenhuma linha é semeada: as regras vêm da tabela da construtora.';
COMMENT ON TABLE public.simulacoes IS
  'Simulação salva no lead. `resultado` é fotografia do que foi mostrado ao cliente, não referência à condição atual.';

NOTIFY pgrst, 'reload schema';

COMMIT;
