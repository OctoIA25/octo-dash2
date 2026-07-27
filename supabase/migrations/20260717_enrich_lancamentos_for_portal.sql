-- Enriquecer `lancamentos` com os campos que o Portal público exibe nos cards.
--
-- Contexto: os cards de empreendimento da home e de /lotus-lancamentos mostram
-- localização, estágio, construtora, tipologia, specs, preço e selo "exclusivo".
-- A tabela `lancamentos` só tinha nome/descricao/fotos/endereco_plantao — sem
-- esses campos, o Portal dinâmico degradaria o visual (perderia paridade 100%).
-- Esta migração adiciona as colunas; a equipe preenche no dashboard; só então o
-- Portal dinamiza os cards mantendo o design idêntico.
--
-- Todas as colunas são NULLABLE (não quebram os 37 registros existentes) e não
-- têm efeito no dashboard até serem usadas. Zero impacto em RLS/policies.
--
-- Valores observados no site atual (referência para o preenchimento e os CHECKs):
--   estagio: 'Pré-lançamento' | 'Lançamento' | 'Em obras' | 'Pronto' | 'Pronto para morar'
--   (CHECK propositalmente permissivo: aceita variações; o card exibe o texto cru.)
--
-- ROLLBACK:
--   ALTER TABLE public.lancamentos
--     DROP COLUMN IF EXISTS cidade, DROP COLUMN IF EXISTS bairro,
--     DROP COLUMN IF EXISTS estagio, DROP COLUMN IF EXISTS construtora,
--     DROP COLUMN IF EXISTS dormitorios, DROP COLUMN IF EXISTS specs,
--     DROP COLUMN IF EXISTS preco_texto, DROP COLUMN IF EXISTS exclusivo,
--     DROP COLUMN IF EXISTS publicar_site;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS cidade        TEXT,
  ADD COLUMN IF NOT EXISTS bairro        TEXT,
  ADD COLUMN IF NOT EXISTS estagio       TEXT,     -- "Em obras", "Lançamento", "Pronto"...
  ADD COLUMN IF NOT EXISTS construtora   TEXT,
  ADD COLUMN IF NOT EXISTS dormitorios   TEXT,     -- "2 e 3 dorms", "até 4 suítes"...
  ADD COLUMN IF NOT EXISTS specs         TEXT,     -- "58–105 m² · 2 e 3 dorms"
  ADD COLUMN IF NOT EXISTS preco_texto   TEXT,     -- "Consultar valor" / "a partir de R$ ..."
  ADD COLUMN IF NOT EXISTS exclusivo     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publicar_site BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.lancamentos.cidade        IS 'Cidade do empreendimento (Portal).';
COMMENT ON COLUMN public.lancamentos.bairro        IS 'Bairro do empreendimento (Portal).';
COMMENT ON COLUMN public.lancamentos.estagio       IS 'Estágio da obra: Em obras / Lançamento / Pronto etc (Portal).';
COMMENT ON COLUMN public.lancamentos.construtora   IS 'Construtora/incorporadora (Portal).';
COMMENT ON COLUMN public.lancamentos.dormitorios   IS 'Tipologia resumida, ex "2 e 3 dorms" (Portal).';
COMMENT ON COLUMN public.lancamentos.specs         IS 'Linha de specs do card, ex "58–105 m² · 2 e 3 dorms" (Portal).';
COMMENT ON COLUMN public.lancamentos.preco_texto   IS 'Preço exibido como texto, ex "Consultar valor" (Portal).';
COMMENT ON COLUMN public.lancamentos.exclusivo     IS 'Selo "Lotus Listing" no card (Portal).';
COMMENT ON COLUMN public.lancamentos.publicar_site IS 'Se aparece no Portal público. Default true.';
