-- ============================================================
-- A.4 · Metas diárias — compromisso, agenda e as três filas.
--
-- A tela do corretor pela manhã. No Aether ela só cobra quatro números iguais
-- para todo mundo; aqui ela ENTREGA trabalho pronto — a agenda do dia, o que
-- está pegando fogo e a lista de resgate — e por isso o corretor abre porque
-- é útil, não porque o gestor mandou.
--
-- Tabela nova, só uma (Manual): `metas_diarias` — o que a pessoa PROMETEU no
-- dia. Agenda, atenção, dúvidas da LIA e o REALIZADO são consultas sobre o que
-- já existe. O realizado nunca é digitado de novo: vem de evento.
--
--   campos por atuação (permissions.atuacao):
--     Lançamentos → visitas · propostas · retornos (sem captação: o produto
--                   é da construtora);
--     Prontos     → captações · visitas · propostas · retornos.
--   realizado do dia (dia de São Paulo):
--     visitas   = lead que ELE levou a "Visita Realizada" (evento) ou visita
--                 concluída na agenda dele, sem contar o mesmo lead duas vezes;
--     propostas = propostas em que ele é o corretor, criadas no dia;
--     retornos  = toques de cadência executados por ele no dia;
--     captações = imóveis em que ele é o captador, cadastrados no dia.
--
-- Tudo passa por função (SECURITY DEFINER): a tabela não tem grant para a
-- tela. O corretor só lê e lança o próprio dia; o placar é da gestão.
-- Medido em 01/10: 25 dos 32 compromissos da agenda da Lotus só têm o e-mail
-- do corretor, não o id — a agenda casa pelos dois.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.metas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data date NOT NULL,
  prometido jsonb NOT NULL,
  -- O PRIMEIRO lançamento do dia. Corrigir o número depois não apaga que ele
  -- foi lançado (nem que foi lançado atrasado).
  lancado_em timestamptz NOT NULL DEFAULT now(),
  atrasado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, data)
);
ALTER TABLE public.metas_diarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metas_diarias FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.metas_diarias TO service_role;

-- O horário de corte: depois dele, lançar ainda vale — mas fica "atrasado".
-- Não bloqueia (Manual).
CREATE TABLE IF NOT EXISTS public.tenant_metas_diarias_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  corte time NOT NULL DEFAULT '10:00',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_metas_diarias_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_metas_diarias_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_metas_diarias_config TO service_role;

