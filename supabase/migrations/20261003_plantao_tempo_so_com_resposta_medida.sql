-- ============================================================
-- Plantão: o tempo de resposta mentia "0 min" na Lotus
--
-- Achado ao conferir 20261003_plantao_periodo_area_e_resumo em produção
-- (30/09), antes de o front subir: a fila da Lotus devolvia
-- mediana_resposta_min = 0, e o cartão "Tempo de resposta" diria
-- "menos de 1 min".
--
-- Não é o corretor respondendo rápido. A LIA da Lotus grava a pergunta NO
-- INSTANTE da resposta: das 95 respondidas, 80 têm entre 0,004 s e 1,1 s
-- entre criado_em e respondida_em; as outras 15 levaram mais de 37 horas.
-- Não há meio-termo — é gravação, não atendimento.
--
-- Resposta com TEMPO MEDIDO passa a ser a que tem 5 s ou mais entre a
-- pergunta e a resposta. Vale nas duas funções que medem esse tempo:
--
--   plantao_fila   mediana do resumo; + respostas_medidas e respostas_sem_tempo
--   plantao_regua  a simulação de Configurações ("X% dentro do prazo"), que
--                  contava as 80 como respondidas em 0 min, dentro do prazo
--
-- Na Japi (histórico) nada muda: 0 de 1.498 abaixo de 5 s, mediana 2h43.
-- Na Lotus: de 0 min para ~2,8 dias.
--
-- Mesma assinatura nas duas: CREATE OR REPLACE, sem DROP. Na fila só muda o
-- bloco da mediana; o resto é o da migration anterior.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.plantao_fila(
  p_tenant_id uuid,
  p_aba       text    DEFAULT 'aguardando',
  p_limite    integer DEFAULT 200,
  -- Usado só quando p_de é nulo: é a chamada antiga, "últimos N dias".
  p_dias      integer DEFAULT 90,
  -- Datas de São Paulo, as duas inclusivas. p_ate nulo = até agora.
  p_de        date    DEFAULT NULL,
  p_ate       date    DEFAULT NULL,
  -- NULL = todas; o id da equipe; ou 'sem_equipe'.
  p_equipe    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limite  int := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_dias    int := LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730);
  v_desde   timestamptz := CASE
    WHEN p_de IS NULL THEN now() - (v_dias || ' days')::interval
    ELSE p_de::timestamp AT TIME ZONE 'America/Sao_Paulo'
  END;
  -- O dia final entra inteiro: o corte é a meia-noite SEGUINTE.
  v_ate     timestamptz := CASE
    WHEN p_ate IS NULL THEN 'infinity'::timestamptz
    ELSE (p_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
  END;
  v_aba     text := COALESCE(NULLIF(btrim(p_aba), ''), 'aguardando');
  v_equipe  text := NULLIF(btrim(COALESCE(p_equipe, '')), '');
  v_recorte text;
  v_cfg     record;
  v_regua   int;
  v_ocultas int := 0;
  v_contadores jsonb;
  v_equipes jsonb;
  v_linhas  jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- SECURITY DEFINER passa por cima da RLS: sem isto, qualquer usuário logado
  -- leria o plantão — com telefone de cliente — de qualquer imobiliária.
  v_recorte := public.plantao_recorte(p_tenant_id);
  IF v_recorte IS NULL THEN RETURN NULL; END IF;

  SELECT espera_maxima_minutos, destino, plantonista_id
    INTO v_cfg
    FROM tenant_plantao_config WHERE tenant_id = p_tenant_id;
  v_regua := COALESCE(v_cfg.espera_maxima_minutos, 30);

  -- Só o corretor tem perguntas escondidas: as sem dono, que são de quem
  -- coordena. A tela diz quantas, em vez de a lista chegar curta sem motivo.
  IF v_recorte = 'proprias' THEN
    SELECT count(*) INTO v_ocultas
      FROM lia_perguntas_corretor p
      LEFT JOIN user_profiles upx ON upx.id::text = lower(btrim(p.corretor_id))
     WHERE p.tenant_id = p_tenant_id
       AND p.criado_em >= v_desde AND p.criado_em < v_ate
       AND upx.id IS NULL;
  END IF;

  WITH vis AS (
    SELECT p.*, v.dono_id, v.equipe_id
      FROM public.plantao_visiveis(p_tenant_id) v
      JOIN lia_perguntas_corretor p ON p.id = v.pergunta_id
     WHERE p.criado_em >= v_desde AND p.criado_em < v_ate
  ),
  -- Depois do recorte: pedir a área alheia devolve nada, nunca a área alheia.
  filtrada AS (
    SELECT * FROM vis
     WHERE v_equipe IS NULL
        OR (v_equipe = 'sem_equipe' AND vis.equipe_id IS NULL)
        OR vis.equipe_id::text = v_equipe
  ),
  -- As áreas para escolher, com o total ANTES do filtro: o chip de uma área
  -- não pode mudar de número conforme outra está selecionada.
  por_equipe AS (
    SELECT COALESCE(vis.equipe_id::text, 'sem_equipe') AS id,
           te.name AS nome,
           count(*) AS total,
           count(*) FILTER (WHERE vis.status IN ('pendente', 'expirada')) AS pendentes
      FROM vis
      LEFT JOIN teams te ON te.id = vis.equipe_id
     GROUP BY 1, 2
  ),
  linhas AS (
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
        'lead_telefone', p.lead_phone,
        'corretor_id', p.corretor_id,
        'corretor_nome', COALESCE(up.full_name, NULLIF(btrim(p.corretor_id), '')),
        'corretor_cadastrado', up.id IS NOT NULL,
        'corretor_email', up.email,
        'equipe_id', p.equipe_id,
        'equipe_nome', te.name,
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
      FROM filtrada p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN user_profiles up ON up.id = p.dono_id
      LEFT JOIN teams te ON te.id = p.equipe_id
      LEFT JOIN lancamentos lan ON lan.id = p.empreendimento_id
      LEFT JOIN webhook_events w
        ON w.event_type = 'plantao.respondida'
       AND w.source_table = 'lia_perguntas_corretor'
       AND w.source_id = p.id
     WHERE CASE v_aba
             WHEN 'aguardando'  THEN p.status IN ('pendente', 'expirada')
             WHEN 'respondidas' THEN p.status = 'respondida'
             ELSE true
           END
     ORDER BY 1 DESC
     LIMIT v_limite
  )
  SELECT
    (SELECT jsonb_build_object(
       'aguardando',  count(*) FILTER (WHERE f.status = 'pendente'),
       'respondidas', count(*) FILTER (WHERE f.status = 'respondida'),
       'expiradas',   count(*) FILTER (WHERE f.status = 'expirada'),
       'na_janela',   count(*),
       'por_aprender', count(*) FILTER (WHERE f.status = 'respondida' AND f.kb_documento_id IS NULL),
       'sem_empreendimento', count(*) FILTER (WHERE f.empreendimento_id IS NULL),
       'sem_dono_oculto', v_ocultas,
       -- Esperando além da régua AGORA. Expirada entra: continua sem resposta.
       'atrasadas', count(*) FILTER (
         WHERE f.status IN ('pendente', 'expirada')
           AND f.criado_em < now() - make_interval(mins => v_regua)
       ),
       -- Mediana, nunca média: cauda longa (P50 2h43, P95 7 dias na Japi).
       -- NULL quando não houve resposta medida — zero minutos seria mentira.
       -- Só entra resposta com TEMPO MEDIDO (ver o cabeçalho).
       'mediana_resposta_min', round((percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (f.respondida_em - f.criado_em)) / 60
       ) FILTER (
         WHERE f.status = 'respondida' AND f.respondida_em - f.criado_em >= interval '5 seconds'
       ))::numeric),
       'respostas_medidas', count(*) FILTER (
         WHERE f.status = 'respondida' AND f.respondida_em - f.criado_em >= interval '5 seconds'
       ),
       -- Gravadas junto com a resposta, sem data, ou com o relógio do n8n
       -- invertido. A tela diz quantas ficaram de fora da mediana.
       'respostas_sem_tempo', count(*) FILTER (
         WHERE f.status = 'respondida'
           AND (f.respondida_em IS NULL OR f.respondida_em - f.criado_em < interval '5 seconds')
       )
     ) FROM filtrada f),
    (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.nome NULLS LAST), '[]'::jsonb) FROM por_equipe e),
    (SELECT COALESCE(jsonb_agg(linha ORDER BY ordem), '[]'::jsonb) FROM linhas)
  INTO v_contadores, v_equipes, v_linhas;

  RETURN jsonb_build_object(
    'aba', v_aba,
    'espera_maxima_minutos', v_regua,
    'destino', COALESCE(v_cfg.destino, 'corretor_do_lead'),
    'plantonista_id', v_cfg.plantonista_id,
    'configurado', v_cfg.espera_maxima_minutos IS NOT NULL,
    'dias', v_dias,
    'de', (v_desde AT TIME ZONE 'America/Sao_Paulo')::date,
    'ate', p_ate,
    'equipe', v_equipe,
    'limite', v_limite,
    've_tudo', v_recorte = 'imobiliaria',
    'recorte', v_recorte,
    'contadores', v_contadores,
    'equipes', v_equipes,
    'linhas', v_linhas
  );
