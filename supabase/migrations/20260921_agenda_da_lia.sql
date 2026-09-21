-- Migration: Agenda da LIA (P2.5)
-- Data: 2026-09-21
--
-- "Me chama amanhã às 16h" vira um retorno agendado que não se perde.
--
-- NÃO NASCE UMA TABELA NOVA, E ISSO É DECISÃO, NÃO ATALHO
-- O plano manda criar `lia_agendamentos`. Medido antes de escrever: já existe
-- `lia_followups`, VIVA — 3.116 linhas, disparos agendados para amanhã — com 15
-- das 17 colunas que o plano pede (`scheduled_at`, `motivo`, `status`,
-- `attempt_number`, `sent_at`, `channel`, `template_name`, `idempotency_key`,
-- `cancelled_at`, `cancelled_reason`…), disparador rodando e rota de escrita
-- idempotente (`POST /api/v1/lia/cadencias`).
--
-- Duas tabelas agendando mensagem para o MESMO cliente dariam dois
-- disparadores, e o cliente receberia a mensagem duas vezes. Decidido pelo
-- chefe em 21/09/2026: estender a que existe. Entram só as duas colunas que
-- faltam de verdade.
--
-- O QUE O `pedido_por` MUDA, E POR QUE ELE NÃO É SÓ UM RÓTULO
-- Hoje 2.361 dos 2.419 cancelamentos têm motivo `lead_returned`: quando o lead
-- volta a falar, o follow-up pendente é cancelado. Isso está certo para a
-- cadência automática — a LIA ia cutucar quem sumiu, e ele apareceu.
--
-- Mas é FATAL para o retorno agendado: "me chama amanhã às 16h" É o lead
-- falando. Sem distinguir os dois, o próprio pedido cancelaria o retorno, e o
-- cliente nunca receberia a ligação que pediu. `pedido_por = 'lead'` é o que
-- protege essa linha do cancelamento por retorno — e a regra está escrita para
-- quem mexe na LIA em server/leadToques/PROMPT_LIA_AGENDA.md.
--
-- ORDEM DO DEPLOY: banco antes do servidor. Colunas aditivas com default.
-- Rollback: dropar as duas colunas e a tabela de configuração.

-- ------------------------------------------------------------
-- 1. Quem pediu o retorno
-- ------------------------------------------------------------
-- Default 'lia': tudo o que existe hoje é cadência automática, e a LIA que
-- escreve hoje não manda esta coluna. Sem o default, todo INSERT dela quebraria.
ALTER TABLE public.lia_followups
  ADD COLUMN IF NOT EXISTS pedido_por text NOT NULL DEFAULT 'lia';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lia_followups_pedido_por_ck'
  ) THEN
    ALTER TABLE public.lia_followups
      ADD CONSTRAINT lia_followups_pedido_por_ck
      CHECK (pedido_por IN ('lead', 'lia', 'corretor'));
  END IF;
END $$;

COMMENT ON COLUMN public.lia_followups.pedido_por IS
  'lead = o cliente pediu o retorno (NÃO cancelar por lead_returned); '
  'lia = cadência automática; corretor = agendado à mão na Dash.';

-- O plano pede a coluna `erro` separada. Hoje a falha se esconde em
-- `cancelled_reason` misturada com cancelamento legítimo: das 84 linhas
-- `expired`, 36 dizem por que não saíram e **48 não dizem nada**. Campo próprio
-- para o disparador escrever a falha, sem disputar espaço com "o lead voltou".
ALTER TABLE public.lia_followups
  ADD COLUMN IF NOT EXISTS erro text;

-- A tela lê por tenant + status + horário. 3.116 linhas hoje, e cresce sozinha.
CREATE INDEX IF NOT EXISTS lia_followups_agenda_idx
  ON public.lia_followups (tenant_id, status, scheduled_at);

