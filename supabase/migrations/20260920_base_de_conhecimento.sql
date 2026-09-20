-- ============================================================
-- Base de conhecimento por empreendimento (P2.3).
--
-- A DIVISÃO QUE O PLANO FAZ, e que este arquivo respeita:
--   consulta direta (banco): preço, metragem, dormitórios, vagas → P2.1
--   base de conhecimento:     book, memorial, regulamento, FAQ, resposta de
--                             plantão → aqui
--
-- COMO A LIA USA O BOOK HOJE, anotado antes de mudar como o plano manda:
-- ela recebe `book_pdf_url` — um LINK para o PDF — e mais nada. A lista de
-- lançamentos devolve só `tem_book: true/false`. A Dash nunca abriu esse
-- arquivo: não extrai texto, não indexa, não busca. São 40 books nos 59
-- lançamentos da Lotus, e o conteúdo de todos é invisível para o sistema.
--
-- A BUSCA FUNCIONA SEM EMBEDDING, E MELHORA COM ELE. Não existe provedor de
-- embeddings nesta Dash: a única IA configurada é a Anthropic, que não tem
-- essa API. Decidido pelo chefe em 20/09/2026 — a LIA roda em servidor
-- próprio (Hostinger) e é ela que vai indexar. Até lá, a busca é por PALAVRA,
-- em português, com radical e sem acento, e funciona desde o primeiro
-- documento. Quando os embeddings chegarem, a mesma função passa a usar
-- significado, sem nenhuma tela mudar.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- Os documentos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kb_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,

  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'outro',

  /** Um dos dois: o arquivo no Storage, ou o texto colado direto. */
  arquivo_url text,
  conteudo text,

  /**
   * Até quando vale. Tabela de preço e condição de pagamento envelhecem, e a
   * LIA cita isso para cliente: documento vencido não pode ser usado nem que
   * continue ativo.
   */
  valido_ate date,
  ativo boolean NOT NULL DEFAULT true,

  status_indexacao text NOT NULL DEFAULT 'pendente',
  qtd_trechos int NOT NULL DEFAULT 0,
  erro_indexacao text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kb_documentos_tipo_ck CHECK (tipo IN (
    'book', 'memorial', 'faq', 'regulamento', 'resposta_plantao', 'outro'
  )),
  CONSTRAINT kb_documentos_status_ck CHECK (status_indexacao IN (
    'pendente', 'indexado', 'erro'
  )),
  CONSTRAINT kb_documentos_titulo_ck CHECK (btrim(titulo) <> ''),
  -- Documento sem arquivo E sem texto não tem o que indexar, e ficaria
  -- eternamente "pendente" enchendo a fila do gestor.
  CONSTRAINT kb_documentos_fonte_ck CHECK (
    (arquivo_url IS NOT NULL AND btrim(arquivo_url) <> '')
    OR (conteudo IS NOT NULL AND btrim(conteudo) <> '')
  )
);

CREATE INDEX IF NOT EXISTS kb_documentos_lancamento_idx
  ON public.kb_documentos (lancamento_id, ativo);

-- ------------------------------------------------------------
-- Os trechos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kb_trechos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.kb_documentos(id) ON DELETE CASCADE,
  /** Repetido de propósito: a busca filtra por empreendimento sem precisar do join. */
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,

  ordem int NOT NULL DEFAULT 0,
  texto text NOT NULL,

  /**
   * SEM DIMENSÃO DECLARADA de propósito: o provedor ainda não foi escolhido, e
   * cada um usa um tamanho (1536, 1024, 768...). Declarar errado obrigaria a
   * recriar a tabela. O índice vetorial entra junto com a dimensão, quando a
   * LIA começar a mandar — até lá são poucos trechos e a varredura basta.
   */
  embedding vector,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kb_trechos_texto_ck CHECK (btrim(texto) <> '')
);

CREATE INDEX IF NOT EXISTS kb_trechos_documento_idx
  ON public.kb_trechos (documento_id, ordem);

-- A busca por palavra, em português: radical e sem acento. É o que faz o
-- item funcionar no primeiro dia, sem provedor nenhum.
CREATE INDEX IF NOT EXISTS kb_trechos_texto_fts_idx
  ON public.kb_trechos USING gin (to_tsvector('portuguese', texto));

-- ------------------------------------------------------------
-- Quem enxerga o quê
--
-- A chave do navegador NÃO lê: memorial e regulamento podem trazer cláusula
-- e condição que não são para o site público. Quem lê é membro da
-- imobiliária, e a LIA pela chave de serviço.
-- ------------------------------------------------------------
REVOKE ALL ON public.kb_documentos FROM anon, authenticated;
REVOKE ALL ON public.kb_trechos    FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_documentos TO authenticated;
GRANT SELECT ON public.kb_trechos TO authenticated;
GRANT ALL ON public.kb_documentos, public.kb_trechos TO service_role;