END;
$function$;

-- A régua de Configurações: base = a versão EM PRODUÇÃO em 30/09 (md5
-- 58efe833). Muda o que conta como resposta medida, e sai `sem_tempo`.
CREATE OR REPLACE FUNCTION public.plantao_regua(p_tenant_id uuid, p_minutos integer, p_dias integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_minutos int := GREATEST(COALESCE(p_minutos, 30), 1);
  v_total int;
  v_dentro int;
  v_mediana numeric;
  v_sem_tempo int;
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

  -- Só resposta com tempo medido (>= 5 s). A gravada junto com a resposta
  -- contava como "respondida em 0 min, dentro do prazo" — e na Lotus são 80
  -- de 95. Também fica de fora o relógio invertido do n8n, como já ficava.
  SELECT count(*) FILTER (WHERE respondida_em - criado_em >= interval '5 seconds'),
         count(*) FILTER (WHERE respondida_em - criado_em >= interval '5 seconds'
                            AND extract(epoch FROM (respondida_em - criado_em)) / 60 <= v_minutos),
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM (respondida_em - criado_em)) / 60
         ) FILTER (WHERE respondida_em - criado_em >= interval '5 seconds'),
         count(*) FILTER (WHERE respondida_em IS NULL OR respondida_em - criado_em < interval '5 seconds')
    INTO v_total, v_dentro, v_mediana, v_sem_tempo
    FROM lia_perguntas_corretor
   WHERE tenant_id = p_tenant_id
     AND status = 'respondida'
     AND criado_em >= v_desde;

  RETURN jsonb_build_object(
    'minutos', v_minutos,
    'dias', LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730),
    'respondidas', v_total,
    'dentro_do_prazo', v_dentro,
    -- NULL e não 0 quando não há amostra: zero por cento diria "nenhuma cumpriu",
    -- e a verdade é "não houve plantão para medir". Foi assim que a visit_date
    -- enganou todo mundo por meses.
    'pct_dentro', CASE WHEN v_total > 0 THEN round(v_dentro * 100.0 / v_total, 1) END,
    'mediana_minutos', CASE WHEN v_total > 0 THEN round(v_mediana) END,
    -- Respondidas que não entram na conta, para a tela dizer em vez de sumir.
    'sem_tempo', v_sem_tempo
  );
END;
$function$;


NOTIFY pgrst, 'reload schema';

COMMIT;
