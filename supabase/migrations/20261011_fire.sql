-- ============================================================
-- A.6 · Fire — campanha comercial por edição.
--
-- Cada edição tem início, fim, pontuação por atuação e desafios. Os pontos
-- vêm de evento real da Dash — captação, visita, proposta, venda e desafio
-- cumprido —, nunca de digitação. `fire_pontos` É o log: ponto não se edita
-- nem se apaga; errado, estorna com motivo (uma linha nova, negativa).
--
-- Garantias do banco, não da tela:
--   · o mesmo evento não pontua duas vezes, mesmo reprocessado (índice único);
--   · ponto não muda nem some (gatilho);
--   · edição encerrada não recebe ponto nem estorno, e a classificação dela
--     fica gravada no dia em que fechou (classificacao_final).
--
-- O processamento roda a cada 10 minutos (pg_cron) e fecha sozinho a edição
-- que passou do fim.
--
-- Recordes (melhor mês de VGC, maior venda, mais visitas numa semana) NÃO têm
-- tabela: são calculados de vendas_assinadas e das visitas — guardar seria uma
-- segunda fonte para o mesmo número. Fica de fora a "super meta dobra os
-- pontos do mês": a meta individual ainda é amarrada a um nome digitado
-- (goals.owner_name), não à pessoa.
-- ============================================================

