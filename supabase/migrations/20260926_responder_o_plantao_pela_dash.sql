-- ============================================================
-- Responder uma pergunta do plantão PELA DASH — 26/09
--
-- A equipe da LIA pediu o evento `plantao.respondida`. Fui construir o
-- emissor e descobri que ele não tinha fonte: em todo o repositório,
-- `resposta_corretor` é SÓ LIDA, nunca escrita. As RPCs do plantão eram
-- `plantao_fila` (ler), `plantao_regua` (configurar) e
-- `plantao_salvar_na_base` (aprovar para a KB).
--
-- Ou seja: o gestor via a pergunta na tela e não podia responder. Quem
-- respondia era o corretor no WhatsApp, e é por isso que a LIA pediu
-- `origem: "dash"` e disse que só essa importa — a outra ela já captura.
--
-- Um gatilho de emissão, hoje, nunca dispararia. Então o que falta primeiro
-- é a AÇÃO, e é isto.
--
-- POR QUE O EVENTO SAI DAQUI DENTRO
--
-- Na mesma transação da resposta. Se saísse de fora, uma falha entre gravar e
-- enfileirar deixaria a pergunta respondida na Dash e o lead sem resposta
-- nenhuma — e ninguém saberia, porque a tela mostraria "respondida".
--
-- A fila é a mesma do `lead.created` (`webhook_events`), então herda
-- assinatura, retentativa e recorte por tenant.
--
-- QUEM PODE RESPONDER
--
-- Qualquer membro da imobiliária, como em `plantao_salvar_na_base`. A
-- pergunta foi feita a um corretor; responder por ele é ajudar, não invadir.
-- Aprovar para a BASE é que continua sendo outro ato, com outra RPC.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.plantao_responder(
  p_pergunta_id text,
  p_resposta    text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_p        record;
  v_resposta text := btrim(COALESCE(p_resposta, ''));
  v_nome     text;
  v_agora    timestamptz := now();
BEGIN
  SELECT id, tenant_id, lead_id, lead_phone, pergunta, resposta_corretor,
         empreendimento_id, contexto, criado_em, status
    INTO v_p
    FROM lia_perguntas_corretor
   WHERE id = p_pergunta_id;

  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'pergunta_nao_encontrada');
  END IF;

  IF v_caller IS NULL
     OR (NOT public.is_platform_owner()
         AND NOT EXISTS (
           SELECT 1 FROM tenant_memberships tm
           WHERE tm.user_id = v_caller AND tm.tenant_id = v_p.tenant_id
         ))
  THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  END IF;

  IF v_resposta = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'resposta_vazia');
  END IF;

  -- JÁ RESPONDIDA NÃO É ERRO, MAS TAMBÉM NÃO RESPONDE DE NOVO.
  --
  -- Dois gestores abrindo a mesma fila é o caso comum, não o raro. Sem esta
  -- guarda o lead receberia duas respostas — e a segunda sobrescreveria a
  -- primeira na tela, apagando o que a pessoa de fato mandou.
  IF v_p.resposta_corretor IS NOT NULL AND btrim(v_p.resposta_corretor) <> '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_respondida',
                              'resposta', v_p.resposta_corretor);
  END IF;

  SELECT COALESCE(NULLIF(btrim(up.full_name), ''), up.email)
    INTO v_nome FROM user_profiles up WHERE up.id = v_caller;

  UPDATE lia_perguntas_corretor
     SET resposta_corretor = v_resposta,
         respondida_em     = v_agora,
         status            = 'respondida'
   WHERE id = p_pergunta_id;

  /*
   * O AVISO À LIA, NA MESMA TRANSAÇÃO.
   *
   * O formato é o que a equipe deles especificou em 26/09, campo por campo.
   * `origem: 'dash'` é o que separa esta resposta da que o corretor dá pelo
   * WhatsApp — sem isso a LIA responderia ao lead duas vezes.
   *
   * `codigo_imovel`: `contexto` é TEXTO livre, não jsonb — a LIA escreve ali
   * o que couber. Então mandamos o contexto inteiro e deixamos que eles o
   * leiam: inventar um parser do texto deles aqui seria adivinhar, e a LIA já
   * tem o código no lado dela. O campo vai nulo quando não há contexto.
   */
  INSERT INTO public.webhook_events (tenant_id, event_type, source_table, source_id, payload)
  VALUES (
    v_p.tenant_id,
    'plantao.respondida',
    'lia_perguntas_corretor',
    v_p.id::text,
    jsonb_build_object(
      'id',                   v_p.id::text,
      'tenant_id',            v_p.tenant_id::text,
      'lead_id',              v_p.lead_id,
      'lead_phone',           v_p.lead_phone,
      'pergunta',             v_p.pergunta,
      'resposta',             v_resposta,
      'empreendimento_id',    v_p.empreendimento_id,
      'codigo_imovel',        NULL,
      'contexto',             NULLIF(btrim(COALESCE(v_p.contexto, '')), ''),
      'respondida_por',       v_caller::text,
      'respondida_por_nome',  v_nome,
      'pergunta_em',          v_p.criado_em,
      'respondida_em',        v_agora,
      'origem',               'dash'
    )
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'respondida_em', v_agora, 'por', v_nome);
END;
$function$;

REVOKE ALL ON FUNCTION public.plantao_responder(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_responder(text, text) TO authenticated;

COMMENT ON FUNCTION public.plantao_responder(text, text) IS
  'Responde uma pergunta do plantao PELA DASH e enfileira plantao.respondida (origem: dash) na mesma transacao. Ja respondida devolve ok:false/ja_respondida -- dois gestores na mesma fila e o caso comum.';

COMMIT;
