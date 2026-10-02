-- ============================================================
-- Correções de DADO pedidas pelo Erick em 01/10 — só a Lotus.
--
-- Não muda esquema nem função. Roda numa transação e termina conferindo o
-- que mudou: se a contagem não bater com a medida em 01/10, aborta tudo.
--
-- 1. As vendas do André na planilha estavam como
--    "Tropa (contrato anterior a transição)". O Erick: "colocar estes do
--    Andre como Senior (50%). Não usar nomenclaturas antigas". Vira o nível
--    do cadastro, 'senior', e a tela escreve "Sênior (50%)". A coluna `tipo`
--    da planilha só é exibida — nenhuma conta lê dela (conferido em 01/10).
--
-- 2. Um nome por pessoa na planilha. "Andre" e "André Marcondes" eram duas
--    linhas para a mesma pessoa; o mesmo com Fernanda, Flávia, Humberto, Gabi
--    e Gabrielle. O apelido vira o nome do cadastro, pelo de-para que já
--    existe (`planilha_corretor_de_para`) — só onde ele aponta UMA pessoa
--    inteira (fração 1). "Flávia e Humberto" (meio a meio) fica como está.
--    O André saiu da casa: o de-para dele não tem conta, por isso vai à mão.
--    A sincronização da planilha só regrava a linha que MUDOU no arquivo
--    (content_hash), e o arquivo está fora do ar desde 01/09 (410).
--
-- 3. Dono das propostas. A tela de Proposta gravava como dono quem SALVAVA
--    (corrigido no código junto com esta migration): 64 propostas da Lotus
--    ficaram no nome da Yasmin (admin) e 1 no do dono da plataforma — 4
--    assinadas, que o ranking e o Relatório Individual contavam para a
--    Yasmin. Cada uma volta para o corretor escrito nela. Nome sem conta na
--    casa ("ERICK CESAR FERRIGATTI MAMEDE", "Não atribuído") fica sem dono:
--    a leitura casa pelo nome, e ninguém é creditado por engano. Nenhum
--    gatilho de `proposals` olha o dono (só `stage_id`): venda não é criada
--    nem apagada por isto.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _lotus AS SELECT '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid AS id;

-- 1 ---------------------------------------------------------------------
UPDATE public.commercial_sales cs
   SET tipo = 'senior'
 WHERE cs.tenant_id = (SELECT id FROM _lotus)
   AND public.normalizar_texto(cs.corretor_nome) = 'andre marcondes'
   AND cs.tipo = 'Tropa (contrato anterior a transição)';

-- 2 ---------------------------------------------------------------------
UPDATE public.commercial_sales cs
   SET corretor_nome = 'André Marcondes'
 WHERE cs.tenant_id = (SELECT id FROM _lotus)
   AND public.normalizar_texto(cs.corretor_nome) = 'andre';

UPDATE public.commercial_sales cs
   SET corretor_nome = btrim(regexp_replace(u.raw_user_meta_data ->> 'name', '\s+', ' ', 'g'))
  FROM public.planilha_corretor_de_para d
  JOIN auth.users u ON u.id = d.user_id
 WHERE cs.tenant_id = (SELECT id FROM _lotus)
   AND d.tenant_id = cs.tenant_id
   AND d.fracao = 1
   AND NULLIF(btrim(u.raw_user_meta_data ->> 'name'), '') IS NOT NULL
   AND public.normalizar_texto(d.nome_na_planilha) = public.normalizar_texto(cs.corretor_nome)
   AND cs.corretor_nome IS DISTINCT FROM btrim(regexp_replace(u.raw_user_meta_data ->> 'name', '\s+', ' ', 'g'));

-- Nome completo que só difere do cadastro por acento, caixa ou espaço
-- ("Flávia Ceolin" × "Flavia Ceolin") fica com a grafia do cadastro.
UPDATE public.commercial_sales cs
   SET corretor_nome = btrim(regexp_replace(u.raw_user_meta_data ->> 'name', '\s+', ' ', 'g'))
  FROM public.tenant_memberships tm
  JOIN auth.users u ON u.id = tm.user_id
 WHERE cs.tenant_id = (SELECT id FROM _lotus)
   AND tm.tenant_id = cs.tenant_id
   AND NULLIF(btrim(u.raw_user_meta_data ->> 'name'), '') IS NOT NULL
   AND public.normalizar_texto(cs.corretor_nome) = public.normalizar_texto(u.raw_user_meta_data ->> 'name')
   AND cs.corretor_nome IS DISTINCT FROM btrim(regexp_replace(u.raw_user_meta_data ->> 'name', '\s+', ' ', 'g'));