-- ------------------------------------------------------------
-- Peças internas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hoje_sp() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Os campos do compromisso de quem tem esta atuação. Sem atuação definida,
-- pede os quatro: melhor um campo a mais que esconder a captação de quem capta.
CREATE OR REPLACE FUNCTION public.campos_da_meta_diaria(p_atuacao jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  -- Mesma leitura de atuacoesDe (src/types/permissions.ts): a string
  -- 'lancamentos' é o formato legado de "só lançamentos".
  SELECT CASE
    WHEN p_atuacao = '"lancamentos"'::jsonb
      OR (jsonb_typeof(p_atuacao) = 'array'
          AND p_atuacao ? 'lancamentos'
          AND NOT (p_atuacao ? 'prontos') AND NOT (p_atuacao ? 'alugados'))
      THEN ARRAY['visitas', 'propostas', 'retornos']
    ELSE ARRAY['captacoes', 'visitas', 'propostas', 'retornos']
  END
$$;

CREATE OR REPLACE FUNCTION public.realizado_do_dia(p_tenant_id uuid, p_user_id uuid, p_data date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_email text := (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user_id);
BEGIN
  RETURN jsonb_build_object(
    'visitas', (SELECT count(DISTINCT x.chave) FROM (
        SELECT e.lead_id AS chave FROM lead_events e
         WHERE e.tenant_id = p_tenant_id AND e.event_type = 'lead.stage_changed'
           AND e.para = 'Visita Realizada' AND e.ator_user_id = p_user_id
           AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_data
        UNION ALL
        SELECT coalesce(a.lead_uuid, a.lead_id)::text || '' FROM agenda_eventos a
         WHERE a.tenant_id = p_tenant_id AND a.data = p_data AND a.status = 'concluido'
           AND a.tipo IN ('visita_agendada', 'visita_realizada')
           AND (a.corretor_id = p_user_id::text OR lower(a.corretor_email) = v_email)
           AND coalesce(a.lead_uuid, a.lead_id) IS NOT NULL
        UNION ALL
        -- Visita concluída sem lead amarrado: conta pela própria linha.
        SELECT 'agenda:' || a.id::text FROM agenda_eventos a
         WHERE a.tenant_id = p_tenant_id AND a.data = p_data AND a.status = 'concluido'
           AND a.tipo IN ('visita_agendada', 'visita_realizada')
           AND (a.corretor_id = p_user_id::text OR lower(a.corretor_email) = v_email)
           AND coalesce(a.lead_uuid, a.lead_id) IS NULL
      ) x),
    'propostas', (SELECT count(*) FROM proposals p
       WHERE p.tenant_id = p_tenant_id AND p.agent_user_id = p_user_id
         AND (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_data),
    'retornos', (SELECT count(*) FROM lead_toques t
       WHERE t.tenant_id = p_tenant_id AND t.executado_por = p_user_id
         AND (t.executado_em AT TIME ZONE 'America/Sao_Paulo')::date = p_data),
    'captacoes', (SELECT count(*) FROM imoveis_locais i
       WHERE i.tenant_id = p_tenant_id AND i.captador_id = p_user_id
         AND (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date = p_data)
  );
END $$;

REVOKE ALL ON FUNCTION public.campos_da_meta_diaria(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.realizado_do_dia(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- O corretor lança o compromisso do dia
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancar_meta_diaria(p_tenant_id uuid, p_prometido jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_atuacao jsonb;
  v_campos text[];
  v_limpo jsonb := '{}'::jsonb;
  v_chave text;
  v_valor jsonb;
  v_corte time;
  v_linha metas_diarias%ROWTYPE;
BEGIN
  SELECT tm.permissions->'atuacao' INTO v_atuacao
    FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid;
  IF v_uid IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_prometido IS NULL OR jsonb_typeof(p_prometido) <> 'object' THEN RAISE EXCEPTION 'compromisso_invalido'; END IF;

  v_campos := campos_da_meta_diaria(v_atuacao);
  FOR v_chave, v_valor IN SELECT * FROM jsonb_each(p_prometido) LOOP
    IF NOT v_chave = ANY (v_campos) THEN RAISE EXCEPTION 'campo_invalido'; END IF;
    IF jsonb_typeof(v_valor) <> 'number' OR (v_valor::text)::numeric <> trunc((v_valor::text)::numeric)
       OR (v_valor::text)::numeric NOT BETWEEN 0 AND 99 THEN
      RAISE EXCEPTION 'compromisso_invalido';
    END IF;
  END LOOP;
  -- Campo pedido e não preenchido vale 0: o compromisso fica completo.
  FOREACH v_chave IN ARRAY v_campos LOOP
    v_limpo := v_limpo || jsonb_build_object(v_chave, coalesce((p_prometido->>v_chave)::numeric::int, 0));
  END LOOP;

  SELECT c.corte INTO v_corte FROM tenant_metas_diarias_config c WHERE c.tenant_id = p_tenant_id;
  v_corte := coalesce(v_corte, '10:00');

  INSERT INTO metas_diarias (tenant_id, user_id, data, prometido, atrasado)
  VALUES (p_tenant_id, v_uid, hoje_sp(), v_limpo,
          (now() AT TIME ZONE 'America/Sao_Paulo')::time > v_corte)
  ON CONFLICT (tenant_id, user_id, data)
  DO UPDATE SET prometido = EXCLUDED.prometido, atualizado_em = now()
  RETURNING * INTO v_linha;

  RETURN jsonb_build_object('prometido', v_linha.prometido, 'lancado_em', v_linha.lancado_em,
                            'atrasado', v_linha.atrasado);
END $$;

-- ------------------------------------------------------------
-- O dia do corretor: compromisso, realizado, agenda, atenção, LIA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_dia(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_atuacao jsonb;
  v_hoje date := hoje_sp();
  v_corte time;
  v_meus text[];
BEGIN
  SELECT tm.permissions->'atuacao' INTO v_atuacao
    FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid;
  IF v_uid IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;
  SELECT c.corte INTO v_corte FROM tenant_metas_diarias_config c WHERE c.tenant_id = p_tenant_id;

  -- Os leads ativos DELE: as filas nunca mostram lead de outro corretor.
  SELECT coalesce(array_agg(l.id::text), '{}') INTO v_meus
    FROM leads l
   WHERE l.tenant_id = p_tenant_id AND l.assigned_agent_id = v_uid::text  -- coluna TEXTO
     AND l.status IS DISTINCT FROM 'Arquivado' AND l.status IS DISTINCT FROM 'Proposta Assinada';

  RETURN jsonb_build_object(
    'data', v_hoje,
    'corte', to_char(coalesce(v_corte, '10:00'), 'HH24:MI'),
    'atuacao', coalesce(v_atuacao, '[]'::jsonb),
    'campos', to_jsonb(campos_da_meta_diaria(v_atuacao)),
    'compromisso', (SELECT jsonb_build_object('prometido', m.prometido, 'lancado_em', m.lancado_em, 'atrasado', m.atrasado)
                      FROM metas_diarias m WHERE m.tenant_id = p_tenant_id AND m.user_id = v_uid AND m.data = v_hoje),
    'realizado', realizado_do_dia(p_tenant_id, v_uid, v_hoje),
    'agenda', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', a.id, 'horario', a.horario, 'tipo', a.tipo, 'titulo', a.titulo, 'status', a.status,
                  'lead_id', coalesce(a.lead_uuid, a.lead_id), 'lead_nome', a.lead_nome, 'imovel', a.imovel_titulo)
                  ORDER BY a.horario NULLS LAST), '[]'::jsonb)
                 FROM agenda_eventos a
                WHERE a.tenant_id = p_tenant_id AND a.data = v_hoje
                  AND (a.corretor_id = v_uid::text OR lower(a.corretor_email) = v_email)),
    'tarefas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'prioridade', t.prioridade)
                  ORDER BY t.ordem NULLS LAST, t.created_at), '[]'::jsonb)
                 FROM tarefas t
                WHERE t.tenant_id = p_tenant_id AND t.assignee_user_id = v_uid AND NOT coalesce(t.concluida, false)
                  AND (t.data_vencimento AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje),
    'vencidas', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'data' DESC), '[]'::jsonb) FROM (
                   SELECT jsonb_build_object('id', a.id, 'data', a.data, 'horario', a.horario, 'tipo', a.tipo,
                            'titulo', a.titulo, 'lead_id', coalesce(a.lead_uuid, a.lead_id), 'lead_nome', a.lead_nome) AS x
                     FROM agenda_eventos a
                    WHERE a.tenant_id = p_tenant_id AND a.data < v_hoje AND a.status = 'pendente'
                      AND (a.corretor_id = v_uid::text OR lower(a.corretor_email) = v_email)
                    ORDER BY a.data DESC LIMIT 20) v),
    'parados', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'dias')::int DESC), '[]'::jsonb) FROM (
                  SELECT jsonb_build_object('lead_id', l.id, 'nome', l.name, 'etapa', l.status,
                           'dias', floor(extract(epoch FROM (now() - mv.ultima)) / 86400)::int) AS x
                    FROM leads_ultima_movimentacao(p_tenant_id, v_meus) mv
                    JOIN leads l ON l.id::text = mv.lead_id
                   WHERE mv.ultima < now() - interval '7 days'
                   ORDER BY mv.ultima LIMIT 20) p),
    'lia', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'pergunta', q.pergunta, 'lead_id', q.lead_id,
               'criado_em', q.criado_em) ORDER BY q.criado_em), '[]'::jsonb)
              FROM lia_perguntas_corretor q
             WHERE q.tenant_id = p_tenant_id AND q.corretor_id = v_uid::text AND q.status = 'pendente'),
    -- Os leads ativos dele, para a fila "Dá para resgatar hoje": quem ordena é o
    -- score (P1.7), calculado na tela com os pesos da casa — a mesma conta das
    -- outras telas, sem uma segunda versão aqui.
    'meus_leads', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.name, 'etapa', l.status,
                     'temperatura', l.temperature, 'origem', l.source) ORDER BY l.name), '[]'::jsonb)
                     FROM leads l WHERE l.tenant_id = p_tenant_id AND l.id::text = ANY (v_meus))
  );
