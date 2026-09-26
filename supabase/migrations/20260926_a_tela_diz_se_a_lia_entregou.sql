-- ============================================================
-- A tela dizia "respondida" mesmo quando o lead não recebeu — 26/09
--
-- A equipe da LIA apontou, e está certa: eles respondem SEMPRE 200 e dizem o
-- desfecho NO CORPO — 'aceita', 'ja-resolvida' ou 'desconhecida'.
--
-- A Dash marcava a pergunta como respondida no instante do clique e nunca
-- mais olhava. Uma pergunta que a LIA devolvesse como 'desconhecida' ficava
-- verde na tela, e o gestor seguia achando que o cliente tinha sido atendido.
--
-- Nós já GRAVÁVAMOS `response_body` em `webhook_events`. O dado estava lá e
-- nenhuma tela o lia — o mesmo padrão das 17 permissões inertes desta semana.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.plantao_fila(
  p_tenant_id uuid,
  p_aba       text DEFAULT 'aguardando',
  p_limite    int  DEFAULT 200,
  p_dias      int  DEFAULT 90
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
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_aba text := COALESCE(NULLIF(btrim(p_aba), ''), 'aguardando');
  v_cfg record;
  v_contadores jsonb;
  v_linhas jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- Mesma checagem de get_tenant_members: SECURITY DEFINER passa por cima da RLS,
  -- então a pertinência é conferida à mão. Sem isto, qualquer usuário logado leria
  -- o plantão — com telefone de cliente — de qualquer imobiliária.
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT espera_maxima_minutos, destino, plantonista_id
    INTO v_cfg
    FROM tenant_plantao_config WHERE tenant_id = p_tenant_id;

  -- Contadores das TRÊS abas sempre, seja qual for a aba pedida: as abas mostram
  -- o número mesmo quando não são a aba aberta.
  SELECT jsonb_build_object(
           'aguardando',  count(*) FILTER (WHERE p.status = 'pendente'),
           'respondidas', count(*) FILTER (WHERE p.status = 'respondida'),
           'expiradas',   count(*) FILTER (WHERE p.status = 'expirada'),
           'na_janela',   count(*),
           -- Quantas ainda não viraram conhecimento. É o tamanho da dívida de
           -- aprendizado, e o motivo da aba "Mais perguntadas" existir.
           'por_aprender', count(*) FILTER (
             WHERE p.status = 'respondida' AND p.kb_documento_id IS NULL
           ),
           'sem_empreendimento', count(*) FILTER (WHERE p.empreendimento_id IS NULL)
         )
    INTO v_contadores
    FROM lia_perguntas_corretor p
   WHERE p.tenant_id = p_tenant_id AND p.criado_em >= v_desde;

  -- "Aguardando" inclui as expiradas: uma pergunta que estourou o prazo continua
  -- sem resposta e continua sendo problema do gestor. Escondê-la faria a fila
  -- parecer limpa exatamente quando não está.
  SELECT COALESCE(jsonb_agg(linha ORDER BY ordem), '[]'::jsonb)
    INTO v_linhas
    FROM (
      SELECT
        CASE WHEN v_aba = 'aguardando' THEN p.criado_em ELSE COALESCE(p.respondida_em, p.criado_em) END AS ordem,
        jsonb_build_object(
          'id', p.id,
          'pergunta', p.pergunta,
          'contexto', p.contexto,
          'status', p.status,
          'criado_em', p.criado_em,
          'respondida_em', p.respondida_em,
          'resposta', p.resposta_corretor,
          'nudges', p.nudge_count,
          'lead_id', p.lead_id,
          'lead_nome', l.name,
          'corretor_id', p.corretor_id,
          'corretor_nome', COALESCE(up.full_name, NULLIF(btrim(p.corretor_id), '')),
          'corretor_cadastrado', up.id IS NOT NULL,
          'corretor_email', up.email,
          'empreendimento_id', p.empreendimento_id,
          'empreendimento_nome', lan.nome,
          'kb_documento_id', p.kb_documento_id,
          'aprovada_para_base', p.aprovada_para_base,
          'aprovada_em', p.aprovada_em,
          -- 331 das 1.540 respostas começam com "[resolvida fora do canal]": o
          -- corretor falou direto com o cliente e escreveu só o aviso. Não é
          -- resposta à pergunta, e salvar isso na base ensinaria a LIA a dizer
          -- "resolvida fora do canal" ao próximo cliente.
          'fora_do_canal', p.resposta_corretor LIKE '[resolvida fora do canal]%',
          /*
           * O QUE A LIA FEZ COM A RESPOSTA — 26/09/2026.
           *
           * Respondida na Dash não quer dizer entregue ao lead. A equipe da
           * LIA pediu isto e tem razão: eles respondem SEMPRE 200 e dizem o
           * desfecho no corpo. Sem mostrar, a tela diz "respondida" para uma
           * pergunta que a LIA devolveu como 'desconhecida', e o lead não
           * recebeu nada.
           *
           *   null          nunca foi respondida pela Dash (veio do WhatsApp)
           *   na_fila       enfileirada, ainda não entregue
           *   entregue      a LIA aceitou e leva ao lead
           *   ja_resolvida  a LIA já tinha resolvido; o lead não recebe este texto
           *   nao_achou     a LIA não conhece esta pergunta -- ninguém recebeu
           *   falhou        não chegou à LIA
           */
          'entrega', CASE
            WHEN w.id IS NULL                 THEN NULL
            WHEN w.status = 'pending'         THEN 'na_fila'
            WHEN w.status <> 'delivered'      THEN 'falhou'
            WHEN w.response_body ILIKE '%ja-resolvida%' THEN 'ja_resolvida'
            WHEN w.response_body ILIKE '%desconhecida%' THEN 'nao_achou'
            ELSE 'entregue'
          END,
          'entrega_detalhe', w.last_error
        ) AS linha
      FROM lia_perguntas_corretor p
      LEFT JOIN leads l ON l.id = p.lead_id
      -- O aviso que a Dash enfileirou para esta pergunta, se houve. Só existe
      -- quando a resposta saiu DAQUI: a do WhatsApp não passa pelo nosso
      -- emissor, e por isso `entrega` fica nula nela.
      LEFT JOIN webhook_events w
        ON w.event_type = 'plantao.respondida'
       AND w.source_table = 'lia_perguntas_corretor'
       AND w.source_id = p.id
      -- SEM CAST, de proposito. A guarda por regex que estava aqui NAO
      -- protegia: o Postgres nao garante avaliar as condicoes de um JOIN em
      -- ordem, e o cast rodava antes do regex. Comparar texto com texto nunca
      -- estoura, e da o mesmo resultado para um uuid de verdade.
      LEFT JOIN user_profiles up ON up.id::text = lower(btrim(p.corretor_id))
      LEFT JOIN lancamentos lan ON lan.id = p.empreendimento_id
      WHERE p.tenant_id = p_tenant_id
        AND p.criado_em >= v_desde
        AND CASE v_aba
              WHEN 'aguardando'  THEN p.status IN ('pendente', 'expirada')
              WHEN 'respondidas' THEN p.status = 'respondida'
              ELSE true
            END
      ORDER BY 1 DESC
      LIMIT v_limite
    ) s;

  RETURN jsonb_build_object(
    'aba', v_aba,
    'espera_maxima_minutos', COALESCE(v_cfg.espera_maxima_minutos, 30),
    'destino', COALESCE(v_cfg.destino, 'corretor_do_lead'),
    'plantonista_id', v_cfg.plantonista_id,
    'configurado', v_cfg.espera_maxima_minutos IS NOT NULL,
    'dias', LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730),
    'limite', v_limite,
    'contadores', v_contadores,
    'linhas', v_linhas
  );
END;
$function$;

COMMIT;
