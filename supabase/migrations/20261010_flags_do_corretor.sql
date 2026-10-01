-- ============================================================
-- A.3 · Flags do corretor — semáforo com "falta para subir".
--
-- Régua por atuação (Lançamentos × Prontos), editável pela casa. Cada nível
-- (verde, amarelo) é uma lista de CAMINHOS em OU, e cada caminho é um objeto
-- {metrica: minimo} em E:
--
--   [{"vendas": 2}, {"vendas": 1, "visitas": 8}]  = 2 vendas, OU 1 venda + 8 visitas
--
-- Vermelho não se cadastra: é "não alcançou o amarelo".
--
-- As métricas são as do mês (dia de São Paulo), lidas de evento:
--   vendas    = proposta assinada em que ele é o corretor (a mesma fonte do
--               VGV: vendasAssinadasService);
--   visitas   = a mesma conta do A.4 (realizado_do_dia), agora por período;
--   captacoes = imóvel em que ele é o captador, cadastrado no mês.
--
-- "Falta para subir" é o caminho do nível de cima com MENOS unidades faltando.
-- ponytail: unidade é unidade — 1 venda pesa o mesmo que 1 visita. Se a casa
-- achar que não, o próximo passo é um peso por métrica na régua.
--
-- O mês fecha sozinho (pg_cron, todo dia; só grava o que ainda não gravou) e
-- fica guardado em flag_snapshots, com a régua daquele dia: é o que permite
-- dizer "subiu de vermelho para amarelo" mesmo depois de a régua mudar.
-- ============================================================

-- ------------------------------------------------------------
-- A régua
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.caminhos_de_flag_validos(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN false
    WHEN jsonb_array_length(p) NOT BETWEEN 1 AND 10 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) c
       WHERE CASE
               WHEN jsonb_typeof(c) <> 'object' OR c = '{}'::jsonb THEN true
               ELSE EXISTS (
                 SELECT 1 FROM jsonb_each(c) e
                  WHERE e.key NOT IN ('vendas', 'visitas', 'captacoes')
                     OR CASE WHEN jsonb_typeof(e.value) <> 'number' THEN true
                             ELSE e.value::text::numeric <> trunc(e.value::text::numeric)
                               OR e.value::text::numeric NOT BETWEEN 1 AND 999 END)
             END)
  END
$$;

CREATE TABLE IF NOT EXISTS public.flag_reguas (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  atuacao text NOT NULL CHECK (atuacao IN ('lancamentos', 'prontos')),
  nivel text NOT NULL CHECK (nivel IN ('verde', 'amarelo')),
  caminhos jsonb NOT NULL CHECK (public.caminhos_de_flag_validos(caminhos)),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, atuacao, nivel)
);
ALTER TABLE public.flag_reguas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flag_reguas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flag_reguas TO authenticated;
GRANT ALL ON public.flag_reguas TO service_role;

-- O mesmo par de regras dos pesos do score: a casa lê, a diretoria grava.
DROP POLICY IF EXISTS flag_reguas_select ON public.flag_reguas;
CREATE POLICY flag_reguas_select ON public.flag_reguas FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
         OR public.is_platform_owner());
DROP POLICY IF EXISTS flag_reguas_write ON public.flag_reguas;
CREATE POLICY flag_reguas_write ON public.flag_reguas FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

-- ------------------------------------------------------------
-- O mês fechado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flag_snapshots (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes date NOT NULL CHECK (mes = date_trunc('month', mes)::date),
  atuacao text CHECK (atuacao IN ('lancamentos', 'prontos')),        -- NULO = sem atuação definida
  flag text CHECK (flag IN ('verde', 'amarelo', 'vermelho')),       -- NULO = não classificado
  metricas jsonb NOT NULL,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, mes)
);
ALTER TABLE public.flag_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flag_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.flag_snapshots TO service_role;

