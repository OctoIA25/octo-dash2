-- ============================================================
-- Flags, Fire e Universidade contavam a Lia e a conta de teste — 01/10
--
-- O mesmo defeito do placar (20261015): as telas que listam "quem vende"
-- só tiravam a conta dona da plataforma. Na Lotus entravam também a Lia (o
-- assistente de IA, membership `corretor`) e a victorteste (conta de teste):
--   Flags        → as duas na lista do mês e no fechamento (flag_snapshots);
--   Fire         → a victorteste pontuaria e entraria na classificação; a
--                  Lia aparecia em "sem atuação", como se faltasse cadastro;
--   Universidade → as duas no painel do curso e na lista de quem recebe trilha.
--
-- UMA REGRA, CINCO LEITORES
-- A pergunta "esta conta é de uma pessoa?" passa a morar em conta_de_pessoa.
-- O placar, que ganhou a regra copiada ontem, passa a ler daqui também:
-- cinco cópias divergiriam no primeiro caso de borda.
--
-- Fora daqui, de propósito: Comunicados e o aviso de curso obrigatório.
-- A victorteste é a destinatária de teste do A.2 e tem que continuar recebendo.
-- ============================================================

BEGIN;

-- Conta de pessoa: não é a conta dona da plataforma, não é assistente de IA
-- (a marca que usuario_assistente_ia lê) e não é conta de teste.
CREATE OR REPLACE FUNCTION public.conta_de_pessoa(p_email text, p_permissions jsonb) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.platform_owners po WHERE po.email = lower(p_email))
     AND p_permissions -> 'lead_limit' ->> 'motivo' IS DISTINCT FROM 'assistente-ia'
     AND p_permissions -> 'conta_de_teste' IS DISTINCT FROM 'true'::jsonb
$$;
REVOKE ALL ON FUNCTION public.conta_de_pessoa(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- A.4 · Placar de metas diárias
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
         AND conta_de_pessoa(u.email, tm.permissions)
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

-- ------------------------------------------------------------
-- A.3 · Flags (a tela e o fechamento do mês)
-- ------------------------------------------------------------
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
       AND conta_de_pessoa(u.email, tm.permissions)
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

-- ------------------------------------------------------------
-- A.6 · Fire (pontuação, classificação e "sem atuação")
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fire_membros(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, team_id uuid, atuacao text, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT tm.user_id, tm.team_id, public.atuacao_da_flag(tm.permissions->'atuacao'),
         coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email)
    FROM tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
     AND conta_de_pessoa(u.email, tm.permissions)
$$;

-- ------------------------------------------------------------
-- A.7 · Universidade (painel do curso e lista da trilha)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.curso_painel(p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c cursos%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_c FROM cursos WHERE id = p_curso_id;
  IF v_c.id IS NULL OR NOT (public.materiais_pode_gerir(v_c.tenant_id)
       OR EXISTS (SELECT 1 FROM teams lt WHERE lt.tenant_id = v_c.tenant_id AND (lt.leader_user_id = v_uid OR v_uid = ANY (lt.leader_user_ids)))) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  -- Quem não abriu primeiro: é a lista em que o gestor age.
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY CASE x->>'situacao' WHEN 'nao_abriu' THEN 0 WHEN 'no_meio' THEN 1 ELSE 2 END, x->>'nome'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
             'user_id', tm.user_id, 'nome', coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email),
             'equipe', coalesce(t.name, 'Sem equipe'), 'obrigatorio', coalesce(tm.cargo_id = ANY (v_c.obrigatorio_para), false))
           || situacao_no_curso(v_c.id, tm.user_id) AS x
      FROM tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
      LEFT JOIN teams t ON t.id = tm.team_id
     WHERE tm.tenant_id = v_c.tenant_id AND tm.role IN ('corretor', 'team_leader')
       AND conta_de_pessoa(u.email, tm.permissions)
       AND universidade_gere_pessoa(v_c.tenant_id, tm.user_id)) s);
END $$;

CREATE OR REPLACE FUNCTION public.trilha_pessoas(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', tm.user_id, 'nome', coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email),
           'equipe', coalesce(t.name, 'Sem equipe')) ORDER BY coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email)), '[]'::jsonb)
    FROM tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id LEFT JOIN teams t ON t.id = tm.team_id
   WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
     AND conta_de_pessoa(u.email, tm.permissions)
     AND tm.user_id <> auth.uid()
     AND universidade_gere_pessoa(p_tenant_id, tm.user_id)
$$;

COMMIT;
