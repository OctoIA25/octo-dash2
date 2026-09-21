-- Testes de 20260916_lead_toques_aviso_e_atraso.sql: aviso na hora do próximo
-- toque (cron avisar_proximos_toques).
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra o
-- banco real depois da migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lead_toques_aviso_e_atraso.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.
-- Notificação criada aqui não chega ao sininho: o realtime só publica o que é
-- commitado.
--
-- Fixtures: tenant "Área de Teste" e o usuário e2e.gestor@octo.dev (membro dele).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

-- O tenant da fixture existe em produção, e não num banco recém-levantado. O
-- teste o cria aqui dentro do BEGIN/ROLLBACK: assim ele roda em qualquer banco
-- e não depende do que o dump trouxe junto.
INSERT INTO tenants (id, code, name)
VALUES ('e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'area-de-teste', 'Área de Teste')
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid AS tenant,
  'ff771163-b597-4c29-a030-044dbe013f93'::uuid AS usuario,
  'c0bfb1a4-2a6c-48bd-bfd9-7be4d5663f83'::text AS lead_vencido,
  '5ad29789-99e9-4e74-9bf1-925de8fa2a2f'::text AS lead_substituido,
  '738e518a-108b-40c5-8eab-cf3b019fe183'::text AS lead_futuro,
  '6da37bb2-ff89-4813-a5ae-e8a484549e75'::text AS lead_arquivado;

-- O aviso exige membership (quem saiu não recebe) e o lead de verdade (o
-- arquivado não recebe). Sem estas linhas o laço não acha nada e o teste
-- passaria a medir o vazio em vez da regra.
INSERT INTO auth.users (id, email)
SELECT usuario, 'e2e@teste.dev' FROM fx ON CONFLICT DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
SELECT tenant, usuario, 'corretor' FROM fx ON CONFLICT DO NOTHING;
INSERT INTO public.leads (id, tenant_id, name)
SELECT v.id::uuid, fx.tenant, v.nome
  FROM fx, (VALUES
    ('c0bfb1a4-2a6c-48bd-bfd9-7be4d5663f83', 'Lead Vencido'),
    ('5ad29789-99e9-4e74-9bf1-925de8fa2a2f', 'Lead Substituído'),
    ('738e518a-108b-40c5-8eab-cf3b019fe183', 'Lead Futuro'),
    ('6da37bb2-ff89-4813-a5ae-e8a484549e75', 'Lead Arquivado')
  ) AS v(id, nome)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.toque(p_lead text, p_executado timestamptz, p_proximo timestamptz) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.lead_toques
    (tenant_id, lead_id, lead_source, canal, resultado, executado_em, proximo_toque_em, executado_por, executado_por_nome)
  SELECT tenant, p_lead, 'leads', 'ligacao', 'nao_respondeu', p_executado, p_proximo, usuario, 'E2E'
    FROM fx
  RETURNING id
$$;

CREATE FUNCTION pg_temp.avisos(p_toque uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications
   WHERE type = 'cadencia_toque' AND metadata->>'toque_id' = p_toque::text
$$;

DO $$
DECLARE
  v_vencido     uuid;
  v_antigo      uuid;
  v_futuro      uuid;
  v_arquivado   uuid;
  v_notif       public.notifications%ROWTYPE;
BEGIN
  -- Cenário: marcou o próximo toque para 2h atrás e não registrou nada depois.
  v_vencido := pg_temp.toque((SELECT lead_vencido FROM fx), now() - interval '1 day', now() - interval '2 hours');
  -- Marcou para 3h atrás, mas registrou um toque novo (sem próximo) depois.
  v_antigo := pg_temp.toque((SELECT lead_substituido FROM fx), now() - interval '5 hours', now() - interval '3 hours');
  PERFORM pg_temp.toque((SELECT lead_substituido FROM fx), now() - interval '4 hours', NULL);
  -- Marcou para daqui a 1 dia.
  v_futuro := pg_temp.toque((SELECT lead_futuro FROM fx), now() - interval '1 hour', now() + interval '1 day');
  -- Lead arquivado com compromisso vencido.
  v_arquivado := pg_temp.toque((SELECT lead_arquivado FROM fx), now() - interval '1 day', now() - interval '2 hours');
  UPDATE public.leads SET archived_at = now() WHERE id = (SELECT lead_arquivado FROM fx)::uuid;

  PERFORM public.avisar_proximos_toques();

  PERFORM pg_temp.checa(pg_temp.avisos(v_vencido) = 1, 'compromisso vencido gera 1 aviso');
  SELECT * INTO v_notif FROM public.notifications
   WHERE type = 'cadencia_toque' AND metadata->>'toque_id' = v_vencido::text;
  PERFORM pg_temp.checa(v_notif.user_id = (SELECT usuario FROM fx), 'aviso vai para quem registrou o toque');
  PERFORM pg_temp.checa(v_notif.link_type = 'lead' AND v_notif.link_id = (SELECT lead_vencido FROM fx), 'aviso aponta para o lead');
  PERFORM pg_temp.checa(v_notif.title = 'Hora do próximo toque', 'título do aviso');
  PERFORM pg_temp.checa(
    (SELECT proximo_avisado_em IS NOT NULL FROM public.lead_toques WHERE id = v_vencido),
    'marca proximo_avisado_em');

  PERFORM pg_temp.checa(pg_temp.avisos(v_antigo) = 0, 'toque substituído por um mais novo não avisa');
  PERFORM pg_temp.checa(pg_temp.avisos(v_futuro) = 0, 'próximo toque no futuro não avisa');
  PERFORM pg_temp.checa(pg_temp.avisos(v_arquivado) = 0, 'lead arquivado não avisa');

  PERFORM public.avisar_proximos_toques();
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencido) = 1, 'segunda rodada não duplica o aviso');

  RAISE NOTICE 'OK — lead_toques_aviso_e_atraso: todos os casos passaram';
END $$;

ROLLBACK;
