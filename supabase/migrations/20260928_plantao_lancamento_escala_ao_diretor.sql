-- ============================================================
-- Plantão: a pergunta de LANÇAMENTO espera o gestor; passou do prazo, sobe
-- para o diretor.
--
-- Pedido do chefe em 28/09/2026: "Pergunta de Lançamentos a Lia deve esperar
-- o Gestor (Fernanda) responder, se ela demorar mais de 24h, escala pra mim
-- (diretor)".
--
-- Medido em produção no mesmo dia (Lotus): 60 das 117 perguntas do plantão são
-- de empreendimento; as 2 de lançamento pendentes estavam com a Fernanda havia
-- ~8 dias, com `escalated_at` e `nudge_count` nunca usados.
--
-- A DIVISÃO É A DO P1.1 — a LIA distribui, o Octo responde. Esta migration
-- guarda QUEM e QUANDO (config) e responde QUAIS subiram (função). Quem manda
-- a pergunta à gestora e avisa o diretor no WhatsApp é a LIA
-- (server/leadToques/PROMPT_LIA_PLANTAO_LANCAMENTOS.md).
--
-- ESCALAR NÃO TIRA DA GESTORA. O dono (`corretor_id`) continua o mesmo: o
-- diretor é AVISADO. Trocar o dono faria a pergunta sumir da fila da gestora
-- (plantao_fila mostra ao líder só o que é dele e da equipe), e quem estava
-- mais perto da resposta deixaria de vê-la.
-- ============================================================

BEGIN;

ALTER TABLE public.tenant_plantao_config
  -- Quem responde as perguntas de empreendimento. Vazio = vale o `destino`.
  ADD COLUMN IF NOT EXISTS lancamento_responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Depois de quantas horas sem resposta o diretor é avisado.
  ADD COLUMN IF NOT EXISTS lancamento_escala_horas int NOT NULL DEFAULT 24
    CHECK (lancamento_escala_horas BETWEEN 1 AND 720),
  -- Quem é avisado. Vazio = não escala.
  ADD COLUMN IF NOT EXISTS lancamento_escala_para_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- O que a LIA deve escalar AGORA.
