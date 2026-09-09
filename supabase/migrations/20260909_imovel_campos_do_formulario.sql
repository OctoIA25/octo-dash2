-- Migration: as 16 colunas dos campos que o formulário de imóvel já coletava e
-- jogava fora.
-- Data: 2026-09-09
--
-- Contexto: CriarImovelForm renderiza estes campos desde sempre — a seção
-- "Confidencial / Documentação" inteira, mídia de origem, comissão, placa —
-- mas nenhum deles entrava no `.upsert()` e nenhum existia em imoveis_locais
-- (58 colunas, nenhuma delas). O corretor preenchia, fechava o modal e o valor
-- evaporava. Não é regressão: nunca salvou.
--
-- Tipos: text puro para tudo que a UI trata como texto/select — inclusive
-- aprovado_ambiental e projeto_aprovado, que são TRÊS estados
-- (nao_informado | sim | nao) e por isso não cabem em boolean. Só placa_local
-- é boolean, seguindo exclusivo/destaque/aceita_troca da mesma tabela, e só
-- area_terreno é numeric.
--
-- Tudo nullable e sem DEFAULT: NULL aqui significa "nunca foi preenchido", que
-- é a verdade sobre as linhas que já existem. O default de exibição
-- (envio_atividades='nao_enviar', pais='Brasil') é do formulário, não do banco.
--
-- ORDEM OBRIGATÓRIA: aplicar ANTES do deploy. O payload passa a mandar estas
-- colunas em todo save; sem elas o PostgREST devolve 42703 e o corretor perde a
-- edição inteira.

ALTER TABLE public.imoveis_locais
  ADD COLUMN IF NOT EXISTS midia_origem        text,
  ADD COLUMN IF NOT EXISTS envio_atividades    text,
  ADD COLUMN IF NOT EXISTS pais                text,
  ADD COLUMN IF NOT EXISTS area_terreno        numeric,
  ADD COLUMN IF NOT EXISTS placa_local         boolean,
  ADD COLUMN IF NOT EXISTS tipo_comissao       text,
  ADD COLUMN IF NOT EXISTS captou_pretensao    text,
  ADD COLUMN IF NOT EXISTS condicao_comercial  text,
  ADD COLUMN IF NOT EXISTS codigo_iptu         text,
  ADD COLUMN IF NOT EXISTS numero_matricula    text,
  ADD COLUMN IF NOT EXISTS codigo_eletricidade text,
  ADD COLUMN IF NOT EXISTS codigo_agua         text,
  ADD COLUMN IF NOT EXISTS titulos_direitos    text,
  ADD COLUMN IF NOT EXISTS aprovado_ambiental  text,
  ADD COLUMN IF NOT EXISTS projeto_aprovado    text,
  ADD COLUMN IF NOT EXISTS obs_documentacao    text;

COMMENT ON COLUMN public.imoveis_locais.midia_origem IS 'Como o imóvel chegou (select do CriarImovelForm).';
COMMENT ON COLUMN public.imoveis_locais.envio_atividades IS 'Periodicidade do relatório ao proprietário: nao_enviar | semanalmente | quinzenalmente | mensalmente | trimestralmente.';
COMMENT ON COLUMN public.imoveis_locais.captou_pretensao IS 'venda_locacao | somente_venda | somente_locacao.';
COMMENT ON COLUMN public.imoveis_locais.aprovado_ambiental IS 'nao_informado | sim | nao — três estados, por isso text e não boolean.';
COMMENT ON COLUMN public.imoveis_locais.projeto_aprovado IS 'nao_informado | sim | nao — três estados, por isso text e não boolean.';
COMMENT ON COLUMN public.imoveis_locais.numero_matricula IS 'Documentação do imóvel. Herda a RLS da tabela (membro do tenant lê tudo) — não é campo com proteção própria.';