-- 3 ---------------------------------------------------------------------
CREATE TEMP TABLE _dono_pelo_nome (nome text PRIMARY KEY, user_id uuid NOT NULL, nome_cadastro text);
INSERT INTO _dono_pelo_nome VALUES
  ('andre marcondes', 'a91cad0b-3f56-41c9-ac02-a127e896a5d8', 'André Marcondes'),  -- ex-membro: a conta da Lotus
  ('fabio goncalves', 'e3be897f-69ed-403b-adca-adc6f20a0429', NULL),
  ('fernanda souza',  '05262739-196d-4888-8d7d-bb84f6bc670d', NULL),
  ('flavia ceolin',   '3cfb9746-6cf1-4199-bbd1-8dd4abbc1c2e', NULL),
  ('gabriele favaro', '57b5e55e-5519-4d0c-acf4-6b80f72ba57b', NULL),
  ('mariana mamede',  '441add70-fc92-42f2-b693-c27a0ddb67d2', NULL);

UPDATE public.proposals p
   SET agent_user_id = m.user_id,
       -- Ex-membro não tem cadastro na casa para dar o nome na tela: o nome
       -- escrito é o que aparece, então sai da caixa alta.
       agent_name = COALESCE(m.nome_cadastro, p.agent_name)
  FROM public.proposals o
  JOIN auth.users dono ON dono.id = o.agent_user_id
  LEFT JOIN _dono_pelo_nome m ON m.nome = public.normalizar_texto(o.agent_name)
 WHERE p.id = o.id
   AND o.tenant_id = (SELECT id FROM _lotus)
   AND o.agent_user_id IN ('226bcde7-fac9-4c89-8131-0c3344cf82ab',   -- Yasmin (admin)
                           'b71bd450-d915-4338-abf8-49431bbb293f')   -- dono da plataforma
   AND public.normalizar_texto(o.agent_name)
       IS DISTINCT FROM public.normalizar_texto(dono.raw_user_meta_data ->> 'name')
   AND m.user_id IS NOT NULL;

UPDATE public.proposals p
   SET agent_user_id = NULL
 WHERE p.tenant_id = (SELECT id FROM _lotus)
   AND p.agent_user_id IN ('226bcde7-fac9-4c89-8131-0c3344cf82ab', 'b71bd450-d915-4338-abf8-49431bbb293f')
   AND public.normalizar_texto(p.agent_name) IN ('erick cesar ferrigatti mamede', 'nao atribuido');

-- Conferência: o que sobrou tem que ser zero; o que mudou, o medido em 01/10.
DO $$
DECLARE v_sobra int; v_tropa int; v_apelido int;
BEGIN
  SELECT count(*) INTO v_sobra
    FROM public.proposals p JOIN auth.users u ON u.id = p.agent_user_id
   WHERE p.tenant_id = (SELECT id FROM _lotus)
     AND p.agent_user_id IN ('226bcde7-fac9-4c89-8131-0c3344cf82ab', 'b71bd450-d915-4338-abf8-49431bbb293f')
     AND public.normalizar_texto(p.agent_name) IS DISTINCT FROM public.normalizar_texto(u.raw_user_meta_data ->> 'name');
  SELECT count(*) INTO v_tropa FROM public.commercial_sales
   WHERE tenant_id = (SELECT id FROM _lotus) AND tipo ILIKE 'tropa%';
  SELECT count(*) INTO v_apelido FROM public.commercial_sales
   WHERE tenant_id = (SELECT id FROM _lotus)
     AND corretor_nome IN ('Andre', 'Fernanda', 'Flávia', 'Humberto', 'Gabi', 'Gabrielle', 'Flávia Ceolin');
  IF v_sobra <> 0 OR v_tropa <> 0 OR v_apelido <> 0 THEN
    RAISE EXCEPTION 'sobrou: % propostas com dono errado, % linhas Tropa, % apelidos', v_sobra, v_tropa, v_apelido;
  END IF;
  RAISE NOTICE 'OK: propostas, nível do André e apelidos corrigidos';
END $$;

COMMIT;
