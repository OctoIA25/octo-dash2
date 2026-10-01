-- ============================================================
-- A.4 · O placar contava a Lia e a conta de teste como corretor — 01/10
--
-- Na Lotus, "Sem equipe" mostrava "0 de 4 lançaram". Dois dos quatro não são
-- gente: a Lia (o assistente de IA, membership `corretor`) e a victorteste
-- (conta de teste). A Lia nunca vai lançar meta, então a equipe nunca
-- chegaria a "4 de 4". O certo é "0 de 2" (Claudio e Danilo).
--
-- COMO SE RECONHECE CADA UMA — pela marca no cadastro, nunca pelo nome ou id:
--   Lia   → permissions.lead_limit.motivo = 'assistente-ia' (a marca que
--           usuario_assistente_ia já lê; 20260928_com_a_lia_quando_a_dona_e_a_lia).
--           Lida direto, não pela função: a função devolve UMA conta (LIMIT 1),
--           e aqui tem que sair toda conta de assistente.
--   teste → permissions.conta_de_teste = true, marca nova. A tela de edição do
--           membro preserva chave que não conhece (`...editingMember.permissions`),
--           então a marca sobrevive quando alguém salvar o cadastro.
--
-- Só o placar muda. A victorteste segue recebendo comunicado (é a conta de
-- teste do A.2) e segue entrando no Meu dia dela.
-- ============================================================

BEGIN;

-- A marca da conta de teste. Por e-mail porque é um conserto de dado de uma
-- conta só; a regra abaixo lê a marca, não o e-mail.
UPDATE public.tenant_memberships tm
   SET permissions = coalesce(tm.permissions, '{}'::jsonb) || '{"conta_de_teste": true}'::jsonb
  FROM auth.users u
 WHERE u.id = tm.user_id AND lower(u.email) = 'victorteste@gmail.com';

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
         -- Só gente: sem o assistente de IA e sem conta de teste.
         AND tm.permissions -> 'lead_limit' ->> 'motivo' IS DISTINCT FROM 'assistente-ia'
         AND tm.permissions -> 'conta_de_teste' IS DISTINCT FROM 'true'::jsonb
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

COMMIT;