-- ------------------------------------------------------------
-- 2. O horário de não incomodar
-- ------------------------------------------------------------
-- O plano pede "horário de não incomodar (ex.: 20h–9h) e dias".
--
-- Guardado pelo COMPLEMENTO — a janela em que PODE falar — e não pelo silêncio.
-- Mesma forma de `horario_funcionamento` e de `JANELA_PADRAO` em
-- server/distribuicao/janela.js, que já sabe atravessar fuso e virada de dia.
-- Guardar "20h–9h" obrigaria toda conta a tratar uma janela que cruza a
-- meia-noite, e é a mesma informação escrita ao contrário. A tela mostra ao
-- gestor a frase do plano: "não incomodar antes das 9h e depois das 20h".
--
-- Configuração PRÓPRIA, e não o horário da distribuição: decidido em
-- 21/09/2026. O `horario_funcionamento` da Lotus está gravado como `{}` — vazio.
-- Reaproveitá-lo deixaria a Lotus sem proteção nenhuma, e a LIA poderia mandar
-- mensagem às 3h da manhã.
CREATE TABLE IF NOT EXISTS public.tenant_agenda_lia_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  pode_falar_das time NOT NULL DEFAULT '09:00',
  pode_falar_ate time NOT NULL DEFAULT '20:00',

  -- 0 = domingo … 6 = sábado. Todos os dias por padrão: mandar a mensagem que o
  -- cliente pediu num domingo à tarde é normal; o que o plano quer evitar é
  -- horário, não dia. Bloquear um dia por padrão engoliria retorno em silêncio.
  dias_permitidos smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_agenda_lia_config_janela_ck CHECK (pode_falar_ate > pode_falar_das),
  CONSTRAINT tenant_agenda_lia_config_dias_ck
    CHECK (cardinality(dias_permitidos) BETWEEN 1 AND 7
           AND dias_permitidos <@ '{0,1,2,3,4,5,6}'::smallint[])
);

-- O pg_default_acl do Supabase concede tudo a anon em toda tabela nova.
REVOKE ALL ON public.tenant_agenda_lia_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_agenda_lia_config TO authenticated;
GRANT ALL ON public.tenant_agenda_lia_config TO service_role;