--
-- Só LISTA — não marca. A LIA avisa o diretor e SÓ ENTÃO grava
-- `escalated_at`: se a função marcasse e o envio falhasse, o aviso se perderia
-- com a pergunta já dada como escalada. Chamar de novo antes de marcar devolve
-- a mesma linha, e é isso que se quer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plantao_lancamentos_a_escalar(p_tenant_id uuid)
RETURNS TABLE (
  pergunta_id text,
  pergunta text,
  criado_em timestamptz,
  horas_esperando numeric,
  lead_id uuid,
  lead_nome text,
  empreendimento text,
  responsavel_id text,
  escalar_para_id uuid,
  escalar_para_nome text,
  -- Os números cadastrados em Gestão de Equipe. Vazio = a LIA não tem como
  -- avisar, e a tela de configuração diz isso ao gestor.
  escalar_para_whatsapp jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id,
         p.pergunta,
         p.criado_em,
         round(extract(epoch FROM (now() - p.criado_em)) / 3600, 1),
         p.lead_id,
         l.name,
         lan.nome,
         p.corretor_id,
         c.lancamento_escala_para_id,
         COALESCE(u.raw_user_meta_data->>'name', u.email),
         COALESCE(tm.permissions->'whatsapp_phones', '[]'::jsonb)
    FROM public.tenant_plantao_config c
    JOIN public.lia_perguntas_corretor p ON p.tenant_id = c.tenant_id
    LEFT JOIN public.leads l ON l.id = p.lead_id
    LEFT JOIN public.lancamentos lan ON lan.id = p.empreendimento_id
    LEFT JOIN auth.users u ON u.id = c.lancamento_escala_para_id
    LEFT JOIN public.tenant_memberships tm
           ON tm.user_id = c.lancamento_escala_para_id AND tm.tenant_id = c.tenant_id
   WHERE c.tenant_id = p_tenant_id
     AND c.lancamento_escala_para_id IS NOT NULL
     AND p.status = 'pendente'
     AND p.empreendimento_id IS NOT NULL
     AND p.escalated_at IS NULL
     AND p.criado_em < now() - make_interval(hours => c.lancamento_escala_horas)
   ORDER BY p.criado_em;
$$;

-- Só o servidor da LIA (chave de serviço). O REVOKE de PUBLIC é o que vale:
-- anon e authenticated herdam dele.
REVOKE ALL ON FUNCTION public.plantao_lancamentos_a_escalar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plantao_lancamentos_a_escalar(uuid) TO service_role;

-- ------------------------------------------------------------
-- A fila do plantão passa a dizer QUANDO a pergunta subiu ao diretor.
--
-- Partiu da versão EM PRODUÇÃO em 28/09 (md5 8ec31603…), não da última do
-- repositório: o banco local tinha outra. A única mudança é 'escalada_em'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plantao_fila(p_tenant_id uuid, p_aba text DEFAULT 'aguardando'::text, p_limite integer DEFAULT 200, p_dias integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_aba text := COALESCE(NULLIF(btrim(p_aba), ''), 'aguardando');
  v_cfg record;
  v_ve_tudo boolean;
  v_lider boolean;
  v_contadores jsonb;
  v_linhas jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  v_ve_tudo := v_caller IS NULL
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
        AND tm.role IN ('owner', 'admin')
    );

  v_lider := NOT v_ve_tudo AND EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
      AND tm.role = 'team_leader'
  );

  SELECT espera_maxima_minutos, destino, plantonista_id
    INTO v_cfg
    FROM tenant_plantao_config WHERE tenant_id = p_tenant_id;

  WITH visivel AS (
    SELECT p.*
      FROM lia_perguntas_corretor p
      LEFT JOIN user_profiles upx ON upx.id::text = lower(btrim(p.corretor_id))
      LEFT JOIN tenant_memberships dono
             ON dono.user_id = upx.id AND dono.tenant_id = p.tenant_id
      LEFT JOIN teams dt ON dt.id = dono.team_id
     WHERE p.tenant_id = p_tenant_id
       AND p.criado_em >= v_desde
       AND (
         v_ve_tudo
         OR upx.id = v_caller
         -- Sem dono identificável: o gestor VÊ, para a pergunta não se perder.
         OR (v_lider AND upx.id IS NULL)
         OR (v_lider AND upx.id IS NOT NULL
             AND (dono.leader_user_id = v_caller
                  OR dt.leader_user_ids @> ARRAY[v_caller]))
       )
  ),
  ocultas AS (
    SELECT count(*) AS n
      FROM lia_perguntas_corretor p
      LEFT JOIN user_profiles upx ON upx.id::text = lower(btrim(p.corretor_id))
     WHERE p.tenant_id = p_tenant_id
       AND p.criado_em >= v_desde
       AND NOT v_ve_tudo
       AND NOT v_lider
       AND upx.id IS NULL
  )
  SELECT jsonb_build_object(
           'aguardando',  count(*) FILTER (WHERE v.status = 'pendente'),
           'respondidas', count(*) FILTER (WHERE v.status = 'respondida'),
           'expiradas',   count(*) FILTER (WHERE v.status = 'expirada'),
           'na_janela',   count(*),
           'por_aprender', count(*) FILTER (
             WHERE v.status = 'respondida' AND v.kb_documento_id IS NULL
           ),
           'sem_empreendimento', count(*) FILTER (WHERE v.empreendimento_id IS NULL),
           'sem_dono_oculto', (SELECT n FROM ocultas)
         )
    INTO v_contadores
    FROM visivel v;

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
          'escalada_em', p.escalated_at,
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
          'fora_do_canal', p.resposta_corretor LIKE '[resolvida fora do canal]%',
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
      LEFT JOIN user_profiles up ON up.id::text = lower(btrim(p.corretor_id))
      LEFT JOIN lancamentos lan ON lan.id = p.empreendimento_id
      LEFT JOIN tenant_memberships dono
             ON dono.user_id = up.id AND dono.tenant_id = p.tenant_id
      LEFT JOIN teams dt ON dt.id = dono.team_id
      LEFT JOIN webhook_events w
        ON w.event_type = 'plantao.respondida'
       AND w.source_table = 'lia_perguntas_corretor'
       AND w.source_id = p.id
      WHERE p.tenant_id = p_tenant_id
        AND p.criado_em >= v_desde
        AND (
          v_ve_tudo
          OR up.id = v_caller
          OR (v_lider AND up.id IS NULL)
          OR (v_lider AND up.id IS NOT NULL
              AND (dono.leader_user_id = v_caller
                   OR dt.leader_user_ids @> ARRAY[v_caller]))
        )
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
    've_tudo', v_ve_tudo,
    'recorte', CASE WHEN v_ve_tudo THEN 'imobiliaria'
                    WHEN v_lider   THEN 'equipe'
                    ELSE 'proprias' END,
    'contadores', v_contadores,
    'linhas', v_linhas
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
