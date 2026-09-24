-- ============================================================
-- Só a diretoria e o gerente redistribuem lead.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/so_gestor_redistribui_lead.test.sql
--
-- Os casos 4 e 5 são os que sustentam o arquivo, e por motivos opostos:
-- o 4 prova que o corretor é BARRADO ao puxar o lead do colega; o 5 prova
-- que ele NÃO foi barrado ao pegar do bolsão — que é o botão que 14 pessoas
-- usam todo dia, e que um bloqueio apressado quebraria.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '2b0d0000-0000-4000-a000-000000000001';
  u_admin uuid := '2b0d1111-0000-4000-a000-000000000001';
  u_lider uuid := '2b0d1111-0000-4000-a000-000000000002';
  u_ana   uuid := '2b0d1111-0000-4000-a000-000000000003';
  u_bruno uuid := '2b0d1111-0000-4000-a000-000000000004';
  lead_ana   uuid := '2b0d2222-0000-4000-a000-000000000001';
  lead_livre uuid := '2b0d2222-0000-4000-a000-000000000002';
  dono text;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa,'teste-redistrib','Casa')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES
    (u_admin,'admin@teste.local'), (u_lider,'lider@teste.local'),
    (u_ana,'ana@teste.local'),     (u_bruno,'bruno@teste.local')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa,u_admin,'admin'), (casa,u_lider,'team_leader'),
    (casa,u_ana,'corretor'), (casa,u_bruno,'corretor');

  -- Um lead da Ana, e um sem dono (o bolsão).
  INSERT INTO leads (id, tenant_id, name, assigned_agent_id, assigned_agent_name) VALUES
    (lead_ana,   casa, 'Cliente da Ana', u_ana::text, 'Ana'),
    (lead_livre, casa, 'Cliente sem dono', NULL, NULL);

  -- ----------------------------------------------------------
  -- 1. O SERVIDOR CONTINUA DISTRIBUINDO
  --
  -- Roleta, bolsão e LIA falam sem JWT. Sem esta porta, a distribuição
  -- automática inteira para — e o sintoma seria "os leads pararam de chegar
  -- nos corretores", dias depois, sem ninguém ligar ao guarda novo.
  -- ----------------------------------------------------------
  UPDATE leads SET assigned_agent_id = u_bruno::text, assigned_agent_name = 'Bruno'
   WHERE id = lead_ana;
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_ana;
  IF lower(dono) IS DISTINCT FROM u_bruno::text THEN
    RAISE EXCEPTION 'FALHOU 1: o servidor não conseguiu redistribuir (dono ficou %)', dono;
  END IF;
  -- devolve para a Ana, que é o estado dos próximos casos
  UPDATE leads SET assigned_agent_id = u_ana::text, assigned_agent_name = 'Ana' WHERE id = lead_ana;
  RAISE NOTICE 'OK 1: o servidor (sem JWT) continua distribuindo';

  -- ----------------------------------------------------------
  -- 2. O ADMIN REDISTRIBUI — a Diretoria do print
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);
  UPDATE leads SET assigned_agent_id = u_bruno::text, assigned_agent_name='Bruno' WHERE id = lead_ana;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_ana;
  IF lower(dono) IS DISTINCT FROM u_bruno::text THEN
    RAISE EXCEPTION 'FALHOU 2: o admin não redistribuiu';
  END IF;
  RAISE NOTICE 'OK 2: a Diretoria redistribui';

  -- ----------------------------------------------------------
  -- 3. O LÍDER REDISTRIBUI — o Gerente do print
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_lider, 'role','authenticated')::text, true);
  UPDATE leads SET assigned_agent_id = u_ana::text, assigned_agent_name='Ana' WHERE id = lead_ana;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_ana;
  IF lower(dono) IS DISTINCT FROM u_ana::text THEN
    RAISE EXCEPTION 'FALHOU 3: o gerente não redistribuiu';
  END IF;
  RAISE NOTICE 'OK 3: o Gerente redistribui';

  -- ----------------------------------------------------------
  -- 4. O CORRETOR NÃO TIRA O LEAD DO COLEGA
  --
  -- É o caso que o print pede, e o que hoje NÃO existe: a regra de escrita em
  -- `leads` exige só "é da mesma imobiliária".
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_bruno, 'role','authenticated')::text, true);
  BEGIN
    UPDATE leads SET assigned_agent_id = u_bruno::text, assigned_agent_name='Bruno'
     WHERE id = lead_ana;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'FALHOU 4: o Bruno puxou o lead da Ana';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_ana;
  IF lower(dono) IS DISTINCT FROM u_ana::text THEN
    RAISE EXCEPTION 'FALHOU 4: o lead mudou de dono mesmo com o erro (ficou %)', dono;
  END IF;
  RAISE NOTICE 'OK 4: o corretor não tira o lead do colega, e o dono não muda';

  -- E também não empurra o lead do colega para um terceiro.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_bruno, 'role','authenticated')::text, true);
  BEGIN
    UPDATE leads SET assigned_agent_id = u_lider::text WHERE id = lead_ana;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'FALHOU 4b: o corretor empurrou o lead alheio para um terceiro';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;
  RAISE NOTICE 'OK 4b: nem para um terceiro';

  -- ----------------------------------------------------------
  -- 5. O CORRETOR PEGA LEAD SEM DONO — O BOLSÃO
  --
  -- ESTE É O CASO QUE IMPEDE A CORREÇÃO DE QUEBRAR A CASA.
  --
  -- `BolsaoSection.tsx` escreve `assigned_agent_id = <o próprio usuário>` pela
  -- sessão do corretor. Um bloqueio que olhasse só "mudou a atribuição?"
  -- derrubaria o botão "Assumir lead" para os 14 corretores — e o print dá
  -- isso a eles, na linha "ver e atender os próprios leads".
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_bruno, 'role','authenticated')::text, true);
  UPDATE leads SET assigned_agent_id = u_bruno::text, assigned_agent_name='Bruno'
   WHERE id = lead_livre;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_livre;
  IF lower(dono) IS DISTINCT FROM u_bruno::text THEN
    RAISE EXCEPTION 'FALHOU 5: o corretor não conseguiu pegar lead do bolsão';
  END IF;
  RAISE NOTICE 'OK 5: o corretor pega lead sem dono (o bolsão continua de pé)';

  -- ----------------------------------------------------------
  -- 6. MAS NÃO PEGA PARA OUTRA PESSOA
  --
  -- Sem este caso, o 5 poderia passar com uma regra frouxa do tipo "lead sem
  -- dono, qualquer um atribui" — e aí o corretor distribuiria a fila.
  -- ----------------------------------------------------------
  UPDATE leads SET assigned_agent_id = NULL, assigned_agent_name = NULL WHERE id = lead_livre;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_bruno, 'role','authenticated')::text, true);
  BEGIN
    UPDATE leads SET assigned_agent_id = u_ana::text WHERE id = lead_livre;
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'FALHOU 6: o corretor atribuiu um lead livre para outra pessoa';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;
  RAISE NOTICE 'OK 6: pegar é só para si';

  -- ----------------------------------------------------------
  -- 7. O CORRETOR DEVOLVE O PRÓPRIO LEAD
  --
  -- Devolver para a fila não é redistribuir entre corretores. Trancar isso
  -- quebraria um botão que eu não rastreei — e o print não pede.
  -- ----------------------------------------------------------
  UPDATE leads SET assigned_agent_id = u_bruno::text, assigned_agent_name='Bruno' WHERE id = lead_livre;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_bruno, 'role','authenticated')::text, true);
  UPDATE leads SET assigned_agent_id = NULL, assigned_agent_name = NULL WHERE id = lead_livre;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT assigned_agent_id INTO dono FROM leads WHERE id = lead_livre;
  IF dono IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 7: o corretor não conseguiu devolver o próprio lead';
  END IF;
  RAISE NOTICE 'OK 7: o corretor devolve o próprio lead para a fila';

  -- ----------------------------------------------------------
  -- 8. O CORRETOR CONTINUA TRABALHANDO O LEAD DELE
  --
  -- O guarda é de UMA COLUNA. Se ele tivesse virado policy, teria levado o
  -- trabalho junto: status, comentário, visita — tudo o que o corretor faz no
  -- próprio lead o dia inteiro.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ana, 'role','authenticated')::text, true);
  UPDATE leads SET status = 'Em Atendimento', comments = 'liguei hoje' WHERE id = lead_ana;
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF (SELECT status FROM leads WHERE id = lead_ana) IS DISTINCT FROM 'Em Atendimento' THEN
    RAISE EXCEPTION 'FALHOU 8: o corretor não consegue mais trabalhar o próprio lead';
  END IF;
  RAISE NOTICE 'OK 8: o corretor edita o lead dele normalmente';
END $$;

ROLLBACK;
