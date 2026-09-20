-- ============================================================
-- Pré-requisitos por etapa, como CHAVES configuráveis (P1.6).
--
-- O plano pede que o quão rígido é o processo seja um interruptor em
-- Configurações, não uma regra fixa no código: "Cada chave liga ou desliga
-- sem mexer no código."
--
-- AS FONTES DE CADA CHAVE, e por que não são as óbvias
--
-- O plano nomeia "exigir data e imóvel para Visita agendada" e "exigir valor
-- para Proposta criada". Os campos que parecem servir — `leads.visit_date` e
-- `leads.property_value` — estão vazios em 1.678 de 1.678 leads da Lotus e
-- NENHUMA tela do sistema os escreve (conferido em 20/09/2026). `visit_date`
-- é declarada morta por um teste-portão do próprio projeto
-- (src/test/colunaDeVisita.guard.test.ts).
--
-- Exigir um campo que ninguém consegue preencher tornaria a etapa
-- inalcançável. Cada chave aponta para a fonte que o sistema DE FATO enche:
--
--   visita     -> agenda_eventos (tipo visita_agendada, com data e imovel_ref)
--                 O modal do lead já grava isso, com data e hora.
--   proposta   -> proposals (value, property_reference, payment_method)
--                 A tela de Proposta já edita os três.
--   venda      -> documento no bucket lead-documentos + leads.comments
--                 O modal já anexa arquivo e já tem o campo de observação.
--   assinatura -> proposals.signed_at
--
-- TUDO DESLIGADO POR PADRÃO. Uma chave que começasse ligada passaria a avisar
-- em quase todo arrastar, sem ninguém ter pedido. Quem liga é o gestor, e a
-- tela de Configurações mostra ANTES quantos leads reprovariam hoje.
--
-- E O QUE ACONTECE QUANDO FALTA: decidido pelo chefe em 20/09/2026 — avisa,
-- DEIXA PASSAR e registra. Não bloqueia. Travar o dia da equipe foi o que fez
-- a Lotus desligar a distribuição em 14/09.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_etapa_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  /** Visita Agendada exige um compromisso na agenda, com data e imóvel. */
  exigir_visita_agendada boolean NOT NULL DEFAULT false,

  /** As etapas de proposta exigem valor, código do imóvel e forma de pagamento. */
  exigir_dados_da_proposta boolean NOT NULL DEFAULT false,

  /** Proposta Assinada exige documento anexado e um relato mínimo. */
  exigir_proposta_assinada boolean NOT NULL DEFAULT false,

  /** Quantos caracteres de relato contam como "relato mínimo". */
  relato_minimo_caracteres int NOT NULL DEFAULT 20
    CONSTRAINT tenant_etapa_config_relato_ck CHECK (relato_minimo_caracteres BETWEEN 0 AND 2000),

  /** Ao chegar em Proposta Assinada, carimbar a hora da assinatura. */
  registrar_hora_da_assinatura boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Quem enxerga o quê
--
-- O pg_default_acl deste Postgres concede tudo a anon em toda relação nova de
-- public: sem o REVOKE, as chaves nasceriam legíveis E GRAVÁVEIS pela chave
-- que vai no bundle do navegador.
-- ------------------------------------------------------------
REVOKE ALL ON public.tenant_etapa_config FROM anon, authenticated;
GRANT SELECT ON public.tenant_etapa_config TO authenticated;
GRANT ALL ON public.tenant_etapa_config TO service_role;

ALTER TABLE public.tenant_etapa_config ENABLE ROW LEVEL SECURITY;

-- Qualquer membro LÊ: o corretor precisa saber o que a etapa vai exigir dele
-- ANTES de arrastar o card, senão o aviso chega como surpresa.
CREATE POLICY tenant_etapa_config_select ON public.tenant_etapa_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Só admin e dono da plataforma MEXEM. Quem define o quão rígido é o processo
-- da imobiliária é quem responde por ele.
CREATE POLICY tenant_etapa_config_write ON public.tenant_etapa_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

GRANT INSERT, UPDATE ON public.tenant_etapa_config TO authenticated;

COMMIT;
