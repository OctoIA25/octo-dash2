-- ============================================================
-- Os cargos do print, mais o Jurídico (item 8).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/os_cargos.test.sql
--
-- O caso 4 é o que sustenta o arquivo: um cargo "Financeiro" que mostra o
-- menu e abre uma tela vazia é pior que não ter cargo nenhum — é a promessa
-- sem a entrega, e ninguém recebe erro para reclamar.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '2a0c0000-0000-4000-a000-000000000001';
  pobre   uuid := '2a0c0000-0000-4000-a000-000000000002';
  vazia   uuid := '2a0c0000-0000-4000-a000-000000000003';
  u_fin   uuid := '2a0c1111-0000-4000-a000-000000000001';
  u_atend uuid := '2a0c1111-0000-4000-a000-000000000002';
  c_fin   uuid;
  c_atend uuid;
  n int;
BEGIN
  -- Uma casa completa, uma que contratou pouco, e uma sem ninguém dentro.
  INSERT INTO tenants (id, code, name, allowed_features) VALUES
    (casa,  'teste-cargo-a', 'Casa',    '["leads","notificacoes","metricas","juridico","estudo-mercado","gestao-equipe","imoveis","chat","octo-chat","metas","excel","relatorios","central-leads","financeiro"]'::jsonb),
    (pobre, 'teste-cargo-b', 'Pequena', '["leads","notificacoes"]'::jsonb),
    (vazia, 'teste-cargo-c', 'Vazia',   '["leads","notificacoes","financeiro"]'::jsonb);

  INSERT INTO auth.users (id, email) VALUES
    (u_fin,   'financeiro@teste.local'),
    (u_atend, 'atendimento@teste.local')
  ON CONFLICT DO NOTHING;

  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, u_fin, 'corretor'),
    (casa, u_atend, 'corretor');
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (pobre, u_fin, 'corretor');

  -- Reaplica a semeadura da migração sobre estas três casas.
  WITH modelo(nome, descricao, nivel, role, abas) AS (
    VALUES
      ('Diretoria', '', 100, 'admin', ARRAY[]::text[]),
      ('Gerente', '', 70, 'team_leader',
       ARRAY['leads','notificacoes','metricas','juridico','estudo-mercado','gestao-equipe',
             'imoveis','chat','octo-chat','metas','excel','relatorios','central-leads']),
      ('Financeiro', '', 50, 'corretor', ARRAY['financeiro','relatorios','notificacoes','juridico']),
      ('Atendimento', '', 30, 'corretor', ARRAY['leads','notificacoes','chat','octo-chat']),
      ('Corretor', '', 10, 'corretor',
       ARRAY['leads','notificacoes','metricas','juridico','estudo-mercado','imoveis','chat','octo-chat'])
  ), novos AS (
    INSERT INTO public.cargos (tenant_id, nome, descricao, nivel_acesso, role)
    SELECT t.id, m.nome, m.descricao, m.nivel, m.role
      FROM public.tenants t CROSS JOIN modelo m
     WHERE t.id IN (casa, pobre, vazia)
       AND EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = t.id)
    ON CONFLICT DO NOTHING
    RETURNING id, tenant_id, nome
  )
  INSERT INTO public.cargo_permissoes (cargo_id, permissao_codigo)
  SELECT n.id, p.codigo
    FROM novos n
    JOIN modelo m ON m.nome = n.nome
    JOIN public.tenants t ON t.id = n.tenant_id
    JOIN public.permissoes p ON (cardinality(m.abas) = 0 OR p.codigo = ANY (m.abas))
   WHERE p.em_uso AND t.allowed_features @> to_jsonb(p.codigo)
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. OS CINCO NASCEM, COM O PAPEL DE CADA UM
  -- ----------------------------------------------------------
  -- O Jurídico entra na conta desde 24/09: o chefe pediu ("Adicionaria
  -- somente um Jurídico") e a primeira entrega o deixou de fora.
  INSERT INTO public.cargos (tenant_id, nome, descricao, nivel_acesso, role)
  VALUES (casa, 'Jurídico', '', 40, 'corretor') ON CONFLICT DO NOTHING;
  INSERT INTO public.cargo_permissoes (cargo_id, permissao_codigo)
  SELECT c.id, p.codigo FROM cargos c
    JOIN public.permissoes p ON p.codigo IN ('juridico','notificacoes','imoveis')
   WHERE c.tenant_id = casa AND c.nome = 'Jurídico' AND p.em_uso
     AND (SELECT allowed_features FROM tenants WHERE id = casa) @> to_jsonb(p.codigo)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO n FROM cargos WHERE tenant_id = casa;
  IF n <> 6 THEN RAISE EXCEPTION 'FALHOU 1: nasceram % cargos (esperava 6, com o Jurídico)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM cargos WHERE tenant_id = casa AND nome = 'Jurídico') THEN
    RAISE EXCEPTION 'FALHOU 1: o cargo Jurídico não existe — foi pedido com todas as letras';
  END IF;
  IF (SELECT role FROM cargos WHERE tenant_id = casa AND nome = 'Diretoria') <> 'admin' THEN
    RAISE EXCEPTION 'FALHOU 1: Diretoria não é admin';
  END IF;
  IF (SELECT role FROM cargos WHERE tenant_id = casa AND nome = 'Gerente') <> 'team_leader' THEN
    RAISE EXCEPTION 'FALHOU 1: Gerente não é team_leader';
  END IF;
  RAISE NOTICE 'OK 1: os seis cargos, com os papéis certos';

  -- ----------------------------------------------------------
  -- 2. O CARGO NÃO CONCEDE O QUE A CASA NÃO CONTRATOU
  --
  -- A "Pequena" só tem leads e notificações. O cargo Gerente dela não pode
  -- sair com treze abas — prometer na tela de cargos o que o contrato não
  -- cobre é a mesma mentira das permissões inertes.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
    FROM cargo_permissoes cp JOIN cargos c ON c.id = cp.cargo_id
   WHERE c.tenant_id = pobre AND c.nome = 'Gerente';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU 2: o Gerente da casa pequena saiu com % abas (esperava 2)', n;
  END IF;
  RAISE NOTICE 'OK 2: o cargo é recortado pelo que a imobiliária contratou';

  -- ----------------------------------------------------------
  -- 3. NINGUÉM É MOVIDO — A TELA DE TODO MUNDO CONTINUA IGUAL
  --
  -- É a promessa que a migração faz. Sem cargo, o app cai na regra antiga;
  -- com cargo atribuído por engano, o menu de alguém mudaria da noite para o
  -- dia sem ninguém ter decidido.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM tenant_memberships
   WHERE tenant_id IN (casa, pobre) AND cargo_id IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU 3: % membro(s) foram movidos para um cargo', n; END IF;
  RAISE NOTICE 'OK 3: ninguém foi movido; a tela de todos continua como estava';

  -- ----------------------------------------------------------
  -- 4. O CARGO FINANCEIRO ENXERGA O FINANCEIRO DE VERDADE
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  --
  -- Antes desta entrega, `financeiro_pode_ver` exigia admin do tenant. Um
  -- cargo "Financeiro" com papel de corretor mostraria o MENU e abriria uma
  -- tela VAZIA — e a pessoa não receberia erro nenhum para reclamar.
  --
  -- A alternativa seria dar papel de `admin` a quem cuida do dinheiro, o que
  -- abriria junto as outras 61 políticas: apagar lead, mexer em imóvel, gerir
  -- equipe. Por isso o ajuste foi em UMA função, e não no papel.
  -- ----------------------------------------------------------
  SELECT id INTO c_fin FROM cargos WHERE tenant_id = casa AND nome = 'Financeiro';
  UPDATE tenant_memberships SET cargo_id = c_fin
   WHERE tenant_id = casa AND user_id = u_fin;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  IF NOT public.financeiro_pode_ver(casa) THEN
    RAISE EXCEPTION 'FALHOU 4: o cargo Financeiro abre o menu e a tela vem vazia';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 4: o cargo Financeiro lê o financeiro sem virar admin';

  -- E continua NÃO sendo admin: o papel não mudou.
  IF (SELECT role FROM tenant_memberships WHERE tenant_id = casa AND user_id = u_fin) <> 'corretor' THEN
    RAISE EXCEPTION 'FALHOU 4: o cargo Financeiro promoveu a pessoa a admin';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  IF public.is_tenant_admin_or_owner(casa) THEN
    RAISE EXCEPTION 'FALHOU 4: quem tem o cargo Financeiro virou admin do tenant';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 4b: e não ganhou poder de admin em mais nada';

  -- ----------------------------------------------------------
  -- 5. O ATENDIMENTO NÃO ENXERGA O FINANCEIRO
  --
  -- Sem este caso, o 4 sozinho passaria com a função devolvendo `true` para
  -- todo mundo — que é o jeito mais fácil de fazer o 4 passar.
  -- ----------------------------------------------------------
  SELECT id INTO c_atend FROM cargos WHERE tenant_id = casa AND nome = 'Atendimento';
  UPDATE tenant_memberships SET cargo_id = c_atend
   WHERE tenant_id = casa AND user_id = u_atend;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_atend, 'role', 'authenticated')::text, true);
  IF public.financeiro_pode_ver(casa) THEN
    RAISE EXCEPTION 'FALHOU 5: o Atendimento enxergou o financeiro';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 5: o Atendimento não enxerga o financeiro';

  -- ----------------------------------------------------------
  -- 6. A DIRETORIA LEVA TUDO O QUE A CASA CONTRATOU
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
    FROM cargo_permissoes cp JOIN cargos c ON c.id = cp.cargo_id
   WHERE c.tenant_id = casa AND c.nome = 'Diretoria';
  IF n <> (SELECT count(*) FROM permissoes p
            WHERE p.em_uso
              AND (SELECT allowed_features FROM tenants WHERE id = casa) @> to_jsonb(p.codigo)) THEN
    RAISE EXCEPTION 'FALHOU 6: a Diretoria não levou tudo (veio %)', n;
  END IF;
  RAISE NOTICE 'OK 6: a Diretoria leva tudo o que a casa contratou';

  -- ----------------------------------------------------------
  -- 7. CASA SEM NINGUÉM NÃO GANHA CARGO
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM cargos WHERE tenant_id = vazia;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU 7: a casa vazia ganhou % cargos', n; END IF;
  RAISE NOTICE 'OK 7: imobiliária sem gente não ganha cargo';
END $$;

ROLLBACK;
