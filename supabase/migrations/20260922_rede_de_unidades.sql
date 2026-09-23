-- ============================================================
-- Matriz, filial e franquia (F.3) — a estrutura, e só ela
--
-- O plano marca este item como "preparar a estrutura, fim da fila". Levei isso
-- ao pé da letra, porque ele mexe na multi-tenancy, que é a fundação do
-- sistema inteiro: toda RLS, toda tela e toda consulta começam em
-- `tenant_id`. Refundar isso por uma rede que ainda não existe seria o tipo de
-- arquitetura que se paga por anos.
--
-- O QUE FOI MEDIDO EM PRODUÇÃO, EM 22/09/2026
--
--   unidades vivas ........ 3   (Imobiliaria Japi, Lotus Brokers, Área de Teste)
--   unidades apagadas ..... 6
--   pessoas em mais de uma unidade VIVA ..... 1
--
-- Duas coisas saem daí, e as duas mudam o item:
--
-- 1. O PONTO 2 DO PLANO JÁ EXISTE. "Membro pode pertencer a várias unidades,
--    com cargo por unidade" é exatamente o que `tenant_memberships`
--    (tenant_id, user_id, role) faz desde sempre — e há uma pessoa usando.
--    Não construí de novo.
--
-- 2. A REDE JÁ EXISTE DE FATO, SEM NOME. A "Lotus Brokers" está cadastrada com
--    o código `LANCAMENTOSJAPI@GMAIL.COM`. Não é coincidência: é o braço de
--    lançamentos da Japi, e o código guardou isso num campo que não era para
--    isso. Este item dá um lugar para esse fato morar.
--
-- O QUE NÃO FOI FEITO, DE PROPÓSITO
--
--   * NENHUMA unidade é declarada matriz, filial ou franquia aqui. O código
--     com "JAPI" dentro é uma pista forte, não um fato — quem diz quem é
--     matriz de quem é o dono, não o programador lendo um campo de texto.
--   * As views do P0.5 NÃO passaram a aceitar várias unidades, e não há
--     seletor "Toda a rede". Um seletor com uma opção só é ruído, e reescrever
--     as views do relatório por uma rede vazia é refazer trabalho que vai
--     mudar quando a rede existir de verdade.
--   * Nada muda para quem usa o sistema hoje. Unidade sem organização se
--     comporta exatamente como antes — as colunas são anuláveis e ninguém as
--     lê ainda, fora da função no fim deste arquivo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A rede
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL;

/**
 * `matriz` | `filial` | `franquia`. Nulo = unidade solta, que é o caso das
 * três de hoje.
 *
 * `ON DELETE SET NULL` acima, e não CASCADE: apagar a rede não pode apagar as
 * imobiliárias dentro dela. É o mesmo cuidado do `condicao_id` nas simulações
 * — a linha de cima some, a de baixo continua de pé.
 */
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tipo_unidade text;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_tipo_unidade_ck') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_tipo_unidade_ck
      CHECK (tipo_unidade IS NULL OR tipo_unidade IN ('matriz', 'filial', 'franquia'));
  END IF;
  -- Tipo de unidade só faz sentido dentro de uma rede. Sem esta trava, uma
  -- unidade solta poderia dizer-se "matriz" de nada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_tipo_exige_rede_ck') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_tipo_exige_rede_ck
      CHECK (tipo_unidade IS NULL OR organizacao_id IS NOT NULL);
  END IF;
END
$do$;

-- Uma rede tem no máximo UMA matriz. Duas matrizes é a pergunta "quem manda?"
-- sem resposta, e ela apareceria no dia em que alguém somasse a rede.
CREATE UNIQUE INDEX IF NOT EXISTS organizacao_uma_matriz_idx
  ON public.tenants (organizacao_id) WHERE tipo_unidade = 'matriz';

CREATE INDEX IF NOT EXISTS tenants_organizacao_idx
  ON public.tenants (organizacao_id) WHERE organizacao_id IS NOT NULL;

COMMENT ON TABLE public.organizacoes IS
  'A rede acima das imobiliárias (F.3). Vazia até alguém declarar uma — nenhuma unidade foi classificada por código.';
COMMENT ON COLUMN public.tenants.tipo_unidade IS
  'matriz | filial | franquia. Nulo = unidade solta, que é o normal hoje.';

/**
 * Apagar a rede solta as unidades — AS DUAS COLUNAS.
 *
 * O `ON DELETE SET NULL` do FK limpa só `organizacao_id`, e `tipo_unidade`
 * ficaria como 'matriz' sem rede — que é exatamente o que o CHECK acima
 * proíbe. Resultado: apagar uma rede com unidades dentro dava erro de
 * constraint, e a rede virava impossível de remover.
 *
 * Achado pelo teste, não por leitura: a regra e a limpeza foram escritas no
 * mesmo arquivo e mesmo assim brigaram.
 */
