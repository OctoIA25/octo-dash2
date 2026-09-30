-- ============================================================
-- Plantão da LIA: período, área e resumo — e o corretor passa a entrar na tela
--
-- Pedido do chefe (30/09): cada chamado diz a equipe e o corretor e abre a
-- conversa; em cima, um resumo (quantos a LIA abriu, quantos pendentes) com
-- filtro por área (Lançamentos × Prontos) e por período, o mês por padrão.
-- Cada corretor vê os seus, cada gestor a área dele, o diretor tudo.
--
-- QUEM VÊ O QUÊ JÁ ESTAVA NO BANCO (27/09): admin tudo, team_leader a equipe
-- e as sem dono, corretor só as suas. O que não havia era o corretor NA TELA
-- — e, por isso, ninguém tinha notado que as duas funções de AÇÃO não
-- seguiam essa regra:
--
--   plantao_responder       conferia só "é da imobiliária"
--   plantao_salvar_na_base  idem
--
-- Qualquer corretor já podia responder ao lead de um colega, ou ensinar a
-- LIA para a casa inteira, chamando a função direto. Abrir a tela para ele
-- sem fechar isto tornaria o furo um botão.
--
-- UMA REGRA SÓ. O recorte, que vivia duas vezes dentro de plantao_fila, vira
-- plantao_recorte + plantao_visiveis, e as três funções leem dali. Uma
-- terceira cópia no responder seria a próxima divergência.
--
-- ÁREA = a equipe do corretor dono da pergunta (tenant_memberships.team_id),
-- a mesma que get_tenant_members usa. Pergunta sem corretor identificado fica
-- em "Sem equipe" — decisão do chefe em 30/09, contra deduzir a área pelo
-- empreendimento: seria uma segunda regra de "de quem é", e erraria calada.
-- O filtro de área corta DEPOIS do recorte: estreita, nunca amplia.
--
-- PERÍODO no fuso de São Paulo, com o último dia inteiro. 23h30 de ontem em
-- São Paulo é 02h30 de hoje em UTC; cortar o dia em UTC poria a pergunta no
-- dia errado, justamente na virada do mês que o resumo usa.
--
-- COMPATÍVEL COM O FRONT NO AR: os parâmetros novos têm padrão, e a chamada
-- antiga (p_tenant_id, p_aba, p_limite, p_dias) continua resolvendo. Pode
-- aplicar antes do deploy da tela.
--
-- O TELEFONE DO LEAD passa a vir na linha, para o botão "Abrir conversa". Só
-- nas linhas que a pessoa já enxerga — é o mesmo número que o corretor vê no
-- card do lead dele, e o gestor no da equipe.
--
-- Base: as versões EM PRODUÇÃO em 30/09 (md5 plantao_fila 9e186195,
-- plantao_responder 45c564e5, plantao_salvar_na_base b4c23e62). Fora o que
-- está descrito aqui, o corpo é o mesmo.
--
-- Rollback: reaplicar 20260928_plantao_lancamento_escala_ao_diretor.sql
-- (fila), 20260926_responder_o_plantao_pela_dash.sql e o bloco 7 de
-- 20260920_plantao_da_lia.sql, depois dropar as duas funções novas.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Quem vê o quê — a regra, num lugar só
-- ------------------------------------------------------------

