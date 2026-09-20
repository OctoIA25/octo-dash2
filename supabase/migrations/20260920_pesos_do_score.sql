-- ============================================================
-- Os pesos do score do lead (P1.7).
--
-- A tabela é a do plano, validada pelo chefe em 20/09/2026, e fica EDITÁVEL
-- em Configurações — "sem mexer no código", como o plano pede.
--
-- POR QUE OS PESOS MORAM NO BANCO, e não no código: o plano aponta que no
-- Aether o critério do score é caixa-preta e ninguém consegue explicar por que
-- um lead tem 32 e outro 94. Peso que o gestor vê e edita é o oposto disso.
-- E porque calibrar um score é iterativo: o número certo só aparece depois de
-- olhar o resultado por algumas semanas.
--
-- AS FAIXAS DA TEMPERATURA vêm junto de propósito. O plano decidiu que a
-- temperatura passa a ser DERIVADA do score — hoje são dois campos separados
-- que podem se contradizer (no Aether, 94 aparece como Morno e 62 como
-- Quente). Guardar as faixas em outro lugar permitiria justamente essa
-- contradição voltar.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_score_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  /** Todo lead começa aqui. O plano: "todo lead começa em 50" (neutro). */
  ponto_de_partida int NOT NULL DEFAULT 50,

  peso_respondeu              int NOT NULL DEFAULT 5,
  peso_resposta_ate_10min     int NOT NULL DEFAULT 10,
  peso_resposta_ate_1h        int NOT NULL DEFAULT 5,
  peso_disse_o_que_procura    int NOT NULL DEFAULT 10,
  peso_renda_compativel       int NOT NULL DEFAULT 15,
  peso_renda_incompativel     int NOT NULL DEFAULT -10,
  peso_pediu_visita           int NOT NULL DEFAULT 25,
  peso_pediu_simulacao        int NOT NULL DEFAULT 10,
  /** Teto do bônus por origem. O peso de cada origem é 0..este valor. */
  peso_origem_maximo          int NOT NULL DEFAULT 10,
  peso_conversou_3_dias       int NOT NULL DEFAULT 5,
  peso_sem_resposta_7_dias    int NOT NULL DEFAULT -15,
  peso_so_pesquisando         int NOT NULL DEFAULT -10,

  /** Faixas da temperatura derivada. Plano: 0–39 Frio, 40–69 Morno, 70–100 Quente. */
  limite_morno  int NOT NULL DEFAULT 40,
  limite_quente int NOT NULL DEFAULT 70,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Peso fora de (-100, 100) não calibra nada: satura o score num sinal só, e
  -- o "por quê" deixa de explicar coisa alguma.
  CONSTRAINT tenant_score_config_pesos_ck CHECK (
    ponto_de_partida BETWEEN 0 AND 100
    AND peso_respondeu BETWEEN -100 AND 100
    AND peso_resposta_ate_10min BETWEEN -100 AND 100
    AND peso_resposta_ate_1h BETWEEN -100 AND 100
    AND peso_disse_o_que_procura BETWEEN -100 AND 100
    AND peso_renda_compativel BETWEEN -100 AND 100
    AND peso_renda_incompativel BETWEEN -100 AND 100
    AND peso_pediu_visita BETWEEN -100 AND 100
    AND peso_pediu_simulacao BETWEEN -100 AND 100
    AND peso_origem_maximo BETWEEN 0 AND 100
    AND peso_conversou_3_dias BETWEEN -100 AND 100
    AND peso_sem_resposta_7_dias BETWEEN -100 AND 100
    AND peso_so_pesquisando BETWEEN -100 AND 100
  ),

  -- Morno tem de vir antes de Quente, senão não existe faixa Morno e a
  -- temperatura pula de Frio para Quente sem ninguém entender.
  CONSTRAINT tenant_score_config_faixas_ck CHECK (
    limite_morno BETWEEN 1 AND 99
    AND limite_quente BETWEEN 2 AND 100
    AND limite_morno < limite_quente
  )
);

-- ------------------------------------------------------------
-- O pg_default_acl deste Postgres concede tudo a anon em toda relação nova de
-- public: sem o REVOKE, os pesos nasceriam graváveis pela chave do navegador.
-- ------------------------------------------------------------
REVOKE ALL ON public.tenant_score_config FROM anon, authenticated;
GRANT SELECT ON public.tenant_score_config TO authenticated;
GRANT INSERT, UPDATE ON public.tenant_score_config TO authenticated;
GRANT ALL ON public.tenant_score_config TO service_role;

ALTER TABLE public.tenant_score_config ENABLE ROW LEVEL SECURITY;

-- Qualquer membro LÊ: o corretor precisa poder ver por que o lead pontuou
-- aquilo, e o "por quê" é feito dos pesos.
CREATE POLICY tenant_score_config_select ON public.tenant_score_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

CREATE POLICY tenant_score_config_write ON public.tenant_score_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- O peso de cada origem, 0..peso_origem_maximo.
--
-- O plano: "Origem com boa conversão (peso por origem, 0 a +10)". Fica em
-- tabela própria porque as origens são cadastro (P0.4) e mudam sozinhas —
-- uma coluna por origem viraria migration a cada canal novo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_score_origem (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  /** A chave estável da origem, como o cadastro de origens do P0.4 a guarda. */
  origem text NOT NULL,
  peso int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, origem),
  CONSTRAINT tenant_score_origem_peso_ck CHECK (peso BETWEEN 0 AND 100)
);

REVOKE ALL ON public.tenant_score_origem FROM anon, authenticated;
GRANT SELECT ON public.tenant_score_origem TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenant_score_origem TO authenticated;
GRANT ALL ON public.tenant_score_origem TO service_role;

ALTER TABLE public.tenant_score_origem ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_score_origem_select ON public.tenant_score_origem
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

CREATE POLICY tenant_score_origem_write ON public.tenant_score_origem
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

COMMIT;
