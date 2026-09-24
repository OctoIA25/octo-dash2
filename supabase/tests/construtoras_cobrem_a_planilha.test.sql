-- ============================================================
-- O cadastro de construtoras cobre TODO nome que as fontes escrevem.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/construtoras_cobrem_a_planilha.test.sql
--
-- O que este arquivo protege é o pedido do chefe de 24/09: "preencher com as
-- que já tínhamos naquela lista, e linkar os produtos nela". Duas metades, e a
-- segunda é a que ninguém vê:
--
--   1. todo lançamento com texto de construtora tem vínculo;
--   2. a TELA consegue casar o texto com a construtora — e a tela só enxerga
--      `nome` e `aliases`, não o de-para que vive dentro da migration.
--
-- O caso 3 é o que sustenta o arquivo. Sem ele, cadastrar as 20 construtoras
-- deixaria 12 das 82 linhas da planilha em "fora do cadastro", com o cadastro
-- inteiro certo — e pareceria defeito do cadastro.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '3c0d0000-0000-4000-a000-000000000001';
  -- Exatamente as grafias que existem hoje: 18 em produção (lançamentos e
  -- condomínios da Lotus) e 20 na planilha do Google. Escritas à mão porque o
  -- valor do teste é justamente NÃO derivar da mesma fonte que se testa.
  textos text[] := ARRAY[
    'Santa Ângela', 'Santa  Angela', 'SANTA ANGELA',
    'Mac Lucer', 'MAC LUCER', 'Tebas', 'tebas',
    'Applausi', 'APLAUSI', 'FA Oliva', 'F A Oliva',
    'Diretiva', 'Inkkorp', 'Auten', 'AUTEN',
    'Sebel Empreendimentos', 'Sebel', 'SEBEL EMPREENDIMENTOS',
    'Tecnisa', 'REM', 'REM Construtora e Incorporadora',
    'VVC Construtora', 'VVC', 'Manduca Empreendimentos', 'Manducca',
    'Zarin', 'GRUPO ZARIN', 'GP Desenvolvimento Urbano', 'Ezetec',
    'ARACATU EMPREENDIMENTOS IMOBILIÁRIOS',
    'VIC Engenharia', 'Emccamp',
    -- As duas de 24/09.
    'MRV', 'Trend Canadá'
  ];
  t          text;
  n_sem_vinculo int;
  n_fora        int;
  faltando      text;
  n_alias_inutil int;
  n_ambiguo      int;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-construtoras', 'Casa')
  ON CONFLICT DO NOTHING;

  -- Um lançamento por grafia. É o que a migration de seed lê para decidir
  -- quais construtoras aquela imobiliária ganha.
  FOREACH t IN ARRAY textos LOOP
    INSERT INTO lancamentos (tenant_id, nome, construtora)
    VALUES (casa, 'Empreendimento ' || t, t);
  END LOOP;

  -- ----------------------------------------------------------
  -- Roda a MESMA função que a migration roda — não uma cópia do de-para.
  -- Copiar as 34 linhas aqui faria este teste conferir a própria cópia, que é
  -- o oposto de conferir. Foi por isso que o seed virou função.
  -- ----------------------------------------------------------
  PERFORM public.semear_construtoras();

  -- ----------------------------------------------------------
  -- 1. NENHUM LANÇAMENTO FICA SEM VÍNCULO
  --
  -- É a primeira metade do pedido — "linkar os produtos nela". Um lançamento
  -- sem vínculo não some da tela: ele aparece em "fora do cadastro", que é
  -- pior, porque parece pendência de cadastro quando é falta de de-para.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n_sem_vinculo
    FROM lancamentos WHERE tenant_id = casa AND construtora_id IS NULL;
  IF n_sem_vinculo IS DISTINCT FROM 0 THEN
    SELECT string_agg(DISTINCT construtora, ', ') INTO faltando
      FROM lancamentos WHERE tenant_id = casa AND construtora_id IS NULL;
    RAISE EXCEPTION 'FALHOU 1: % lancamento(s) sem construtora — %', n_sem_vinculo, faltando;
  END IF;
  RAISE NOTICE 'OK 1: os % lancamentos tem construtora', array_length(textos, 1);

  -- ----------------------------------------------------------
  -- 2. AS DUAS DE 24/09 EXISTEM
  --
  -- Caso próprio porque elas são a diferença entre o levantamento de 18/09 e o
  -- que o banco de verdade tem. Sem este caso, tirá-las do de-para faria só o
  -- caso 1 reclamar, junto com qualquer outra — e ninguém saberia qual.
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM construtoras WHERE tenant_id = casa AND codigo = 'mrv')
     OR NOT EXISTS (SELECT 1 FROM construtoras WHERE tenant_id = casa AND codigo = 'trend_canada') THEN
    RAISE EXCEPTION 'FALHOU 2: MRV ou Trend Canada nao foram cadastradas';
  END IF;
  RAISE NOTICE 'OK 2: MRV e Trend Canada estao no cadastro';

  -- ----------------------------------------------------------
  -- 3. A TELA CONSEGUE CASAR TODO TEXTO
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  --
  -- A aba Construtoras casa a planilha com o cadastro olhando `nome` e
  -- `aliases`, e nada mais — o de-para da migration ela não vê. Com os
  -- apelidos presos lá dentro, "APLAUSI" não acha "Applausi" e "GRUPO ZARIN"
  -- não acha "Zarin": 12 das 82 linhas ficariam fora, com o cadastro certo.
  -- ----------------------------------------------------------
  SELECT count(*), string_agg(x.txt, ', ') INTO n_fora, faltando
    FROM unnest(textos) AS x(txt)
   WHERE NOT EXISTS (
     SELECT 1 FROM construtoras c
      WHERE c.tenant_id = casa
        AND (public.normalizar_texto(c.nome) = public.normalizar_texto(x.txt)
             OR EXISTS (SELECT 1 FROM unnest(c.aliases) a
                         WHERE public.normalizar_texto(a) = public.normalizar_texto(x.txt))));
  IF n_fora IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU 3: a tela nao acharia % grafia(s) — %', n_fora, faltando;
  END IF;
  RAISE NOTICE 'OK 3: as % grafias casam por nome ou apelido', array_length(textos, 1);

  -- ----------------------------------------------------------
  -- 4. UM TEXTO NÃO PODE APONTAR PARA DUAS CONSTRUTORAS
  --
  -- Sem este caso, o 3 passaria com um cadastro frouxo — bastaria dar todos os
  -- apelidos a todo mundo. E na tela isso não daria erro: o empreendimento
  -- apareceria na construtora errada, em silêncio.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n_ambiguo FROM (
    SELECT x.txt
      FROM unnest(textos) AS x(txt)
      JOIN construtoras c ON c.tenant_id = casa
       AND (public.normalizar_texto(c.nome) = public.normalizar_texto(x.txt)
            OR EXISTS (SELECT 1 FROM unnest(c.aliases) a
                        WHERE public.normalizar_texto(a) = public.normalizar_texto(x.txt)))
     GROUP BY x.txt HAVING count(DISTINCT c.codigo) > 1
  ) s;
  IF n_ambiguo IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU 4: % grafia(s) apontam para mais de uma construtora', n_ambiguo;
  END IF;
  RAISE NOTICE 'OK 4: cada grafia aponta para uma construtora so';

  -- ----------------------------------------------------------
  -- 5. APELIDO QUE A NORMALIZAÇÃO JÁ RESOLVE É RUÍDO
  --
  -- "SANTA ANGELA" e "Santa Ângela" viram a mesma chave sozinhas. Guardar isso
  -- como apelido não quebra nada — e é exatamente por isso que entra calado e
  -- fica. Uma lista com 32 linhas onde 13 são inúteis deixa de ser lida.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n_alias_inutil
    FROM construtoras c, unnest(c.aliases) a
   WHERE c.tenant_id = casa
     AND public.normalizar_texto(a) = public.normalizar_texto(c.nome);
  IF n_alias_inutil IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU 5: % apelido(s) repetem o nome canonico', n_alias_inutil;
  END IF;
  RAISE NOTICE 'OK 5: nenhum apelido repete o nome';

  -- ----------------------------------------------------------
  -- 6. UMA GRAFIA NOVA APARECE COMO PENDÊNCIA, E NÃO SOME
  --
  -- É o estado em que a Dash vive: alguém digita um nome novo no lançamento. O
  -- certo NÃO é adivinhar de quem é — é a asserção do caso 1 reclamar. Este
  -- caso prova que ela reclama, em vez de o cadastro absorver qualquer coisa.
  -- ----------------------------------------------------------
  INSERT INTO lancamentos (tenant_id, nome, construtora)
  VALUES (casa, 'Empreendimento de construtora nova', 'Construtora Que Nao Existe');

  SELECT count(*) INTO n_sem_vinculo
    FROM lancamentos WHERE tenant_id = casa AND construtora_id IS NULL;
  IF n_sem_vinculo IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 6: grafia desconhecida deveria ficar sem vinculo, e ficaram %', n_sem_vinculo;
  END IF;
  RAISE NOTICE 'OK 6: grafia nova vira pendencia visivel, nao chute';

  -- ----------------------------------------------------------
  -- 7. APELIDO ERRADO DE UMA RODADA ANTERIOR É CORRIGIDO
  --
  -- Este caso nasceu de uma sabotagem de 24/09 que sujou o cadastro: a rodada
  -- limpa seguinte NÃO limpou, porque a lista só era acrescentada. Um apelido
  -- na construtora errada é o pior defeito desta tela — o empreendimento
  -- aparece sob outra construtora, sem erro nenhum, e ninguém procura.
  --
  -- Os casos 1 a 6 passavam com a sujeira: eles olham uma imobiliária que
  -- acabou de nascer, e ali a lista sempre começa vazia.
  -- ----------------------------------------------------------
  UPDATE construtoras SET aliases = ARRAY['APLAUSI', 'texto que nunca existiu']
   WHERE tenant_id = casa AND codigo = 'tebas';

  PERFORM public.semear_construtoras();

  IF (SELECT aliases FROM construtoras WHERE tenant_id = casa AND codigo = 'tebas')
     IS DISTINCT FROM '{}'::text[] THEN
    RAISE EXCEPTION 'FALHOU 7: apelido errado sobreviveu a uma nova rodada — %',
      (SELECT array_to_string(aliases, ', ') FROM construtoras WHERE tenant_id = casa AND codigo = 'tebas');
  END IF;

  -- E a rodada que limpa não pode ter levado junto quem tem apelido de verdade.
  IF NOT EXISTS (SELECT 1 FROM construtoras c
                  WHERE c.tenant_id = casa AND c.codigo = 'applausi'
                    AND 'APLAUSI' = ANY(c.aliases)) THEN
    RAISE EXCEPTION 'FALHOU 7b: a limpeza apagou o apelido de quem tinha um de verdade';
  END IF;
  RAISE NOTICE 'OK 7: apelido errado e corrigido, e o certo fica';

  -- ----------------------------------------------------------
  -- 8. RENOMEAR NÃO DERRUBA OS EMPREENDIMENTOS
  --
  -- Achado no navegador em 24/09: alguém havia renomeado "Santa Ângela" para
  -- "Santa Ângela Incorporadora" nesta base, e as 14 linhas da planilha caíram
  -- em "fora do cadastro". Nenhum erro, nenhum aviso — o card esvazia e outro
  -- amarelo aparece, e quem olha conclui que falta cadastrar.
  --
  -- O vínculo do banco continua intacto: quem quebra é o casamento por texto,
  -- que só a tela faz. Por isso nenhum teste de código pegaria.
  -- ----------------------------------------------------------
  UPDATE construtoras SET nome = 'Tebas Incorporadora'
   WHERE tenant_id = casa AND codigo = 'tebas';

  IF NOT EXISTS (SELECT 1 FROM construtoras c
                  WHERE c.tenant_id = casa AND c.codigo = 'tebas'
                    AND public.normalizar_texto('Tebas') = ANY(
                          SELECT public.normalizar_texto(a) FROM unnest(c.aliases) a)) THEN
    RAISE EXCEPTION 'FALHOU 8: renomear perdeu o nome antigo — a planilha cairia fora do cadastro';
  END IF;

  -- Só mudar acento e caixa não vira apelido: a normalização já resolve, e a
  -- lista encheria de ruído a cada correção de digitação.
  UPDATE construtoras SET nome = 'TEBAS INCORPORADORA'
   WHERE tenant_id = casa AND codigo = 'tebas';
  IF (SELECT cardinality(aliases) FROM construtoras WHERE tenant_id = casa AND codigo = 'tebas') <> 1 THEN
    RAISE EXCEPTION 'FALHOU 8b: mudanca de caixa virou apelido — a lista vira ruido';
  END IF;

  -- E voltar ao nome antigo tira o apelido que virou nome: senao a mesma
  -- chave apontaria duas vezes para o mesmo lugar, e a lista cresceria sem fim.
  UPDATE construtoras SET nome = 'Tebas' WHERE tenant_id = casa AND codigo = 'tebas';
  IF EXISTS (SELECT 1 FROM construtoras c, unnest(c.aliases) a
              WHERE c.tenant_id = casa AND c.codigo = 'tebas'
                AND public.normalizar_texto(a) = public.normalizar_texto(c.nome)) THEN
    RAISE EXCEPTION 'FALHOU 8c: o apelido que virou nome continuou na lista';
  END IF;
  RAISE NOTICE 'OK 8: renomear guarda o nome antigo, e so o que importa';
END $$;

ROLLBACK;