ALTER TABLE public.kb_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_trechos    ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_documentos_membro ON public.kb_documentos
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner())
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
              OR public.is_platform_owner());

CREATE POLICY kb_trechos_membro_le ON public.kb_trechos
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- NINGUÉM escreve trecho pelo navegador: quem indexa é a LIA, com a chave de
-- serviço. Trecho que o usuário pode escrever deixa de ser o que o documento
-- diz e passa a ser o que alguém digitou.

-- ------------------------------------------------------------
-- A busca
--
-- Com embedding, por significado. Sem, por palavra. A tela não muda.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_kb(
  p_lancamento_id uuid,
  p_pergunta      text,
  p_k             int DEFAULT 5,
  p_embedding     vector DEFAULT NULL
)
RETURNS TABLE (
  trecho_id uuid,
  documento_id uuid,
  documento_titulo text,
  documento_tipo text,
  texto text,
  /** 0 a 1. Quanto maior, mais parecido. */
  semelhanca real,
  /** 'significado' ou 'palavra' — a tela precisa poder dizer qual foi usada. */
  modo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_k int := LEAST(GREATEST(COALESCE(p_k, 5), 1), 50);
  v_pergunta text := btrim(COALESCE(p_pergunta, ''));
  v_tem_embedding boolean;
BEGIN
  SELECT l.tenant_id INTO v_tenant FROM lancamentos l WHERE l.id = p_lancamento_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = v_tenant
     )
  THEN
    RETURN;
  END IF;

  -- Só vale documento ATIVO e DENTRO DA VALIDADE. Um memorial vencido
  -- responderia com condição que não existe mais, e a LIA repetiria ao
  -- cliente como se fosse de hoje.
  v_tem_embedding := p_embedding IS NOT NULL AND EXISTS (
    SELECT 1 FROM kb_trechos t
    JOIN kb_documentos d ON d.id = t.documento_id
    WHERE t.lancamento_id = p_lancamento_id
      AND t.embedding IS NOT NULL
      AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
  );

  IF v_tem_embedding THEN
    RETURN QUERY
    SELECT t.id, d.id, d.titulo, d.tipo, t.texto,
           (1 - (t.embedding <=> p_embedding))::real,
           'significado'::text
    FROM kb_trechos t
    JOIN kb_documentos d ON d.id = t.documento_id
    WHERE t.lancamento_id = p_lancamento_id
      AND t.embedding IS NOT NULL
      AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
    ORDER BY t.embedding <=> p_embedding
    LIMIT v_k;
    RETURN;
  END IF;

  IF v_pergunta = '' THEN RETURN; END IF;

  -- `websearch_to_tsquery` aceita a pergunta como a pessoa escreve, sem
  -- exigir operador. `plainto_` casaria TODAS as palavras, e "tem varanda
  -- gourmet?" não acharia nada por causa do "tem".
  RETURN QUERY
  SELECT t.id, d.id, d.titulo, d.tipo, t.texto,
         ts_rank(to_tsvector('portuguese', t.texto),
                 websearch_to_tsquery('portuguese', v_pergunta))::real,
         'palavra'::text
  FROM kb_trechos t
  JOIN kb_documentos d ON d.id = t.documento_id
  WHERE t.lancamento_id = p_lancamento_id
    AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
    AND to_tsvector('portuguese', t.texto) @@ websearch_to_tsquery('portuguese', v_pergunta)
  ORDER BY 6 DESC
  LIMIT v_k;
END;
$function$;

REVOKE ALL ON FUNCTION public.buscar_kb(uuid, text, int, vector) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_kb(uuid, text, int, vector) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Os books que já existem entram como PENDENTES
--
-- Decidido pelo chefe em 20/09/2026. São 40 nos 59 lançamentos da Lotus, e
-- nenhum foi lido por ninguém. Entrando como pendentes, o gestor vê o tamanho
-- do trabalho — e eles caem na fila sozinhos quando a indexação ligar.
-- ------------------------------------------------------------
INSERT INTO public.kb_documentos (tenant_id, lancamento_id, titulo, tipo, arquivo_url, status_indexacao)
SELECT l.tenant_id, l.id,
       COALESCE(NULLIF(btrim(l.book_pdf_filename), ''), 'Book do empreendimento'),
       'book', l.book_pdf, 'pendente'
FROM public.lancamentos l
WHERE l.book_pdf IS NOT NULL AND btrim(l.book_pdf) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.kb_documentos k
    WHERE k.lancamento_id = l.id AND k.tipo = 'book' AND k.arquivo_url = l.book_pdf
  );

COMMIT;