END $$;

-- ------------------------------------------------------------
-- O placar do gestor: quantos lançaram, quantos bateram, aproveitamento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.placar_metas_diarias(p_tenant_id uuid, p_data date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_dia date := coalesce(p_data, hoje_sp());
  v_dono boolean := coalesce(public.is_platform_owner(), false);
BEGIN
  SELECT tm.role INTO v_role FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid;
  -- `IS NOT DISTINCT FROM`: quem não é da casa tem role NULO, e `NULL IN (...)`
  -- deixaria passar um "NOT" sem querer.
  IF NOT (v_dono OR v_role IS NOT DISTINCT FROM 'admin' OR v_role IS NOT DISTINCT FROM 'team_leader') THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  RETURN (
    WITH pessoas AS (
      SELECT tm.user_id, tm.team_id, coalesce(t.name, 'Sem equipe') AS equipe,
             coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) AS nome,
             campos_da_meta_diaria(tm.permissions->'atuacao') AS campos
        FROM tenant_memberships tm
        JOIN auth.users u ON u.id = tm.user_id
        LEFT JOIN teams t ON t.id = tm.team_id
       WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
         AND NOT EXISTS (SELECT 1 FROM platform_owners po WHERE po.email = lower(u.email))
         -- O líder vê as equipes dele; diretoria e dono veem a casa.
         AND (v_dono OR v_role = 'admin'
              OR EXISTS (SELECT 1 FROM teams lt WHERE lt.id = tm.team_id AND lt.tenant_id = p_tenant_id
                           AND (lt.leader_user_id = v_uid OR v_uid = ANY (lt.leader_user_ids))))
    ), linhas AS (
      SELECT p.*, m.prometido, m.atrasado, (m.user_id IS NOT NULL) AS lancou,
             realizado_do_dia(p_tenant_id, p.user_id, v_dia) AS realizado
        FROM pessoas p
        LEFT JOIN metas_diarias m ON m.tenant_id = p_tenant_id AND m.user_id = p.user_id AND m.data = v_dia
    ), contas AS (
      SELECT l.*,
             -- Prometido e cumprido (sem passar do prometido em cada campo: o
             -- campo que sobrou não cobre o que faltou em outro).
             (SELECT coalesce(sum((l.prometido->>c)::int), 0) FROM unnest(l.campos) c) AS soma_prometido,
             (SELECT coalesce(sum(least((l.prometido->>c)::int, (l.realizado->>c)::int)), 0) FROM unnest(l.campos) c) AS soma_cumprido
        FROM linhas l
    ), finais AS (
      SELECT c.*, (c.lancou AND c.soma_prometido > 0 AND c.soma_cumprido = c.soma_prometido) AS bateu
        FROM contas c
    )
    SELECT jsonb_build_object(
      'data', v_dia,
      'equipes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'equipe', e.equipe, 'corretores', e.corretores, 'lancaram', e.lancaram,
                     'bateram', e.bateram, 'aproveitamento', e.aproveitamento) ORDER BY e.equipe), '[]'::jsonb)
                    FROM (SELECT equipe, count(*) AS corretores, count(*) FILTER (WHERE lancou) AS lancaram,
                                 count(*) FILTER (WHERE bateu) AS bateram,
                                 CASE WHEN sum(soma_prometido) > 0
                                      THEN round(100.0 * sum(soma_cumprido) / sum(soma_prometido)) END AS aproveitamento
                            FROM finais GROUP BY equipe) e),
      'pessoas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'user_id', f.user_id, 'nome', f.nome, 'equipe', f.equipe, 'campos', to_jsonb(f.campos),
                     'lancou', f.lancou, 'atrasado', coalesce(f.atrasado, false), 'prometido', f.prometido,
                     'realizado', f.realizado, 'bateu', f.bateu) ORDER BY f.equipe, f.nome), '[]'::jsonb)
                    FROM finais f)
    )
    FROM (SELECT 1) um
  );
END $$;

REVOKE ALL ON FUNCTION public.lancar_meta_diaria(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meu_dia(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.placar_metas_diarias(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lancar_meta_diaria(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meu_dia(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.placar_metas_diarias(uuid, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