CREATE OR REPLACE FUNCTION public.tg_rede_apagada_solta_unidades()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tenants
     SET organizacao_id = NULL, tipo_unidade = NULL
   WHERE organizacao_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tr_rede_apagada_solta_unidades ON public.organizacoes;
CREATE TRIGGER tr_rede_apagada_solta_unidades
  BEFORE DELETE ON public.organizacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_rede_apagada_solta_unidades();

-- ------------------------------------------------------------
-- 2. A permissão de ver a rede inteira
--
-- Entra em `permissoes` com `em_uso = true` porque a função abaixo a LÊ. O
-- P4.1 mapeou 17 permissões gravadas que ninguém lê, e registrou por quê:
-- "uma chave que não faz nada é pior que uma chave ausente — quem a desmarca
-- acredita ter restringido". Não acrescento a décima oitava.
-- ------------------------------------------------------------
INSERT INTO public.permissoes (codigo, modulo, descricao, ordem, em_uso) VALUES
  ('rede.ver_consolidado', 'Rede',
   'Ver os números de todas as unidades da rede, e não só os da sua', 900, true)
ON CONFLICT (codigo) DO UPDATE
  SET modulo = EXCLUDED.modulo, descricao = EXCLUDED.descricao, em_uso = EXCLUDED.em_uso;

-- ------------------------------------------------------------
-- 3. Quais unidades eu posso ver
--
-- É a única pergunta que a estrutura precisa responder hoje, e é a que todo
-- relatório vai fazer no dia em que a rede existir. Nasce agora para que
-- ninguém escreva `WHERE tenant_id = :meu` mais uma vez e tenha de desfazer
-- depois.
--
-- Hoje ela devolve exatamente as unidades da pessoa — porque não há rede
-- nenhuma cadastrada. É o comportamento de antes, escrito de um jeito que
-- sobrevive à rede.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minhas_unidades()
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH minhas AS (
    SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
     -- Unidade apagada não entra: em 22/09 havia 47 vínculos apontando para
     -- as 6 unidades apagadas, e sem este filtro a "minha rede" incluiria
     -- imobiliárias que não existem mais.
     WHERE tm.user_id = auth.uid() AND t.deleted_at IS NULL
  ),
  -- As redes em que eu tenho a permissão de ver o consolidado. A permissão é
  -- POR UNIDADE: quem a tem na matriz vê a rede; quem só a tem numa filial vê
  -- a rede daquela filial, que é a mesma. Ter em qualquer unidade da rede
  -- basta, e é o que o plano descreve.
  redes AS (
    SELECT DISTINCT t.organizacao_id
      FROM minhas m
      JOIN public.tenants t ON t.id = m.tenant_id
     WHERE t.organizacao_id IS NOT NULL
       -- `minhas_permissoes` devolve
       -- `{cargo, role, permissoes: [códigos], excecoes: [...]}`: a lista de
       -- permissões é um ARRAY de códigos, não um mapa de booleanos. Escrevi
       -- como mapa na primeira versão e o teste acusou — o chefe da rede via
       -- uma unidade em vez de duas.
       AND (public.minhas_permissoes(m.tenant_id) -> 'permissoes')
             ? 'rede.ver_consolidado'
  )
  SELECT tenant_id FROM minhas
  UNION
  SELECT t.id FROM public.tenants t
    JOIN redes r ON r.organizacao_id = t.organizacao_id
   WHERE t.deleted_at IS NULL;
$function$;

REVOKE ALL ON public.organizacoes FROM anon, authenticated;
GRANT SELECT ON public.organizacoes TO authenticated;
GRANT ALL ON public.organizacoes TO service_role;

ALTER TABLE public.organizacoes ENABLE ROW LEVEL SECURITY;

-- Só vê a rede quem é de alguma unidade dela. Uma rede não é dado público, e
-- o nome dela diz com quem a casa trabalha.
DROP POLICY IF EXISTS organizacoes_membro_le ON public.organizacoes;
CREATE POLICY organizacoes_membro_le ON public.organizacoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
        JOIN public.tenant_memberships tm ON tm.tenant_id = t.id
       WHERE t.organizacao_id = organizacoes.id AND tm.user_id = auth.uid()
    ) OR public.is_platform_owner()
  );

REVOKE ALL ON FUNCTION public.minhas_unidades() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_unidades() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