-- ------------------------------------------------------------
-- As métricas de um período — uma conta só para o A.4 e o A.3
-- ------------------------------------------------------------
-- Visita: o mesmo lead no mesmo dia conta uma vez (evento + agenda são a
-- mesma visita registrada duas vezes); em dias diferentes, são duas visitas.
CREATE OR REPLACE FUNCTION public.metricas_do_periodo(p_tenant_id uuid, p_user_id uuid, p_de date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_email text := (SELECT lower(u.email) FROM auth.users u WHERE u.id = p_user_id);
BEGIN
  RETURN jsonb_build_object(
    'vendas', (SELECT count(*) FROM proposals p
       WHERE p.tenant_id = p_tenant_id AND p.agent_user_id = p_user_id
         AND p.stage_id = 'proposta-assinada' AND p.signed_at IS NOT NULL
         AND (p.signed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'visitas', (SELECT count(DISTINCT x.chave) FROM (
        SELECT e.lead_id || '@' || (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS chave FROM lead_events e
         WHERE e.tenant_id = p_tenant_id AND e.event_type = 'lead.stage_changed'
           AND e.para = 'Visita Realizada' AND e.ator_user_id = p_user_id
           AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
        UNION ALL
        SELECT coalesce(a.lead_uuid, a.lead_id)::text || '@' || a.data FROM agenda_eventos a
         WHERE a.tenant_id = p_tenant_id AND a.data BETWEEN p_de AND p_ate AND a.status = 'concluido'
           AND a.tipo IN ('visita_agendada', 'visita_realizada')
           AND (a.corretor_id = p_user_id::text OR lower(a.corretor_email) = v_email)
           AND coalesce(a.lead_uuid, a.lead_id) IS NOT NULL
        UNION ALL
        -- Visita concluída sem lead amarrado: conta pela própria linha.
        SELECT 'agenda:' || a.id::text FROM agenda_eventos a
         WHERE a.tenant_id = p_tenant_id AND a.data BETWEEN p_de AND p_ate AND a.status = 'concluido'
           AND a.tipo IN ('visita_agendada', 'visita_realizada')
           AND (a.corretor_id = p_user_id::text OR lower(a.corretor_email) = v_email)
           AND coalesce(a.lead_uuid, a.lead_id) IS NULL
      ) x),
    'propostas', (SELECT count(*) FROM proposals p
       WHERE p.tenant_id = p_tenant_id AND p.agent_user_id = p_user_id
         AND (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'retornos', (SELECT count(*) FROM lead_toques t
       WHERE t.tenant_id = p_tenant_id AND t.executado_por = p_user_id
         AND (t.executado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'captacoes', (SELECT count(*) FROM imoveis_locais i
       WHERE i.tenant_id = p_tenant_id AND i.captador_id = p_user_id
         AND (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate)
  );
END $$;

-- O A.4 passa a ler a mesma conta: um dia é um período de um dia.
CREATE OR REPLACE FUNCTION public.realizado_do_dia(p_tenant_id uuid, p_user_id uuid, p_data date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.metricas_do_periodo(p_tenant_id, p_user_id, p_data, p_data) - 'vendas'
$$;

REVOKE ALL ON FUNCTION public.caminhos_de_flag_validos(jsonb) FROM PUBLIC, anon;
-- O CHECK da régua roda como quem grava: a diretoria precisa poder executar.
GRANT EXECUTE ON FUNCTION public.caminhos_de_flag_validos(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.metricas_do_periodo(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.realizado_do_dia(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Classificar
-- ------------------------------------------------------------
-- A régua de quem tem esta atuação. Mesma leitura de atuacoesDe
-- (src/types/permissions.ts), com "alugados" do lado dos Prontos — o legado
-- 'prontos' sempre quis dizer prontos + alugados. Quem atende os dois lados
-- (ou não tem nada gravado) não tem régua: aparece separado.
CREATE OR REPLACE FUNCTION public.atuacao_da_flag(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p = '"lancamentos"'::jsonb THEN 'lancamentos'
    WHEN p = '"prontos"'::jsonb THEN 'prontos'
    WHEN jsonb_typeof(p) IS DISTINCT FROM 'array' THEN NULL
    WHEN (p ? 'lancamentos') AND NOT (p ? 'prontos' OR p ? 'alugados') THEN 'lancamentos'
    WHEN (p ? 'prontos' OR p ? 'alugados') AND NOT (p ? 'lancamentos') THEN 'prontos'
    ELSE NULL
  END
$$;

-- Quanto falta, por métrica, em cada caminho; devolve o caminho com menos
-- unidades faltando (empate: o que falta em menos métricas; depois, a ordem).
CREATE OR REPLACE FUNCTION public.flag_caminho_mais_curto(p_caminhos jsonb, p_m jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT f.falta FROM (
    SELECT c.ord,
           coalesce(jsonb_object_agg(e.key, e.minimo - e.tem) FILTER (WHERE e.minimo > e.tem), '{}'::jsonb) AS falta,
           coalesce(sum(greatest(e.minimo - e.tem, 0)), 0) AS unidades,
           count(*) FILTER (WHERE e.minimo > e.tem) AS metricas
      FROM jsonb_array_elements(p_caminhos) WITH ORDINALITY c(caminho, ord)
      CROSS JOIN LATERAL (
        SELECT k.key, k.value::text::int AS minimo, coalesce((p_m->>k.key)::int, 0) AS tem
          FROM jsonb_each(c.caminho) k) e
     GROUP BY c.ord
  ) f
  ORDER BY f.unidades, f.metricas, f.ord
  LIMIT 1
$$;

-- {flag, proximo, falta}. flag NULO = a atuação dele não tem régua.
CREATE OR REPLACE FUNCTION public.classificar_flag(p_m jsonb, p_verde jsonb, p_amarelo jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  WITH c AS (
    SELECT public.flag_caminho_mais_curto(p_verde, p_m) AS ao_verde,
           public.flag_caminho_mais_curto(p_amarelo, p_m) AS ao_amarelo
  )
  SELECT CASE
    WHEN p_verde IS NULL AND p_amarelo IS NULL THEN
      jsonb_build_object('flag', NULL, 'proximo', NULL, 'falta', NULL)
    WHEN c.ao_verde = '{}'::jsonb THEN
      jsonb_build_object('flag', 'verde', 'proximo', NULL, 'falta', NULL)
    WHEN c.ao_amarelo = '{}'::jsonb THEN
      jsonb_build_object('flag', 'amarelo', 'proximo', CASE WHEN p_verde IS NULL THEN NULL ELSE 'verde' END, 'falta', c.ao_verde)
    ELSE
      jsonb_build_object('flag', 'vermelho',
                         'proximo', CASE WHEN p_amarelo IS NULL THEN 'verde' ELSE 'amarelo' END,
                         'falta', coalesce(c.ao_amarelo, c.ao_verde))
  END
  FROM c
$$;

-- Todo mundo da casa que vende, classificado no mês. Sem checagem de acesso:
-- só as duas funções abaixo chamam, e cada uma faz a sua.
CREATE OR REPLACE FUNCTION public.flags_calculadas(p_tenant_id uuid, p_mes date)
RETURNS TABLE (user_id uuid, team_id uuid, equipe text, nome text, atuacao text, metricas jsonb, classificacao jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH pessoas AS (
    SELECT tm.user_id, tm.team_id, coalesce(t.name, 'Sem equipe') AS equipe,
           coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) AS nome,
           public.atuacao_da_flag(tm.permissions->'atuacao') AS atuacao,
           public.metricas_do_periodo(p_tenant_id, tm.user_id, p_mes, (p_mes + interval '1 month - 1 day')::date) AS m
      FROM tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
      LEFT JOIN teams t ON t.id = tm.team_id
     WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
       AND NOT EXISTS (SELECT 1 FROM platform_owners po WHERE po.email = lower(u.email))
  )
  SELECT p.user_id, p.team_id, p.equipe, p.nome, p.atuacao,
         jsonb_build_object('vendas', p.m->'vendas', 'visitas', p.m->'visitas', 'captacoes', p.m->'captacoes'),
         CASE WHEN p.atuacao IS NULL THEN jsonb_build_object('flag', NULL, 'proximo', NULL, 'falta', NULL)
              ELSE public.classificar_flag(p.m,
                     (SELECT r.caminhos FROM flag_reguas r WHERE r.tenant_id = p_tenant_id AND r.atuacao = p.atuacao AND r.nivel = 'verde'),
                     (SELECT r.caminhos FROM flag_reguas r WHERE r.tenant_id = p_tenant_id AND r.atuacao = p.atuacao AND r.nivel = 'amarelo'))
         END
    FROM pessoas p
$$;

REVOKE ALL ON FUNCTION public.atuacao_da_flag(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_caminho_mais_curto(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.classificar_flag(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flags_calculadas(uuid, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- A tela da gestão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flags_do_mes(p_tenant_id uuid, p_mes date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_mes date := date_trunc('month', coalesce(p_mes, hoje_sp()))::date;
  v_dono boolean := coalesce(public.is_platform_owner(), false);
BEGIN
  SELECT tm.role INTO v_role FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid;
  IF NOT (v_dono OR v_role IS NOT DISTINCT FROM 'admin' OR v_role IS NOT DISTINCT FROM 'team_leader') THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  RETURN jsonb_build_object(
    'mes', v_mes,
    'reguas', (SELECT coalesce(jsonb_object_agg(r.atuacao || ':' || r.nivel, r.caminhos), '{}'::jsonb)
                 FROM flag_reguas r WHERE r.tenant_id = p_tenant_id),
    'pessoas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'user_id', f.user_id, 'nome', f.nome, 'equipe', f.equipe, 'atuacao', f.atuacao,
                   'metricas', f.metricas,
                   'flag', f.classificacao->'flag', 'proximo', f.classificacao->'proximo', 'falta', f.classificacao->'falta',
                   -- O mês anterior, como ficou no dia em que fechou.
                   'antes', (SELECT s.flag FROM flag_snapshots s
                              WHERE s.tenant_id = p_tenant_id AND s.user_id = f.user_id
                                AND s.mes = (v_mes - interval '1 month')::date))
                 ORDER BY f.equipe, f.nome), '[]'::jsonb)
                  FROM flags_calculadas(p_tenant_id, v_mes) f
                 -- O líder vê as equipes dele; diretoria e dono veem a casa.
                 WHERE v_dono OR v_role = 'admin'
                    OR EXISTS (SELECT 1 FROM teams lt WHERE lt.id = f.team_id AND lt.tenant_id = p_tenant_id
                                 AND (lt.leader_user_id = v_uid OR v_uid = ANY (lt.leader_user_ids))))
  );
END $$;

REVOKE ALL ON FUNCTION public.flags_do_mes(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flags_do_mes(uuid, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Fechar o mês
-- ------------------------------------------------------------
-- Grava o mês anterior (dia de São Paulo) de toda casa que tem régua. Rodar de
-- novo não muda nada: o que fechou fica como fechou.
CREATE OR REPLACE FUNCTION public.fechar_flags_do_mes(p_mes date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_mes date := date_trunc('month', coalesce(p_mes, (hoje_sp() - interval '1 month')::date))::date;
  v_gravados integer;
BEGIN
  IF v_mes >= date_trunc('month', hoje_sp())::date THEN
    RAISE EXCEPTION 'mes_aberto';  -- mês em andamento não fecha
  END IF;

  INSERT INTO flag_snapshots (tenant_id, user_id, mes, atuacao, flag, metricas)
  SELECT r.tenant_id, f.user_id, v_mes, f.atuacao, f.classificacao->>'flag', f.metricas
    FROM (SELECT DISTINCT tenant_id FROM flag_reguas) r
    CROSS JOIN LATERAL flags_calculadas(r.tenant_id, v_mes) f
  ON CONFLICT (tenant_id, user_id, mes) DO NOTHING;
  GET DIAGNOSTICS v_gravados = ROW_COUNT;
  RETURN v_gravados;
END $$;

REVOKE ALL ON FUNCTION public.fechar_flags_do_mes(date) FROM PUBLIC, anon, authenticated;

-- Todo dia às 03:00 de São Paulo (06:00 UTC). No dia 1 grava; nos outros, não acha nada novo.
SELECT cron.unschedule('flags-fechar-mes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flags-fechar-mes');
SELECT cron.schedule('flags-fechar-mes', '0 6 * * *', $$ SELECT public.fechar_flags_do_mes(); $$);

NOTIFY pgrst, 'reload schema';
