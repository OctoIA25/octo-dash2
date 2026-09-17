-- Migration: tira a escrita anônima de imoveis_locais e condominios
-- Data: 2026-09-17
-- Descrição: `anon` tinha DELETE, INSERT, UPDATE, TRUNCATE, REFERENCES e TRIGGER
-- nas duas tabelas. A anon key vai no bundle do front, então isso é privilégio
-- de escrita concedido a qualquer visitante.
--
-- Hoje a RLS segura: as três policies de `anon` nessas tabelas são todas de
-- SELECT (portal_anon_select_imoveis_locais, portal_anon_count_imoveis,
-- portal_anon_select_condominios). Ou seja, o grant não serve a nada — mas fica
-- armado: a primeira policy de INSERT ou UPDATE que alguém escrever para `anon`,
-- por engano ou por conveniência, abre gravação pública sem nenhum aviso.
--
-- O portal público continua lendo: o SELECT do `anon` é por COLUNA (42 das 75
-- colunas de imoveis_locais, 100 das 107 de condominios) e não é tocado aqui.
-- Mesma linha da 20260912_rls_fecha_acessos_anon.sql, que fechou os acessos
-- anônimos que nenhuma tela usava.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.imoveis_locais, public.condominios FROM anon;