-- ------------------------------------------------------------
-- Visitas: uma fonte só, por pessoa (Meu dia, Flags e Fire)
-- ------------------------------------------------------------
-- O mesmo lead no mesmo dia é uma visita (evento + agenda = a mesma visita
-- registrada duas vezes); visita da agenda sem lead conta pela própria linha.
CREATE OR REPLACE FUNCTION public.visitas_realizadas(p_tenant_id uuid, p_de date, p_ate date)
RETURNS TABLE (user_id uuid, chave text, lead_id text, dia date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH membros AS (
    SELECT tm.user_id, lower(u.email) AS email
      FROM tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = p_tenant_id
  )
  SELECT e.ator_user_id, e.lead_id || '@' || d.dia, e.lead_id, d.dia
    FROM lead_events e
    CROSS JOIN LATERAL (SELECT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia) d
   WHERE e.tenant_id = p_tenant_id AND e.event_type = 'lead.stage_changed'
     AND e.para = 'Visita Realizada' AND e.ator_user_id IS NOT NULL
     AND d.dia BETWEEN p_de AND p_ate
  UNION ALL
  SELECT m.user_id,
         CASE WHEN coalesce(a.lead_uuid, a.lead_id) IS NULL THEN 'agenda:' || a.id::text
              ELSE coalesce(a.lead_uuid, a.lead_id)::text || '@' || a.data END,
         coalesce(a.lead_uuid, a.lead_id)::text, a.data
    FROM agenda_eventos a
    JOIN membros m ON a.corretor_id = m.user_id::text OR lower(a.corretor_email) = m.email
   WHERE a.tenant_id = p_tenant_id AND a.data BETWEEN p_de AND p_ate AND a.status = 'concluido'
     AND a.tipo IN ('visita_agendada', 'visita_realizada')
$$;

CREATE OR REPLACE FUNCTION public.metricas_do_periodo(p_tenant_id uuid, p_user_id uuid, p_de date, p_ate date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'vendas', (SELECT count(*) FROM proposals p
       WHERE p.tenant_id = p_tenant_id AND p.agent_user_id = p_user_id
         AND p.stage_id = 'proposta-assinada' AND p.signed_at IS NOT NULL
         AND (p.signed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'visitas', (SELECT count(DISTINCT v.chave) FROM public.visitas_realizadas(p_tenant_id, p_de, p_ate) v
       WHERE v.user_id = p_user_id),
    'propostas', (SELECT count(*) FROM proposals p
       WHERE p.tenant_id = p_tenant_id AND p.agent_user_id = p_user_id
         AND (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'retornos', (SELECT count(*) FROM lead_toques t
       WHERE t.tenant_id = p_tenant_id AND t.executado_por = p_user_id
         AND (t.executado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate),
    'captacoes', (SELECT count(*) FROM imoveis_locais i
       WHERE i.tenant_id = p_tenant_id AND i.captador_id = p_user_id
         AND (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate)
  )
$$;

REVOKE ALL ON FUNCTION public.visitas_realizadas(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.metricas_do_periodo(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- As tabelas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fire_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  inicio date NOT NULL,
  fim date NOT NULL,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativa', 'encerrada')),
  processado_em timestamptz,
  encerrada_em timestamptz,
  -- A classificação como ficou no fechamento: nome, equipe e pontos daquele dia.
  classificacao_final jsonb,
  criada_em timestamptz NOT NULL DEFAULT now(),
  CHECK (fim >= inicio)
);
-- Uma campanha por vez na casa.
CREATE UNIQUE INDEX IF NOT EXISTS fire_uma_ativa_por_casa ON public.fire_edicoes (tenant_id) WHERE status = 'ativa';

CREATE TABLE IF NOT EXISTS public.fire_pontuacoes (
  edicao_id uuid NOT NULL REFERENCES public.fire_edicoes(id) ON DELETE CASCADE,
  atuacao text NOT NULL CHECK (atuacao IN ('lancamentos', 'prontos')),
  evento text NOT NULL CHECK (evento IN ('captacao', 'visita', 'proposta', 'venda')),
  pontos integer NOT NULL CHECK (pontos BETWEEN 0 AND 1000),
  PRIMARY KEY (edicao_id, atuacao, evento)
);

CREATE TABLE IF NOT EXISTS public.fire_desafios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicao_id uuid NOT NULL REFERENCES public.fire_edicoes(id) ON DELETE CASCADE,
  descricao text NOT NULL CHECK (length(btrim(descricao)) BETWEEN 1 AND 120),
  -- {"evento": "visita", "quantidade": 3, "desde": "2026-10-06"}: N eventos entre `desde` e o prazo.
  condicao jsonb NOT NULL,
  pontos integer NOT NULL CHECK (pontos BETWEEN 1 AND 1000),
  prazo date NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (condicao->>'evento' IN ('captacao', 'visita', 'proposta', 'venda')
         AND jsonb_typeof(condicao->'quantidade') = 'number'
         AND (condicao->>'quantidade')::numeric BETWEEN 1 AND 99
         AND (condicao->>'quantidade')::numeric = trunc((condicao->>'quantidade')::numeric)
         AND (condicao->>'desde') ~ '^\d{4}-\d{2}-\d{2}$'
         AND (condicao->>'desde')::date <= prazo)
);

CREATE TABLE IF NOT EXISTS public.fire_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  edicao_id uuid NOT NULL REFERENCES public.fire_edicoes(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  -- Equipe e atuação do dia do ponto: a soma por equipe não muda se a pessoa trocar de equipe.
  team_id uuid,
  atuacao text,
  evento text NOT NULL CHECK (evento IN ('captacao', 'visita', 'proposta', 'venda', 'desafio')),
  origem_tipo text NOT NULL CHECK (origem_tipo IN ('imovel', 'visita', 'proposta', 'venda', 'desafio')),
  origem_id text NOT NULL,
  lead_id uuid,
  pontos integer NOT NULL,
  data timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  estorno_de uuid REFERENCES public.fire_pontos(id),
  estorno_motivo text,
  estornado_por uuid,
  CHECK ((estorno_de IS NULL) = (estorno_motivo IS NULL))
);
-- O mesmo evento não pontua duas vezes. Visita e desafio levam a pessoa no
-- origem_id (dois corretores na mesma visita pontuam cada um); proposta,
-- venda e imóvel têm dono único.
CREATE UNIQUE INDEX IF NOT EXISTS fire_pontos_uma_vez ON public.fire_pontos (edicao_id, evento, origem_id) WHERE estorno_de IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fire_estorno_uma_vez ON public.fire_pontos (estorno_de) WHERE estorno_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS fire_pontos_por_pessoa ON public.fire_pontos (edicao_id, user_id);

-- Nada disso se lê nem se escreve pela tela: só pelas funções abaixo.
ALTER TABLE public.fire_edicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_pontuacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_desafios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_pontos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fire_edicoes, public.fire_pontuacoes, public.fire_desafios, public.fire_pontos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fire_edicoes, public.fire_pontuacoes, public.fire_desafios, public.fire_pontos TO service_role;

-- ------------------------------------------------------------
-- Gatilhos: o que o banco não deixa acontecer
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_fire_ponto_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ponto_nao_se_edita';
END $$;
DROP TRIGGER IF EXISTS tr_fire_ponto_imutavel ON public.fire_pontos;
CREATE TRIGGER tr_fire_ponto_imutavel BEFORE UPDATE OR DELETE ON public.fire_pontos
  FOR EACH ROW EXECUTE FUNCTION public.tg_fire_ponto_imutavel();

CREATE OR REPLACE FUNCTION public.tg_fire_ponto_entra() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE e public.fire_edicoes%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.fire_edicoes WHERE id = NEW.edicao_id;
  IF e.status IS DISTINCT FROM 'ativa' THEN RAISE EXCEPTION 'edicao_nao_ativa'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM e.tenant_id THEN RAISE EXCEPTION 'edicao_de_outra_casa'; END IF;
  IF NEW.estorno_de IS NULL
     AND (NEW.data AT TIME ZONE 'America/Sao_Paulo')::date NOT BETWEEN e.inicio AND e.fim THEN
    RAISE EXCEPTION 'fora_da_edicao';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_fire_ponto_entra ON public.fire_pontos;
CREATE TRIGGER tr_fire_ponto_entra BEFORE INSERT ON public.fire_pontos
  FOR EACH ROW EXECUTE FUNCTION public.tg_fire_ponto_entra();

-- rascunho → ativa → encerrada, nunca para trás. Ativa não muda de datas;
-- encerrada não muda mais nada.
CREATE OR REPLACE FUNCTION public.tg_fire_edicao_muda() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN RAISE EXCEPTION 'so_rascunho_se_exclui'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'encerrada' THEN RAISE EXCEPTION 'edicao_encerrada'; END IF;
  IF NOT ((OLD.status, NEW.status) IN (('rascunho', 'rascunho'), ('rascunho', 'ativa'), ('ativa', 'ativa'), ('ativa', 'encerrada'))) THEN
    RAISE EXCEPTION 'transicao_invalida';
  END IF;
  IF OLD.status = 'ativa' AND (NEW.inicio, NEW.fim, NEW.tenant_id) IS DISTINCT FROM (OLD.inicio, OLD.fim, OLD.tenant_id) THEN
    RAISE EXCEPTION 'edicao_ativa_nao_muda_datas';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_fire_edicao_muda ON public.fire_edicoes;
CREATE TRIGGER tr_fire_edicao_muda BEFORE UPDATE OR DELETE ON public.fire_edicoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_fire_edicao_muda();

-- A pontuação é combinada antes de a campanha começar.
CREATE OR REPLACE FUNCTION public.tg_fire_pontuacao_congela() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.fire_edicoes
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.edicao_id ELSE NEW.edicao_id END;
  IF v_status IS NOT NULL AND v_status <> 'rascunho' THEN RAISE EXCEPTION 'pontuacao_congelada'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS tr_fire_pontuacao_congela ON public.fire_pontuacoes;
CREATE TRIGGER tr_fire_pontuacao_congela BEFORE INSERT OR UPDATE OR DELETE ON public.fire_pontuacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_fire_pontuacao_congela();

-- ------------------------------------------------------------
-- Peças internas
-- ------------------------------------------------------------
-- Quem joga: quem vende (corretor e líder), sem a conta dona da plataforma.
-- Sem atuação definida não pontua — a pontuação é por atuação.
CREATE OR REPLACE FUNCTION public.fire_membros(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, team_id uuid, atuacao text, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT tm.user_id, tm.team_id, public.atuacao_da_flag(tm.permissions->'atuacao'),
         coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email)
    FROM tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
     AND NOT EXISTS (SELECT 1 FROM platform_owners po WHERE po.email = lower(u.email))
$$;

CREATE OR REPLACE FUNCTION public.fire_pode_gerir(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.is_platform_owner(), false)
      OR EXISTS (SELECT 1 FROM tenant_memberships tm
                  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid() AND tm.role = 'admin')
$$;

-- Lê os eventos da edição até hoje (ou até o fim) e pontua o que ainda não pontuou.
CREATE OR REPLACE FUNCTION public.fire_processar(p_edicao_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e fire_edicoes%ROWTYPE;
  v_ate date;
  v_fim_do_dia timestamptz;
  v_n integer := 0;
  v_k integer;
BEGIN
  SELECT * INTO e FROM fire_edicoes WHERE id = p_edicao_id FOR UPDATE;
  IF NOT FOUND OR e.status <> 'ativa' THEN RETURN 0; END IF;
  v_ate := least(e.fim, hoje_sp());
  IF v_ate < e.inicio THEN RETURN 0; END IF;
  v_fim_do_dia := least(now(), ((v_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') - interval '1 second');

  -- Captação: imóvel cadastrado com ele de captador.
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id, pontos, data)
  SELECT e.tenant_id, e.id, m.user_id, m.team_id, m.atuacao, 'captacao', 'imovel', i.id::text, NULL, pt.pontos, i.created_at
    FROM fire_membros(e.tenant_id) m
    JOIN fire_pontuacoes pt ON pt.edicao_id = e.id AND pt.atuacao = m.atuacao AND pt.evento = 'captacao' AND pt.pontos > 0
    JOIN imoveis_locais i ON i.tenant_id = e.tenant_id AND i.captador_id = m.user_id
   WHERE (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN e.inicio AND v_ate
  ON CONFLICT (edicao_id, evento, origem_id) WHERE estorno_de IS NULL DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;

  -- Visita: a mesma conta do Meu dia e das Flags.
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id, pontos, data)
  SELECT DISTINCT ON (m.user_id, v.chave)
         e.tenant_id, e.id, m.user_id, m.team_id, m.atuacao, 'visita', 'visita', m.user_id::text || ':' || v.chave,
         CASE WHEN v.lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v.lead_id::uuid END,
         pt.pontos, (v.dia + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
    FROM fire_membros(e.tenant_id) m
    JOIN fire_pontuacoes pt ON pt.edicao_id = e.id AND pt.atuacao = m.atuacao AND pt.evento = 'visita' AND pt.pontos > 0
    JOIN visitas_realizadas(e.tenant_id, e.inicio, v_ate) v ON v.user_id = m.user_id
   ORDER BY m.user_id, v.chave
  ON CONFLICT (edicao_id, evento, origem_id) WHERE estorno_de IS NULL DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;

  -- Proposta: criada com ele de corretor.
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id, pontos, data)
  SELECT e.tenant_id, e.id, m.user_id, m.team_id, m.atuacao, 'proposta', 'proposta', p.id::text, p.lead_id, pt.pontos, p.created_at
    FROM fire_membros(e.tenant_id) m
    JOIN fire_pontuacoes pt ON pt.edicao_id = e.id AND pt.atuacao = m.atuacao AND pt.evento = 'proposta' AND pt.pontos > 0
    JOIN proposals p ON p.tenant_id = e.tenant_id AND p.agent_user_id = m.user_id
   WHERE (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN e.inicio AND v_ate
  ON CONFLICT (edicao_id, evento, origem_id) WHERE estorno_de IS NULL DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;

  -- Venda: proposta assinada (a mesma fonte do VGV).
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id, pontos, data)
  SELECT e.tenant_id, e.id, m.user_id, m.team_id, m.atuacao, 'venda', 'venda', p.id::text, p.lead_id, pt.pontos, p.signed_at
    FROM fire_membros(e.tenant_id) m
    JOIN fire_pontuacoes pt ON pt.edicao_id = e.id AND pt.atuacao = m.atuacao AND pt.evento = 'venda' AND pt.pontos > 0
    JOIN proposals p ON p.tenant_id = e.tenant_id AND p.agent_user_id = m.user_id
   WHERE p.stage_id = 'proposta-assinada' AND p.signed_at IS NOT NULL
     AND (p.signed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN e.inicio AND v_ate
  ON CONFLICT (edicao_id, evento, origem_id) WHERE estorno_de IS NULL DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;

  -- Desafio: N eventos entre `desde` e o prazo, contados pela mesma régua das Flags.
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id, pontos, data)
  SELECT e.tenant_id, e.id, m.user_id, m.team_id, m.atuacao, 'desafio', 'desafio', m.user_id::text || ':' || d.id::text,
         NULL, d.pontos, least(v_fim_do_dia, ((least(d.prazo, v_ate) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') - interval '1 second')
    FROM fire_membros(e.tenant_id) m
    JOIN fire_desafios d ON d.edicao_id = e.id
   WHERE m.atuacao IS NOT NULL
     AND (d.condicao->>'desde')::date <= v_ate
     AND (metricas_do_periodo(e.tenant_id, m.user_id, (d.condicao->>'desde')::date, least(d.prazo, v_ate))
            ->> CASE d.condicao->>'evento' WHEN 'captacao' THEN 'captacoes' WHEN 'visita' THEN 'visitas'
                                          WHEN 'proposta' THEN 'propostas' ELSE 'vendas' END)::int
         >= (d.condicao->>'quantidade')::int
  ON CONFLICT (edicao_id, evento, origem_id) WHERE estorno_de IS NULL DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;

  UPDATE fire_edicoes SET processado_em = now() WHERE id = e.id;
  RETURN v_n;
END $$;

-- A classificação de uma edição: quem tem atuação, mais quem já pontuou.
CREATE OR REPLACE FUNCTION public.fire_classificacao(p_edicao_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH e AS (SELECT * FROM fire_edicoes WHERE id = p_edicao_id),
  soma AS (
    SELECT p.user_id, sum(p.pontos)::int AS pontos,
           (array_agg(p.team_id ORDER BY p.data DESC))[1] AS team_id,
           (array_agg(p.atuacao ORDER BY p.data DESC))[1] AS atuacao
      FROM fire_pontos p WHERE p.edicao_id = p_edicao_id GROUP BY p.user_id
  ),
  gente AS (
    SELECT coalesce(m.user_id, s.user_id) AS user_id,
           coalesce(s.team_id, m.team_id) AS team_id,
           coalesce(s.atuacao, m.atuacao) AS atuacao,
           coalesce(s.pontos, 0) AS pontos
      FROM (SELECT * FROM fire_membros((SELECT tenant_id FROM e)) WHERE atuacao IS NOT NULL) m
      FULL JOIN soma s ON s.user_id = m.user_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', g.user_id,
           'nome', coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email),
           'equipe', coalesce(t.name, 'Sem equipe'),
           'atuacao', g.atuacao,
           'pontos', g.pontos)
         ORDER BY g.pontos DESC, coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email)), '[]'::jsonb)
    FROM gente g
    JOIN auth.users u ON u.id = g.user_id
    LEFT JOIN teams t ON t.id = g.team_id
$$;

-- Processa até o fim (ou até agora, se encerrar antes) e congela.
CREATE OR REPLACE FUNCTION public.fire_fechar(p_edicao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM fire_processar(p_edicao_id);
  UPDATE fire_edicoes
     SET status = 'encerrada', encerrada_em = now(), classificacao_final = fire_classificacao(p_edicao_id)
   WHERE id = p_edicao_id AND status = 'ativa';
END $$;

-- O relógio: processa as ativas e fecha a que passou do fim.
CREATE OR REPLACE FUNCTION public.fire_processar_ativas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN SELECT id, fim FROM fire_edicoes WHERE status = 'ativa' LOOP
    IF hoje_sp() > r.fim THEN PERFORM fire_fechar(r.id);
    ELSE v_n := v_n + fire_processar(r.id);
    END IF;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.fire_membros(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_pode_gerir(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_processar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_classificacao(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_fechar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_processar_ativas() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- O que a diretoria faz
-- ------------------------------------------------------------
-- Cria ou corrige um rascunho. A pontuação vem por atuação; o que faltar
-- usa a sugestão do plano (captação 5 · visita 10 · proposta 20 · venda 50).
CREATE OR REPLACE FUNCTION public.fire_salvar_edicao(p_tenant_id uuid, p_id uuid, p_nome text, p_inicio date, p_fim date, p_pontuacao jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid := p_id;
  v_status text;
  a text; ev text; v jsonb;
  padrao constant jsonb := '{"captacao":5,"visita":10,"proposta":20,"venda":50}';
BEGIN
  IF NOT fire_pode_gerir(p_tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
  IF p_pontuacao IS NOT NULL AND jsonb_typeof(p_pontuacao) <> 'object' THEN RAISE EXCEPTION 'pontuacao_invalida'; END IF;

  IF v_id IS NULL THEN
    INSERT INTO fire_edicoes (tenant_id, nome, inicio, fim) VALUES (p_tenant_id, btrim(p_nome), p_inicio, p_fim) RETURNING id INTO v_id;
  ELSE
    SELECT status INTO v_status FROM fire_edicoes WHERE id = v_id AND tenant_id = p_tenant_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'edicao_nao_encontrada'; END IF;
    IF v_status <> 'rascunho' THEN RAISE EXCEPTION 'edicao_nao_e_rascunho'; END IF;
    UPDATE fire_edicoes SET nome = btrim(p_nome), inicio = p_inicio, fim = p_fim WHERE id = v_id;
  END IF;

  FOREACH a IN ARRAY ARRAY['lancamentos', 'prontos'] LOOP
    FOREACH ev IN ARRAY ARRAY['captacao', 'visita', 'proposta', 'venda'] LOOP
      v := coalesce(p_pontuacao->a->ev, padrao->ev);
      IF jsonb_typeof(v) <> 'number' OR v::text::numeric <> trunc(v::text::numeric) OR v::text::numeric NOT BETWEEN 0 AND 1000 THEN
        RAISE EXCEPTION 'pontuacao_invalida';
      END IF;
      INSERT INTO fire_pontuacoes (edicao_id, atuacao, evento, pontos) VALUES (v_id, a, ev, v::text::int)
      ON CONFLICT (edicao_id, atuacao, evento) DO UPDATE SET pontos = EXCLUDED.pontos;
    END LOOP;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fire_excluir_edicao(p_edicao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid := (SELECT tenant_id FROM fire_edicoes WHERE id = p_edicao_id);
BEGIN
  IF v_tenant IS NULL OR NOT fire_pode_gerir(v_tenant) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM fire_edicoes WHERE id = p_edicao_id;   -- o gatilho só deixa rascunho
END $$;

CREATE OR REPLACE FUNCTION public.fire_ativar(p_edicao_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e fire_edicoes%ROWTYPE;
BEGIN
  SELECT * INTO e FROM fire_edicoes WHERE id = p_edicao_id;
  IF NOT FOUND OR NOT fire_pode_gerir(e.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF e.status <> 'rascunho' THEN RAISE EXCEPTION 'edicao_nao_e_rascunho'; END IF;
  IF e.fim < hoje_sp() THEN RAISE EXCEPTION 'edicao_ja_terminou'; END IF;
  IF EXISTS (SELECT 1 FROM fire_edicoes WHERE tenant_id = e.tenant_id AND status = 'ativa') THEN
    RAISE EXCEPTION 'ja_existe_edicao_ativa';
  END IF;
  UPDATE fire_edicoes SET status = 'ativa' WHERE id = p_edicao_id;
  -- Pontua já o que aconteceu desde o início: a tela abre com a classificação de hoje.
  RETURN fire_processar(p_edicao_id);
END $$;

CREATE OR REPLACE FUNCTION public.fire_encerrar(p_edicao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e fire_edicoes%ROWTYPE;
BEGIN
  SELECT * INTO e FROM fire_edicoes WHERE id = p_edicao_id;
  IF NOT FOUND OR NOT fire_pode_gerir(e.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF e.status <> 'ativa' THEN RAISE EXCEPTION 'edicao_nao_ativa'; END IF;
  PERFORM fire_fechar(p_edicao_id);
END $$;

CREATE OR REPLACE FUNCTION public.fire_salvar_desafio(p_edicao_id uuid, p_descricao text, p_evento text, p_quantidade int, p_desde date, p_prazo date, p_pontos int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e fire_edicoes%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO e FROM fire_edicoes WHERE id = p_edicao_id;
  IF NOT FOUND OR NOT fire_pode_gerir(e.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF e.status = 'encerrada' THEN RAISE EXCEPTION 'edicao_encerrada'; END IF;
  IF p_desde IS NULL OR p_prazo IS NULL OR p_desde < e.inicio OR p_prazo > e.fim OR p_desde > p_prazo THEN
    RAISE EXCEPTION 'prazo_fora_da_edicao';
  END IF;
  INSERT INTO fire_desafios (edicao_id, descricao, condicao, pontos, prazo)
  VALUES (p_edicao_id, btrim(p_descricao),
          jsonb_build_object('evento', p_evento, 'quantidade', p_quantidade, 'desde', p_desde), p_pontos, p_prazo)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Desafio que alguém já cumpriu não sai: o ponto dele aponta para ele.
CREATE OR REPLACE FUNCTION public.fire_remover_desafio(p_desafio_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e fire_edicoes%ROWTYPE;
BEGIN
  SELECT ed.* INTO e FROM fire_desafios d JOIN fire_edicoes ed ON ed.id = d.edicao_id WHERE d.id = p_desafio_id;
  IF NOT FOUND OR NOT fire_pode_gerir(e.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF EXISTS (SELECT 1 FROM fire_pontos p WHERE p.edicao_id = e.id AND p.evento = 'desafio'
               AND split_part(p.origem_id, ':', 2) = p_desafio_id::text) THEN
    RAISE EXCEPTION 'desafio_ja_pontuou';
  END IF;
  IF e.status = 'encerrada' THEN RAISE EXCEPTION 'edicao_encerrada'; END IF;
  DELETE FROM fire_desafios WHERE id = p_desafio_id;
END $$;

-- Ponto errado não se apaga: estorna, com motivo, e o estorno fica no log.
CREATE OR REPLACE FUNCTION public.fire_estornar(p_ponto_id uuid, p_motivo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o fire_pontos%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO o FROM fire_pontos WHERE id = p_ponto_id;
  IF NOT FOUND OR NOT fire_pode_gerir(o.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF o.estorno_de IS NOT NULL THEN RAISE EXCEPTION 'estorno_nao_se_estorna'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
  INSERT INTO fire_pontos (tenant_id, edicao_id, user_id, team_id, atuacao, evento, origem_tipo, origem_id, lead_id,
                           pontos, data, estorno_de, estorno_motivo, estornado_por)
  VALUES (o.tenant_id, o.edicao_id, o.user_id, o.team_id, o.atuacao, o.evento, o.origem_tipo, o.origem_id, o.lead_id,
          -o.pontos, now(), o.id, btrim(p_motivo), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ------------------------------------------------------------
-- O que a casa vê
-- ------------------------------------------------------------
-- Painel: edições, a escolhida (ou a ativa, ou a última), a pontuação, os
-- desafios, a classificação e os recordes. Toda a casa vê — é campanha.
CREATE OR REPLACE FUNCTION public.fire_painel(p_tenant_id uuid, p_edicao_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  e fire_edicoes%ROWTYPE;
BEGIN
  IF NOT (coalesce(public.is_platform_owner(), false)
          OR EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  SELECT * INTO e FROM fire_edicoes ed
   WHERE ed.tenant_id = p_tenant_id AND (p_edicao_id IS NULL OR ed.id = p_edicao_id)
     AND (p_edicao_id IS NOT NULL OR ed.status <> 'rascunho' OR fire_pode_gerir(p_tenant_id))
   ORDER BY (ed.status = 'ativa') DESC, ed.inicio DESC LIMIT 1;

  RETURN jsonb_build_object(
    'pode_gerir', fire_pode_gerir(p_tenant_id),
    'eu', v_uid,
    'edicoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'inicio', x.inicio, 'fim', x.fim, 'status', x.status)
                   ORDER BY x.inicio DESC), '[]'::jsonb)
                  FROM fire_edicoes x WHERE x.tenant_id = p_tenant_id
                   AND (x.status <> 'rascunho' OR fire_pode_gerir(p_tenant_id))),
    'edicao', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', e.id, 'nome', e.nome, 'inicio', e.inicio, 'fim', e.fim, 'status', e.status,
        'processado_em', e.processado_em, 'encerrada_em', e.encerrada_em,
        'pontuacao', (SELECT jsonb_object_agg(pa.atuacao, pa.pts) FROM (
                        SELECT pt.atuacao, jsonb_object_agg(pt.evento, pt.pontos) AS pts
                          FROM fire_pontuacoes pt WHERE pt.edicao_id = e.id GROUP BY pt.atuacao) pa),
        'desafios', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', d.id, 'descricao', d.descricao, 'evento', d.condicao->>'evento',
                        'quantidade', (d.condicao->>'quantidade')::int, 'desde', d.condicao->>'desde',
                        'prazo', d.prazo, 'pontos', d.pontos,
                        'cumpriram', (SELECT count(*) FROM fire_pontos p WHERE p.edicao_id = e.id AND p.evento = 'desafio'
                                        AND p.estorno_de IS NULL AND split_part(p.origem_id, ':', 2) = d.id::text))
                      ORDER BY d.prazo, d.criado_em), '[]'::jsonb)
                       FROM fire_desafios d WHERE d.edicao_id = e.id),
        -- Encerrada: a classificação gravada no fechamento, como ficou.
        'classificacao', CASE WHEN e.status = 'encerrada' THEN e.classificacao_final ELSE fire_classificacao(e.id) END,
        'sem_atuacao', (SELECT coalesce(jsonb_agg(m.nome ORDER BY m.nome), '[]'::jsonb)
                          FROM fire_membros(p_tenant_id) m WHERE m.atuacao IS NULL)
      ) END,
    'recordes', fire_recordes(p_tenant_id)
  );
END $$;

-- Recordes da casa, calculados — não guardados.
CREATE OR REPLACE FUNCTION public.fire_recordes(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH nomes AS (
    SELECT u.id, coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) AS nome FROM auth.users u
  ),
  vgc_mes AS (
    SELECT v.agent_user_id AS user_id, date_trunc('month', v.data_assinatura)::date AS periodo, sum(v.vgc) AS valor
      FROM vendas_assinadas v WHERE v.tenant_id = p_tenant_id AND v.agent_user_id IS NOT NULL
     GROUP BY 1, 2 ORDER BY 3 DESC, 2 LIMIT 1
  ),
  maior_venda AS (
    SELECT v.agent_user_id AS user_id, v.data_assinatura AS periodo, v.vgv AS valor
      FROM vendas_assinadas v WHERE v.tenant_id = p_tenant_id AND v.agent_user_id IS NOT NULL
     ORDER BY v.vgv DESC, v.data_assinatura LIMIT 1
  ),
  visitas_semana AS (
    SELECT x.user_id, date_trunc('week', x.dia)::date AS periodo, count(DISTINCT x.chave) AS valor
      FROM visitas_realizadas(p_tenant_id, '2000-01-01', hoje_sp()) x
     GROUP BY 1, 2 ORDER BY 3 DESC, 2 LIMIT 1
  ),
  todos AS (
    SELECT 'vgc_mes' AS tipo, * FROM vgc_mes
    UNION ALL SELECT 'maior_venda', * FROM maior_venda
    UNION ALL SELECT 'visitas_semana', * FROM visitas_semana
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'user_id', t.user_id, 'nome', n.nome, 'valor', t.valor, 'periodo', t.periodo,
           'edicao', (SELECT ed.nome FROM fire_edicoes ed WHERE ed.tenant_id = p_tenant_id AND ed.status <> 'rascunho'
                        AND t.periodo BETWEEN ed.inicio AND ed.fim ORDER BY ed.inicio DESC LIMIT 1))
         ORDER BY t.tipo), '[]'::jsonb)
    FROM todos t LEFT JOIN nomes n ON n.id = t.user_id
$$;

-- O extrato de uma pessoa: cada ponto, de onde veio, quando — e os estornos.
-- A pessoa vê o seu; a diretoria vê de todos; o líder, da equipe dele.
CREATE OR REPLACE FUNCTION public.fire_extrato(p_edicao_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := (SELECT tenant_id FROM fire_edicoes WHERE id = p_edicao_id);
BEGIN
  IF v_tenant IS NULL OR NOT (
       p_user_id = v_uid
    OR fire_pode_gerir(v_tenant)
    OR EXISTS (SELECT 1 FROM tenant_memberships tm JOIN teams lt ON lt.id = tm.team_id
                WHERE tm.tenant_id = v_tenant AND tm.user_id = p_user_id
                  AND (lt.leader_user_id = v_uid OR v_uid = ANY (lt.leader_user_ids)))) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'evento', p.evento, 'origem_tipo', p.origem_tipo, 'origem_id', p.origem_id, 'lead_id', p.lead_id,
      'pontos', p.pontos, 'data', p.data, 'estorno_de', p.estorno_de, 'estorno_motivo', p.estorno_motivo,
      'estornado', EXISTS (SELECT 1 FROM fire_pontos s WHERE s.estorno_de = p.id),
      'descricao', CASE p.origem_tipo
          WHEN 'imovel' THEN (SELECT 'Imóvel ' || coalesce(i.codigo_imovel, '') FROM imoveis_locais i WHERE i.id::text = p.origem_id)
          WHEN 'desafio' THEN (SELECT d.descricao FROM fire_desafios d WHERE d.id::text = split_part(p.origem_id, ':', 2))
          WHEN 'visita' THEN coalesce((SELECT l.name FROM leads l WHERE l.id = p.lead_id),
                                      (SELECT a.titulo FROM agenda_eventos a
                                        WHERE 'agenda:' || a.id::text = substr(p.origem_id, position(':' in p.origem_id) + 1)))
          ELSE (SELECT l.name FROM leads l WHERE l.id = p.lead_id)
        END)
    ORDER BY p.data DESC, p.criado_em DESC), '[]'::jsonb)
    FROM fire_pontos p WHERE p.edicao_id = p_edicao_id AND p.user_id = p_user_id);
END $$;

REVOKE ALL ON FUNCTION public.fire_recordes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_salvar_edicao(uuid, uuid, text, date, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_excluir_edicao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_ativar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_encerrar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_salvar_desafio(uuid, text, text, int, date, date, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_remover_desafio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_estornar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_painel(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fire_extrato(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fire_salvar_edicao(uuid, uuid, text, date, date, jsonb),
                          public.fire_excluir_edicao(uuid), public.fire_ativar(uuid), public.fire_encerrar(uuid),
                          public.fire_salvar_desafio(uuid, text, text, int, date, date, int), public.fire_remover_desafio(uuid),
                          public.fire_estornar(uuid, text), public.fire_painel(uuid, uuid), public.fire_extrato(uuid, uuid)
  TO authenticated, service_role;

-- A cada 10 minutos: pontua as ativas e fecha a que passou do fim.
SELECT cron.unschedule('fire-processar') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fire-processar');
SELECT cron.schedule('fire-processar', '*/10 * * * *', $$ SELECT public.fire_processar_ativas(); $$);

NOTIFY pgrst, 'reload schema';
