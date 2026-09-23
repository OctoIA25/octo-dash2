-- ============================================================
-- Quem enviou cada mensagem do WhatsApp (F.1)
--
-- Hoje, abrindo uma conversa, não dá para saber se quem falou foi a LIA ou o
-- corretor. As duas saem do mesmo número, com a mesma cara.
--
-- MEDIDO EM PRODUÇÃO EM 22/09/2026, nas 16.401 mensagens enviadas:
--
--   com autor registrado (`sent_by_user_id`)      14   (0,1%)
--   com marca da LIA em `metadata.role`       14.242
--   sem marca nenhuma                          2.159
--
-- Duas coisas saltam daí:
--
-- 1. O ENVIO PELA DASH QUASE NÃO EXISTE. Catorze mensagens, todas entre 24/06
--    e 07/07. Quem conversa com o cliente é a LIA. A etiqueta, então, não é
--    "LIA × corretor" meio a meio: é quase toda LIA, e o valor dela está em
--    marcar a exceção.
--
-- 2. CORRIGIDO EM 23/09 — A LEITURA ACIMA ESTAVA ERRADA, e o erro foi meu.
--
--    Eu havia escrito "a LIA parou de marcar em 27/08", porque medi
--    `whatsapp_messages` SEM SEPARAR POR TENANT. Num sistema multi-tenant.
--
--    Separando: as 24.425 mensagens marcadas eram da **Imobiliária Japi**, que
--    foi DESLIGADA em 27/08 e não volta (confirmado pelo chefe em 23/09). A
--    LIA da **Lotus**, que é a casa viva, marcou **6 de 2.241** mensagens —
--    ou seja, nunca marcou.
--
--    Não houve regressão nenhuma. O que há é uma capacidade que a Lotus nunca
--    teve, e que esta coluna dá pela primeira vez.
--
-- POR QUE UMA COLUNA, SE `metadata.role` JÁ DIZIA
-- Porque `metadata` é um saco de coisas de quem escreveu, sem contrato: mudou
-- do outro lado e ninguém aqui soube. Uma coluna com CHECK é um acordo que o
-- banco cobra. E a tela precisa filtrar e contar por isso — em jsonb, sem
-- índice, em 28 mil linhas.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A coluna
--
-- `sent_by_user_id` JÁ EXISTE e guarda QUEM é o corretor. Não duplico isso
-- aqui: `enviado_por` diz a CATEGORIA, `sent_by_user_id` diz a pessoa. O plano
-- escreve o valor como `corretor:<id>`, um texto composto — que obrigaria a
-- fatiar string em toda consulta, e a manter duas verdades sobre o mesmo id.
-- ------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS enviado_por text;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_enviado_por_ck') THEN
    ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_enviado_por_ck
      CHECK (
        enviado_por IS NULL
        OR (direction = 'outbound' AND enviado_por IN ('lia', 'corretor', 'disparo'))
      );
  END IF;
  -- Corretor sem pessoa é etiqueta que não diz nada — e foi assim que a marca
  -- antiga virou inútil.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_corretor_tem_pessoa_ck') THEN
    ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_corretor_tem_pessoa_ck
      CHECK (enviado_por IS DISTINCT FROM 'corretor' OR sent_by_user_id IS NOT NULL);
  END IF;
END
$do$;

COMMENT ON COLUMN public.whatsapp_messages.enviado_por IS
  'Quem falou numa mensagem enviada: lia | corretor | disparo. NULO = não registrado, e a tela diz isso — nunca chuta corretor. Quem é o corretor está em sent_by_user_id.';

-- A tela conta "quantas a LIA mandou nesta conversa" e filtra por autor.
CREATE INDEX IF NOT EXISTS whatsapp_messages_enviado_por_idx
  ON public.whatsapp_messages (conversation_id, enviado_por)
  WHERE enviado_por IS NOT NULL;

-- ------------------------------------------------------------
-- 2. O backfill — só o que o dado sustenta
--
-- Fica DE FORA de propósito: marcar as 2.159 sem marca como "lia" porque "é
-- quase tudo LIA mesmo". Seria inventar autoria para uma conversa com cliente,
-- e a tela passaria a afirmar com certeza o que ninguém registrou. Elas ficam
-- NULAS, e a bolha diz "não registrado".
--
-- E `portal_template:` / `followup_template:` também não viram `disparo`: um
-- template de saudação que a LIA manda ao receber um lead é a LIA falando, não
-- um disparo em massa. Sem dado que separe os dois, não separo.
-- ------------------------------------------------------------
UPDATE public.whatsapp_messages
   SET enviado_por = 'corretor'
 WHERE enviado_por IS NULL
   AND direction = 'outbound'
   AND sent_by_user_id IS NOT NULL;