ALTER TABLE public.tenant_agenda_lia_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_agenda_lia_config_select ON public.tenant_agenda_lia_config;
CREATE POLICY tenant_agenda_lia_config_select ON public.tenant_agenda_lia_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS tenant_agenda_lia_config_write ON public.tenant_agenda_lia_config;
CREATE POLICY tenant_agenda_lia_config_write ON public.tenant_agenda_lia_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 3. A agenda na tela
-- ------------------------------------------------------------
-- Por que função e não SELECT: `lia_followups` foi revogada de `authenticated`
-- em 18/09 porque `motivo` e `message_sent` carregam texto de conversa com o
-- cliente. A tela não lê a tabela — lê esta função.
--
-- É visão de GESTÃO, do tenant inteiro, como o Plantão do P2.4. O que o corretor
-- vê do SEU lead continua vindo de `GET /api/v1/leads/:leadId/cadencia`, que já
-- tem a sua própria regra de quem enxerga o quê (server/liaCadencia). Uma
-- pergunta diferente, um portão diferente — não duas versões do mesmo portão.
--
-- As cinco abas são as do plano. "Hoje" e "Atrasados" se sobrepõem de
-- propósito: um retorno de hoje de manhã que não saiu está nas duas, e é
-- exatamente onde o gestor precisa tropeçar nele.
CREATE OR REPLACE FUNCTION public.agenda_lia_fila(
  p_tenant_id uuid,
  p_aba       text DEFAULT 'hoje',
  p_limite    int  DEFAULT 200,
  p_dias      int  DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_dias int := LEAST(GREATEST(COALESCE(p_dias, 30), 1), 365);
  v_desde timestamptz := now() - (v_dias || ' days')::interval;
  v_aba text := COALESCE(NULLIF(btrim(p_aba), ''), 'hoje');
  v_cfg record;
  v_contadores jsonb;
  v_linhas jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- SECURITY DEFINER passa por cima da RLS: a pertinência é conferida à mão.
  -- Sem isto, qualquer usuário logado leria a agenda — com telefone e texto de
  -- conversa — de qualquer imobiliária.
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT pode_falar_das, pode_falar_ate, dias_permitidos
    INTO v_cfg
    FROM tenant_agenda_lia_config WHERE tenant_id = p_tenant_id;

  -- "Hoje" é o dia em BRASÍLIA, não em UTC. Às 21h de Brasília o UTC já virou,
  -- e a agenda de hoje apareceria vazia para quem ainda está trabalhando.
  SELECT jsonb_build_object(
           'hoje', count(*) FILTER (
             WHERE (f.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
                 = (now() AT TIME ZONE 'America/Sao_Paulo')::date
               AND f.status IN ('pending', 'sent')
           ),
           'a_cumprir', count(*) FILTER (WHERE f.status = 'pending' AND f.scheduled_at > now()),
           'pedidos_pelo_lead', count(*) FILTER (WHERE f.pedido_por = 'lead'),
           'atrasados', count(*) FILTER (WHERE f.status = 'pending' AND f.scheduled_at <= now()),
           -- `expired` é o que NÃO SAIU: nas 84 linhas de produção, nenhuma tem
           -- `sent_at`. Metade não diz o motivo, e a tela mostra isso como está.
           'nao_sairam', count(*) FILTER (WHERE f.status = 'expired'),
           'na_janela', count(*)
         )
    INTO v_contadores
    FROM lia_followups f
   WHERE f.tenant_id = p_tenant_id AND f.scheduled_at >= v_desde;

  SELECT COALESCE(jsonb_agg(linha ORDER BY quando), '[]'::jsonb)
    INTO v_linhas
    FROM (
      SELECT
        f.scheduled_at AS quando,
        jsonb_build_object(
          'id', f.id,
          'lead_id', f.lead_id,
          'lead_nome', l.name,
          'quando', f.scheduled_at,
          'motivo', f.motivo,
          'tag', f.tag,
          'status', f.status,
          'pedido_por', f.pedido_por,
          'tentativas', f.attempt_number,
          'enviado_em', f.sent_at,
          'canal', f.channel,
          'template', f.template_name,
          'erro', f.erro,
          -- O disparador antigo escrevia a falha aqui. Enquanto houver linha
          -- velha, a tela precisa das duas para não mostrar "não saiu" mudo.
          'cancelado_por', f.cancelled_reason,
          'corretor_id', l.assigned_agent_id,
          'corretor_nome', l.assigned_agent_name
        ) AS linha
      FROM lia_followups f
      LEFT JOIN leads l ON l.id = f.lead_id
      WHERE f.tenant_id = p_tenant_id
        AND f.scheduled_at >= v_desde
        AND CASE v_aba
              WHEN 'hoje' THEN
                (f.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
                  = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                AND f.status IN ('pending', 'sent')
              WHEN 'a_cumprir' THEN f.status = 'pending' AND f.scheduled_at > now()
              WHEN 'pedidos_pelo_lead' THEN f.pedido_por = 'lead'
              WHEN 'atrasados' THEN f.status = 'pending' AND f.scheduled_at <= now()
              WHEN 'nao_sairam' THEN f.status = 'expired'
              ELSE true
            END
      ORDER BY 1 DESC
      LIMIT v_limite
    ) s;

  RETURN jsonb_build_object(
    'aba', v_aba,
    'dias', v_dias,
    'pode_falar_das', COALESCE(v_cfg.pode_falar_das, '09:00'::time),
    'pode_falar_ate', COALESCE(v_cfg.pode_falar_ate, '20:00'::time),
    'dias_permitidos', COALESCE(v_cfg.dias_permitidos, '{0,1,2,3,4,5,6}'::smallint[]),
    'configurado', v_cfg.pode_falar_das IS NOT NULL,
    'contadores', v_contadores,
    'linhas', v_linhas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agenda_lia_fila(uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_lia_fila(uuid, text, int, int) TO authenticated, service_role;