-- 'imobiliaria' | 'equipe' | 'proprias' | NULL (não é da casa).
-- Sem usuário (service_role, a LIA) vê a casa inteira, como já era.
CREATE OR REPLACE FUNCTION public.plantao_recorte(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN auth.uid() IS NULL OR public.is_platform_owner() THEN 'imobiliaria'
           WHEN tm.role IN ('owner', 'admin')                     THEN 'imobiliaria'
           WHEN tm.role = 'team_leader'                            THEN 'equipe'
           WHEN tm.role IS NOT NULL                                THEN 'proprias'
         END
    FROM (SELECT 1) um
    LEFT JOIN tenant_memberships tm
           ON tm.user_id = auth.uid() AND tm.tenant_id = p_tenant_id
$function$;

-- As perguntas que quem chama enxerga, com o dono e a equipe (a ÁREA) de cada
-- uma. O corretor é casado comparando TEXTO, nunca com cast para uuid: a LIA
-- já gravou nome em corretor_id, e o cast derrubava a tela (26/09).
CREATE OR REPLACE FUNCTION public.plantao_visiveis(p_tenant_id uuid)
RETURNS TABLE (pergunta_id text, dono_id uuid, equipe_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH r AS (SELECT public.plantao_recorte(p_tenant_id) AS recorte)
  SELECT p.id, up.id, dono.team_id
    FROM lia_perguntas_corretor p
    CROSS JOIN r
    LEFT JOIN user_profiles up ON up.id::text = lower(btrim(p.corretor_id))
    LEFT JOIN tenant_memberships dono
           ON dono.user_id = up.id AND dono.tenant_id = p.tenant_id
    LEFT JOIN teams dt ON dt.id = dono.team_id
   WHERE p.tenant_id = p_tenant_id
     AND r.recorte IS NOT NULL
     AND (
       r.recorte = 'imobiliaria'
       OR up.id = auth.uid()
       -- Sem dono identificável: o gestor VÊ, para a pergunta não se perder
       -- (decisão de 27/09). O corretor não herda a órfã.
       OR (r.recorte = 'equipe'
           AND (up.id IS NULL
                OR dono.leader_user_id = auth.uid()
                OR dt.leader_user_ids @> ARRAY[auth.uid()]))
     )
$function$;

-- Só as funções do plantão chamam estas duas (e rodam como dono). Abertas ao
-- navegador, seriam um segundo caminho para a mesma resposta — sem os filtros.
REVOKE ALL ON FUNCTION public.plantao_recorte(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plantao_visiveis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plantao_recorte(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.plantao_visiveis(uuid) TO service_role;

-- ------------------------------------------------------------
-- 2. A fila: período, área e resumo
-- ------------------------------------------------------------
-- A assinatura muda, então é DROP + CREATE: um CREATE OR REPLACE criaria uma
-- segunda função sobrecarregada e a chamada por nome viraria ambígua. As duas
-- assinaturas caem, para a migration poder ser reaplicada.
DROP FUNCTION IF EXISTS public.plantao_fila(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.plantao_fila(uuid, text, integer, integer, date, date, text);

CREATE FUNCTION public.plantao_fila(
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
       -- NULL quando não houve resposta — zero minutos seria mentira.
       'mediana_resposta_min', round((percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (f.respondida_em - f.criado_em)) / 60
       ) FILTER (
         WHERE f.status = 'respondida'
           AND f.respondida_em IS NOT NULL
           AND f.respondida_em >= f.criado_em   -- o relógio do n8n às vezes inverte
       ))::numeric)
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

COMMENT ON FUNCTION public.plantao_fila(uuid, text, integer, integer, date, date, text) IS
  'A fila do plantao da LIA, recortada por plantao_visiveis. Periodo em datas de Sao Paulo (inclusivas); area = equipe do corretor dono, ou sem_equipe. Sem p_de, vale p_dias (chamada antiga).';

REVOKE ALL ON FUNCTION public.plantao_fila(uuid, text, integer, integer, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_fila(uuid, text, integer, integer, date, date, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Responder: só quem enxerga a pergunta
-- ------------------------------------------------------------
-- Única mudança: a checagem de acesso passa de "é da imobiliária" para
-- "enxerga esta pergunta". O corretor responde as suas; o gestor as da equipe
-- e as sem dono; o admin todas.
CREATE OR REPLACE FUNCTION public.plantao_responder(p_pergunta_id text, p_resposta text)
 RETURNS jsonb
 LANGUAGE plpgsql
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
     OR NOT EXISTS (
       SELECT 1 FROM public.plantao_visiveis(v_p.tenant_id) v
        WHERE v.pergunta_id = v_p.id
     )
  THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  END IF;

  IF v_resposta = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'resposta_vazia');
  END IF;

  -- Dois gestores na mesma fila é o caso COMUM. Sem esta guarda o lead
  -- recebe duas respostas e a segunda apaga a primeira da tela.
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

  -- `origem: dash` é o que separa esta resposta da que o corretor dá pelo
  -- WhatsApp — sem isso a LIA responderia ao lead duas vezes.
  -- `contexto` é TEXTO livre, não jsonb: mandamos inteiro em vez de inventar
  -- um parser do texto deles.
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

-- ------------------------------------------------------------
-- 4. Salvar na base: só a gestão, e só o que ela enxerga
-- ------------------------------------------------------------
-- O documento ensina a LIA para a imobiliária inteira. Decisão do chefe em
-- 30/09: o corretor vê e responde; ensinar a casa é de quem coordena.
CREATE OR REPLACE FUNCTION public.plantao_salvar_na_base(p_pergunta_id text, p_titulo text, p_conteudo text, p_valido_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_p record;
  v_titulo text := btrim(COALESCE(p_titulo, ''));
  v_conteudo text := btrim(COALESCE(p_conteudo, ''));
  v_doc uuid;
BEGIN
  SELECT id, tenant_id, pergunta, resposta_corretor, empreendimento_id, kb_documento_id
    INTO v_p
    FROM lia_perguntas_corretor
   WHERE id = p_pergunta_id;

  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'pergunta_nao_encontrada');
  END IF;

  IF v_caller IS NULL
     OR COALESCE(public.plantao_recorte(v_p.tenant_id), 'proprias') = 'proprias'
     OR NOT EXISTS (
       SELECT 1 FROM public.plantao_visiveis(v_p.tenant_id) v
        WHERE v.pergunta_id = v_p.id
     )
  THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  END IF;

  -- Já salva: devolve o documento existente em vez de criar um segundo. Dois
  -- cliques no botão criariam duas respostas iguais na base, e a busca passaria
  -- a devolver a mesma coisa duas vezes.
  IF v_p.kb_documento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'documento_id', v_p.kb_documento_id, 'ja_existia', true);
  END IF;

  IF v_conteudo = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conteudo_vazio');
  END IF;
  IF v_titulo = '' THEN
    v_titulo := left(v_p.pergunta, 120);
  END IF;

  INSERT INTO kb_documentos (
    tenant_id, lancamento_id, titulo, tipo, conteudo, valido_ate,
    status_indexacao, qtd_trechos
  ) VALUES (
    v_p.tenant_id,
    v_p.empreendimento_id,   -- NULL = conhecimento geral da imobiliária
    v_titulo,
    'resposta_plantao',
    v_conteudo,
    p_valido_ate,
    'indexado',
    1
  )
  RETURNING id INTO v_doc;

  -- A pergunta entra junto do texto: quem procurar com as palavras da PERGUNTA
  -- ("tem elevador?") acha o trecho, mesmo que a resposta tenha sido "não, esse
  -- prédio é de três andares" e não repita a palavra.
  INSERT INTO kb_trechos (tenant_id, documento_id, lancamento_id, ordem, texto)
  VALUES (v_p.tenant_id, v_doc, v_p.empreendimento_id, 0,
          v_p.pergunta || E'\n\n' || v_conteudo);

  UPDATE lia_perguntas_corretor
     SET kb_documento_id = v_doc,
         aprovada_por    = v_caller,
         aprovada_em     = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object('ok', true, 'documento_id', v_doc, 'ja_existia', false,
                            'geral', v_p.empreendimento_id IS NULL);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
