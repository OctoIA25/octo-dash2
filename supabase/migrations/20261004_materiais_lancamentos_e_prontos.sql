-- =============================================================================
-- Materiais de estudo: as categorias Lançamentos e Prontos (pedido de 30/09).
--
-- A tela passou a filtrar por categoria em botões (Geral, Lançamentos, Prontos,
-- Regras, Cursos...). As duas categorias novas só existem se o banco aceitar:
-- a lista mora no CHECK da tabela, e `material_salvar` grava direto nela.
-- "Cursos" não é categoria nova — é o rótulo de `treinamentos` na tela, para não
-- haver duas gavetas com o mesmo conteúdo.
--
-- Só amplia a lista: nenhuma linha existente muda de categoria.
-- =============================================================================

ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_categoria_check;
ALTER TABLE public.materiais ADD CONSTRAINT materiais_categoria_check CHECK (categoria IN (
  'plano_de_carreira', 'lancamentos', 'prontos', 'comissao', 'regimento', 'scripts',
  'treinamentos', 'outros'
));
