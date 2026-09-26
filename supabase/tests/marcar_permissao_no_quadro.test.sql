-- ============================================================
-- Marcar permissão direto no quadro de Cargos — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/marcar_permissao_no_quadro.test.sql
--
-- O quadro passou a gravar no clique. Isso muda a natureza do risco: a gaveta
-- de edição mostra a lista inteira e a pessoa confirma; aqui um clique já
-- escreve, e o próximo vem logo em seguida.
--
-- Os dois casos que sustentam este arquivo são o 3 (dois cliques seguidos não
-- se atropelam) e o 4 (ninguém se tranca para fora). Os dois descrevem
-- estragos que NÃO dão erro na tela — a marca volta sozinha, ou o menu some.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := 'ca9e0000-0000-4000-a000-000000000001';
  u_admin uuid := 'ca9e1111-0000-4000-a000-000000000001';
  u_outro uuid := 'ca9e1111-0000-4000-a000-000000000002';
  u_corr  uuid := 'ca9e1111-0000-4000-a000-000000000003';
  cg_dele uuid;   -- o cargo do próprio administrador
  cg_outro uuid;  -- um cargo em que ele não está
  r jsonb;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-quadro', 'Casa do Quadro')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin, 'admin@quadro.local', '{"name":"Diretoria"}'::jsonb),
    (u_outro, 'outro@quadro.local', '{"name":"Outro Admin"}'::jsonb),
    (u_corr,  'corretor@quadro.local', '{"name":"Corretor"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, u_admin, 'admin'), (casa, u_outro, 'admin'), (casa, u_corr, 'corretor');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  cg_dele  := (public.cargo_salvar(casa, 'Diretoria', '', 100, 'admin',
                 ARRAY['gestao-equipe','leads','imoveis']) ->> 'id')::uuid;
  cg_outro := (public.cargo_salvar(casa, 'Corretor', '', 10, 'corretor',
                 ARRAY['leads']) ->> 'id')::uuid;
  UPDATE tenant_memberships SET cargo_id = cg_dele WHERE tenant_id = casa AND user_id = u_admin;

  -- ----------------------------------------------------------
  -- 1. MARCAR E DESMARCAR UMA CÉLULA
  -- ----------------------------------------------------------
  r := public.cargo_permissao_marcar(cg_outro, 'imoveis', true);
  IF (r ->> 'marcada')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 1: marcar nao marcou — %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cargo_permissoes WHERE cargo_id = cg_outro AND permissao_codigo = 'imoveis') THEN
    RAISE EXCEPTION 'FALHOU 1b: a linha nao entrou na tabela';
  END IF;

  r := public.cargo_permissao_marcar(cg_outro, 'imoveis', false);
  IF (r ->> 'marcada')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 1c: desmarcar nao desmarcou — %', r;
  END IF;
  RAISE NOTICE 'OK 1: a celula marca e desmarca';

  -- ----------------------------------------------------------
  -- 2. CLICAR DUAS VEZES NO MESMO SENTIDO NÃO QUEBRA
  --
  -- Clique duplo, rede lenta, a pessoa insistindo: o segundo "marcar" não
  -- pode estourar por chave duplicada. A tela mostraria um erro vermelho
  -- sobre uma ação que deu certo.
  -- ----------------------------------------------------------
  PERFORM public.cargo_permissao_marcar(cg_outro, 'imoveis', true);
  PERFORM public.cargo_permissao_marcar(cg_outro, 'imoveis', true);
  IF (SELECT count(*) FROM cargo_permissoes WHERE cargo_id = cg_outro AND permissao_codigo = 'imoveis') <> 1 THEN
    RAISE EXCEPTION 'FALHOU 2: marcar duas vezes gerou linha duplicada';
  END IF;
  PERFORM public.cargo_permissao_marcar(cg_outro, 'imoveis', false);
  PERFORM public.cargo_permissao_marcar(cg_outro, 'imoveis', false);
  RAISE NOTICE 'OK 2: repetir o mesmo clique e inofensivo';

  -- ----------------------------------------------------------
  -- 3. DUAS CÉLULAS SEGUIDAS NÃO SE ATROPELAM
  --
  -- ESTE É O MOTIVO DE A FUNÇÃO EXISTIR. Com `cargo_salvar` a tela mandaria
  -- a lista inteira montada sobre o estado que ela tinha em memória: o
  -- segundo clique, saindo antes de a tela recarregar, apagaria o primeiro.
  --
  -- Aqui as duas escritas são independentes, então marcar `metas` não pode
  -- desfazer o `imoveis` marcado um instante antes.
  -- ----------------------------------------------------------
  PERFORM public.cargo_permissao_marcar(cg_outro, 'imoveis', true);
  PERFORM public.cargo_permissao_marcar(cg_outro, 'metas', true);
  IF (SELECT count(*) FROM cargo_permissoes
       WHERE cargo_id = cg_outro AND permissao_codigo IN ('leads','imoveis','metas')) <> 3 THEN
    RAISE EXCEPTION 'FALHOU 3: uma marcacao apagou a outra — sobraram %',
      (SELECT string_agg(permissao_codigo, ',') FROM cargo_permissoes WHERE cargo_id = cg_outro);
  END IF;
  RAISE NOTICE 'OK 3: marcacoes seguidas convivem';

  -- ----------------------------------------------------------
  -- 4. NINGUÉM SE TRANCA PARA FORA — O OUTRO CASO QUE SUSTENTA O ARQUIVO
  --
  -- A tela de Cargos mora atrás de "gestao-equipe". Desmarcar essa célula no
  -- próprio cargo tira o caminho de volta de quem clicou, e a tela não teria
  -- como avisar: o menu simplesmente some no próximo carregamento.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM public.cargo_permissao_marcar(cg_dele, 'gestao-equipe', false);
    RAISE EXCEPTION 'FALHOU 4: o admin desmarcou gestao-equipe do PROPRIO cargo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM cargo_permissoes
                  WHERE cargo_id = cg_dele AND permissao_codigo = 'gestao-equipe') THEN
    RAISE EXCEPTION 'FALHOU 4b: a permissao caiu apesar da recusa';
  END IF;

  -- E a trava é só do PRÓPRIO cargo: tirar de outro cargo é decisão legítima
  -- de quem administra. Travar os dois viraria uma permissão que ninguém
  -- consegue mais mexer.
  PERFORM public.cargo_permissao_marcar(cg_outro, 'gestao-equipe', true);
  PERFORM public.cargo_permissao_marcar(cg_outro, 'gestao-equipe', false);
  RAISE NOTICE 'OK 4: o proprio cargo e protegido, os outros nao';

  -- ----------------------------------------------------------
  -- 5. PERMISSÃO FORA DO CATÁLOGO NÃO ENTRA
  --
  -- Aceitar criaria uma chave que nenhuma tela lê — um interruptor que não
  -- liga nada, que é o defeito que o P4.1 veio desfazer.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM public.cargo_permissao_marcar(cg_outro, 'permissao_inventada', true);
    RAISE EXCEPTION 'FALHOU 5: o banco aceitou permissao fora do catalogo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 5: so o catalogo entra';

  -- ----------------------------------------------------------
  -- 6. O CORRETOR NÃO MARCA NADA
  --
  -- O porteiro está no BANCO, não na tela: `cargos` e `cargo_permissoes` não
  -- têm grant para o navegador, então esta função é o único caminho — e ela
  -- precisa recusar sozinha.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_corr, 'role', 'authenticated')::text, true);
  IF public.cargo_permissao_marcar(cg_outro, 'metas', false) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6: o corretor marcou permissao';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cargo_permissoes WHERE cargo_id = cg_outro AND permissao_codigo = 'metas') THEN
    RAISE EXCEPTION 'FALHOU 6b: a recusa devolveu nulo mas apagou a linha';
  END IF;

  -- Cargo de outra imobiliária não existe para quem pergunta.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_outro, 'role', 'authenticated')::text, true);
  IF public.cargo_permissao_marcar('00000000-0000-4000-a000-0000000000ff', 'leads', true) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6c: cargo inexistente devolveu resposta';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: so quem administra marca, e so na propria casa';
END $$;

ROLLBACK;