UPDATE public.whatsapp_messages
   SET enviado_por = 'lia'
 WHERE enviado_por IS NULL
   AND direction = 'outbound'
   AND sent_by_user_id IS NULL
   AND metadata ->> 'role' = 'assistant';

-- ------------------------------------------------------------
-- 3. "Assumir conversa" — a LIA cala a boca neste lead
--
-- A LIA roda em servidor próprio: a Dash não intercepta mensagem dela. Então
-- isto é um RECADO, não um bloqueio — mesma divisão do `corretor_bloqueado`:
-- a Dash decide e registra, a LIA consulta e obedece.
--
-- Guardado em `leads.permissions`? Não: é estado de atendimento, não permissão.
-- Tabela própria, uma linha por lead, para a LIA poder perguntar barato.
-- ------------------------------------------------------------
-- O nome NÃO leva o prefixo `lia_`: nesta casa, `lia_*` é tabela DA LIA,
-- fechada ao navegador, e há um teste que cobra isso
-- (`lia_tabelas_fechadas.test.sql`). Esta aqui é da Dash — ela escreve e a
-- tela lê. Nasceu como `lia_conversa_assumida` e o teste acusou.
CREATE TABLE IF NOT EXISTS public.conversa_assumida (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  /** Quem assumiu. Serve para a tela dizer "Ana assumiu às 14h02". */
  assumido_por uuid NOT NULL,
  assumido_em timestamptz NOT NULL DEFAULT now(),
  /** Nulo = ainda assumido. Preenchido = devolveram a conversa para a LIA. */
  devolvido_em timestamptz,
  PRIMARY KEY (tenant_id, lead_id)
);

CREATE INDEX IF NOT EXISTS conversa_assumida_ativa_idx
  ON public.conversa_assumida (tenant_id, lead_id) WHERE devolvido_em IS NULL;

/**
 * A pergunta que a LIA faz antes de falar.
 *
 * `true` = pode falar. Lead sem linha nenhuma aqui pode — o normal é a LIA
 * atender, e exigir cadastro prévio faria toda conversa nova começar muda.
 */
CREATE OR REPLACE FUNCTION public.lia_pode_falar(p_tenant_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.conversa_assumida a
     WHERE a.tenant_id = p_tenant_id AND a.lead_id = p_lead_id
       AND a.devolvido_em IS NULL
  );
$function$;

/** Assume (ou devolve) a conversa. Uma linha por lead, reaproveitada. */
CREATE OR REPLACE FUNCTION public.lia_assumir_conversa(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_assumir boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid := auth.uid();
BEGIN
  IF v_eu IS NULL THEN RETURN NULL; END IF;
  -- Assumir conversa é coisa de quem atende a casa. A checagem de "este lead é
  -- meu" mora no servidor, que já sabe recortar lead por corretor; aqui basta
  -- barrar quem é de outra imobiliária.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_memberships tm
     WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_eu
  ) AND NOT public.is_platform_owner() THEN
    RETURN NULL;
  END IF;

  IF p_assumir THEN
    INSERT INTO conversa_assumida (tenant_id, lead_id, assumido_por)
    VALUES (p_tenant_id, p_lead_id, v_eu)
    ON CONFLICT (tenant_id, lead_id) DO UPDATE
      SET assumido_por = v_eu, assumido_em = now(), devolvido_em = NULL;
  ELSE
    UPDATE conversa_assumida SET devolvido_em = now()
     WHERE tenant_id = p_tenant_id AND lead_id = p_lead_id AND devolvido_em IS NULL;
  END IF;

  RETURN jsonb_build_object('assumida', p_assumir, 'por', v_eu);
END;
$function$;

-- ------------------------------------------------------------
-- 4. Quem enxerga o quê
-- ------------------------------------------------------------
REVOKE ALL ON public.conversa_assumida FROM anon, authenticated;
GRANT SELECT ON public.conversa_assumida TO authenticated;
GRANT ALL ON public.conversa_assumida TO service_role;

ALTER TABLE public.conversa_assumida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lia_assumida_membro_le ON public.conversa_assumida;
CREATE POLICY lia_assumida_membro_le ON public.conversa_assumida
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.lia_pode_falar(uuid, uuid)',
    'public.lia_assumir_conversa(uuid, uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

COMMENT ON TABLE public.conversa_assumida IS
  'Leads cuja conversa um humano assumiu. A LIA consulta lia_pode_falar() antes de responder — a Dash não intercepta mensagem dela.';

NOTIFY pgrst, 'reload schema';

COMMIT;
