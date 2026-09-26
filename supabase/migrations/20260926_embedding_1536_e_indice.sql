-- ============================================================
-- `kb_trechos.embedding` fixado em 1536 dimensões, com índice — 26/09
--
-- A equipe da Lia perguntou a dimensão. A resposta era constrangedora: a
-- coluna era `vector` SEM dimensão declarada. Aceitava qualquer tamanho — e
-- por isso **não podia ter índice**: `hnsw` e `ivfflat` exigem dimensão fixa.
-- A busca por similaridade existia e varreria a tabela inteira.
--
-- Eles escolheram: `text-embedding-3-small`, 1536 dimensões.
-- ============================================================
--
-- POR QUE AGORA, E NÃO DEPOIS
--
-- `kb_trechos` está com ZERO linhas. Fixar a dimensão de uma coluna `vector`
-- já populada obriga a reescrever a tabela inteira; com ela vazia é
-- instantâneo. São 42 books esperando indexação do outro lado — se isso
-- rodasse primeiro, a correção custaria uma janela de manutenção.
--
-- ÍNDICE HNSW, NÃO IVFFLAT
--
-- `ivfflat` precisa de dados para montar as listas: criado sobre tabela vazia
-- ele nasce inútil e continua inútil até alguém lembrar de recriá-lo depois de
-- popular — e ninguém lembra. `hnsw` se constrói incrementalmente, então
-- funciona desde o primeiro trecho inserido.
--
-- `vector_cosine_ops` porque `buscar_kb` compara por cosseno, que é o que
-- `text-embedding-3-small` espera (os vetores dele já vêm normalizados).
-- ============================================================

DO $$
DECLARE
  v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.kb_trechos;

  -- A trava que evita o estrago: se alguém indexou entre a leitura de hoje e
  -- esta migration, o ALTER reescreveria a tabela e poderia recusar vetores de
  -- outra dimensão no meio do caminho. Melhor parar e olhar.
  IF v_linhas > 0 THEN
    RAISE EXCEPTION
      'kb_trechos tem % linha(s). Esta migration foi escrita para a tabela VAZIA: confira a dimensao dos vetores ja gravados antes de fixar.', v_linhas;
  END IF;
END $$;

ALTER TABLE public.kb_trechos
  ALTER COLUMN embedding TYPE vector(1536);

-- `IF NOT EXISTS` porque a migration precisa poder ser reaplicada: em 24/09
-- uma migration de construtoras derrubou o resto do arquivo por causa de um
-- `CREATE` que não era idempotente.
CREATE INDEX IF NOT EXISTS kb_trechos_embedding_hnsw
  ON public.kb_trechos USING hnsw (embedding vector_cosine_ops);

-- A busca é SEMPRE por imobiliária e quase sempre por lançamento: sem este, o
-- recorte por tenant vira varredura antes de o índice de vetor entrar.
--
-- NÃO é duplicata do `kb_trechos_tenant_geral_idx` que já existe: aquele é
-- PARCIAL (`WHERE lancamento_id IS NULL`) e cobre só os trechos gerais. Este
-- cobre a consulta por lançamento, que é como `buscar_kb` é chamada. Conferido
-- antes de criar — índice a mais custa escrita e não paga nada.
CREATE INDEX IF NOT EXISTS kb_trechos_tenant_lancamento_idx
  ON public.kb_trechos (tenant_id, lancamento_id);

COMMENT ON COLUMN public.kb_trechos.embedding IS
  'vector(1536) -- text-embedding-3-small, escolhido pela equipe da Lia em 26/09. Trocar de modelo exige recriar a coluna E reindexar os trechos: a dimensao faz parte do contrato.';

NOTIFY pgrst, 'reload schema';
