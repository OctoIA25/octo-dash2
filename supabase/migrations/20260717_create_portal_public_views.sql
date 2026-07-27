-- Portal público (Lotus / "Japi Lançamentos") — leitura ANÔNIMA de dados publicados.
--
-- Contexto: o Portal público (site em Next.js, repo allegrato-landing) precisa
-- ler imóveis/empreendimentos publicados SEM login, usando a anon key. Hoje o
-- RLS bloqueia tudo para a role `anon` (SELECT anônimo em condominios /
-- imoveis_locais retorna []). Esta migração cria a fronteira pública mínima.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que security_invoker (e NÃO security definer):
--   Views são security_definer por padrão e IGNORAM o RLS das tabelas base.
--   Expor uma view definer à role `anon` dispara o linter do Supabase
--   ("Security Definer View") e é a causa clássica de vazamento. Usamos
--   `security_invoker = true` (Postgres 15+): a view respeita o RLS das tabelas
--   base para quem chama. Isso exige que `anon` tenha acesso de leitura às linhas
--   públicas das tabelas base — concedido de forma restrita abaixo.
--
-- ⚠️ ARMADILHA (corrigida aqui): RLS é POR-LINHA, não por-coluna. Uma policy
--   `SELECT TO anon` dá à role acesso à LINHA INTEIRA — todas as colunas. Como o
--   Supabase concede SELECT table-wide a `anon` em `public` por padrão, o anon
--   consegue ler `proprietario_nome/telefone` DIRETO na tabela base via
--   PostgREST (`?select=proprietario_nome`), contornando a view. A view sozinha
--   NÃO protege PII. Correção: privilégio de coluna — REVOKE do SELECT
--   table-wide de `anon` + GRANT SELECT apenas nas COLUNAS públicas. Assim:
--     (a) anon lê só colunas públicas, mesmo indo direto na tabela base;
--     (b) colunas NOVAS futuras NÃO vazam por padrão (não entram no grant);
--     (c) a view security_invoker continua funcionando (anon tem privilégio nas
--         colunas que a view usa).
--   NÃO tocamos `authenticated` (dashboard logado) nem `service_role`.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Estratégia (defesa em 3 camadas):
--   1. Policy `SELECT TO anon` restrita ao público (fronteira de LINHAS):
--        - condominios    : USING (publicar_site = true)
--        - imoveis_locais : USING (status_aprovacao = 'aprovado')
--   2. Privilégio de COLUNA para `anon` (fronteira de COLUNAS, à prova de PII):
--        REVOKE SELECT table-wide + GRANT SELECT só nas colunas públicas.
--   3. Views security_invoker com SELECT explícito (ergonomia p/ o Portal) +
--      GRANT SELECT nas views.
--
-- Tenant NÃO é travado (decisão de produto: multi-tenant futuro). O Portal
-- SEMPRE filtra por tenant_id da Lotus (65c69875-dc83-4062-90f6-6f6adc30df26).
-- ⚠️ Consequência: as views/policies expõem os PUBLICADOS de TODOS os tenants a
-- quem consultar sem filtro. Acordado (dados já-públicos por natureza).
--
-- LGPD: proprietario_nome/telefone/email NUNCA são legíveis por `anon` (nem via
-- view, nem via tabela base) — garantido pelo GRANT de coluna. Contato no Portal
-- é sempre via corretor/imobiliária.
--
-- Impacto no dashboard: nenhum dado/coluna alterado; policies e grants de
-- `authenticated`/`service_role` inalterados. Só se adiciona acesso a `anon`.
--
-- ⚠️ fotos: URLs vêm como estão no banco. Condomínio → endpoint watermark do
-- dash (easypanel); imóvel → Storage do Supabase. Portal usa como recebido.
--
-- ⚠️ PREFLIGHT: requer Postgres 15+ (security_invoker). Supabase atual atende.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (reverte 100% — restaura o SELECT table-wide default do anon):
--   DROP VIEW IF EXISTS public.portal_imoveis;
--   DROP VIEW IF EXISTS public.portal_condominios;
--   DROP POLICY IF EXISTS portal_anon_select_condominios ON public.condominios;
--   DROP POLICY IF EXISTS portal_anon_select_imoveis_locais ON public.imoveis_locais;
--   GRANT SELECT ON public.condominios TO anon;      -- volta ao default Supabase
--   GRANT SELECT ON public.imoveis_locais TO anon;   -- volta ao default Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ APLICAÇÃO: os REVOKE/GRANT/CREATE POLICY pegam lock nas tabelas. Se o
-- dashboard estiver ativo, pode dar "deadlock detected" (a transação sofre
-- rollback inteiro — nada é aplicado, basta reexecutar). Rode em UMA transação
-- com lock_timeout curto para falhar rápido em vez de travar. Preferir aplicar
-- num momento de baixo tráfego (ou via `supabase db push`, sessão única).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. Policies de leitura anônima nas tabelas base (fronteira de LINHAS)
-- ============================================================================
DROP POLICY IF EXISTS portal_anon_select_condominios ON public.condominios;
CREATE POLICY portal_anon_select_condominios
  ON public.condominios
  FOR SELECT
  TO anon
  USING (publicar_site = true);

DROP POLICY IF EXISTS portal_anon_select_imoveis_locais ON public.imoveis_locais;
CREATE POLICY portal_anon_select_imoveis_locais
  ON public.imoveis_locais
  FOR SELECT
  TO anon
  USING (status_aprovacao = 'aprovado');

-- ============================================================================
-- 2. Privilégio de COLUNA para anon (fronteira de COLUNAS — bloqueia PII)
--    Remove o SELECT table-wide default e reconcede só o público.
-- ============================================================================
REVOKE SELECT ON public.condominios FROM anon;
GRANT SELECT (
  id, tenant_id, codigo, nome, pais, estado, cidade, bairro, logradouro, numero,
  cep, tipo, status, status_comercial, construtora, incorporadora, ano_construcao,
  imobiliaria_exclusiva, num_blocos_torres, data_entrega,
  infra_acesso_pne, infra_banheiro_pne, infra_elevador, infra_elevador_servico,
  infra_aquecedor_solar, infra_coleta_reciclavel, infra_reaprov_agua_chuva,
  infra_energia_solar, infra_esgoto, infra_guarita, infra_praca_recreacao,
  infra_academia, infra_bicicletario, infra_brinquedoteca, infra_campo_futebol,
  infra_churrasqueira, infra_deck_molhado, infra_espaco_gourmet, infra_espaco_zen,
  infra_hidromassagem, infra_lago, infra_piscina, infra_piscina_adulto,
  infra_piscina_aquecida, infra_piscina_coberta, infra_piscina_infantil,
  infra_playground, infra_quadra_beach_tenis, infra_quadra_squash,
  infra_quadra_tenis, infra_quadra_gramada, infra_quadra_poliesportiva,
  infra_sala_fitness, infra_sala_ginastica, infra_salao_festas, infra_salao_jogos,
  infra_salao_cinema, infra_sauna_seca, infra_sauna_umida, infra_solarium,
  infra_spa, infra_cabine_primaria, infra_catraca_eletronica, infra_cerca_eletrica,
  infra_circuito_tv, infra_guarita_blindada, infra_guarita_seguranca,
  infra_portao_eletronico, infra_portaria_24h, infra_seguranca_interna,
  infra_seguranca_patrimonial, infra_sistema_incendio, infra_sistema_seguranca,
  infra_vigia_externo, infra_vigilancia_24h, infra_central_limpeza,
  infra_escritorio_virtual, infra_massagista, infra_personal_training,
  infra_restaurante, infra_sala_massagem, infra_tv_cabo, infra_wifi,
  infra_estacionamento_rotativo, infra_lavanderia_coletiva, infra_praca_convivencia,
  infra_vaga_visita, publicar_site, destaque, tour_virtual, descricao_site,
  created_at, updated_at, fotos, metragens_disponiveis, infra_mirante,
  infra_espaco_pet, infra_quadra_areia, infra_pomar, infra_gas_encanado
) ON public.condominios TO anon;

REVOKE SELECT ON public.imoveis_locais FROM anon;
GRANT SELECT (
  id, tenant_id, codigo_imovel, titulo, tipo, tipo_simplificado, finalidade,
  logradouro, numero, complemento, bairro, cidade, estado, cep, area_total,
  area_util, quartos, suites, banheiros, vagas, salas, valor_venda, valor_locacao,
  valor_condominio, valor_iptu, descricao, fotos, created_at, updated_at,
  metragem_m2, condominio_id, exclusivo, area_comum, area_privativa, aceita_troca,
  link_video, tour_virtual,
  status_aprovacao   -- necessário: a view security_invoker roda como `anon` e
                     -- filtra WHERE status_aprovacao='aprovado'; sem privilégio
                     -- nesta coluna a view daria "permission denied". É um enum
                     -- de status (não PII), inócuo de expor.
) ON public.imoveis_locais TO anon;
-- OMITIDO do grant (PII/interno): proprietario_nome, proprietario_telefone,
-- proprietario_email, criado_por, aprovado_por, aprovado_em, motivo_aprovacao.
-- (publicar_site em condominios idem: já incluído acima por ser coluna de filtro.)

-- ============================================================================
-- 3. portal_condominios (empreendimentos publicados) — security_invoker
-- ============================================================================
CREATE OR REPLACE VIEW public.portal_condominios
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  codigo,
  nome,
  pais,
  estado,
  cidade,
  bairro,
  logradouro,
  numero,
  cep,
  tipo,
  status,
  status_comercial,
  construtora,
  incorporadora,
  ano_construcao,
  imobiliaria_exclusiva,
  num_blocos_torres,
  data_entrega,
  infra_acesso_pne, infra_banheiro_pne, infra_elevador, infra_elevador_servico,
  infra_aquecedor_solar, infra_coleta_reciclavel, infra_reaprov_agua_chuva,
  infra_energia_solar, infra_esgoto, infra_guarita, infra_praca_recreacao,
  infra_academia, infra_bicicletario, infra_brinquedoteca, infra_campo_futebol,
  infra_churrasqueira, infra_deck_molhado, infra_espaco_gourmet, infra_espaco_zen,
  infra_hidromassagem, infra_lago, infra_piscina, infra_piscina_adulto,
  infra_piscina_aquecida, infra_piscina_coberta, infra_piscina_infantil,
  infra_playground, infra_quadra_beach_tenis, infra_quadra_squash,
  infra_quadra_tenis, infra_quadra_gramada, infra_quadra_poliesportiva,
  infra_sala_fitness, infra_sala_ginastica, infra_salao_festas, infra_salao_jogos,
  infra_salao_cinema, infra_sauna_seca, infra_sauna_umida, infra_solarium,
  infra_spa, infra_cabine_primaria, infra_catraca_eletronica, infra_cerca_eletrica,
  infra_circuito_tv, infra_guarita_blindada, infra_guarita_seguranca,
  infra_portao_eletronico, infra_portaria_24h, infra_seguranca_interna,
  infra_seguranca_patrimonial, infra_sistema_incendio, infra_sistema_seguranca,
  infra_vigia_externo, infra_vigilancia_24h, infra_central_limpeza,
  infra_escritorio_virtual, infra_massagista, infra_personal_training,
  infra_restaurante, infra_sala_massagem, infra_tv_cabo, infra_wifi,
  infra_estacionamento_rotativo, infra_lavanderia_coletiva, infra_praca_convivencia,
  infra_vaga_visita, infra_mirante, infra_espaco_pet, infra_quadra_areia,
  infra_pomar, infra_gas_encanado,
  destaque,
  tour_virtual,
  descricao_site,
  fotos,                  -- jsonb: [{id, url, isCapa, legenda}]
  metragens_disponiveis,  -- jsonb: [int, ...]
  created_at,
  updated_at
FROM public.condominios
WHERE publicar_site = true;

COMMENT ON VIEW public.portal_condominios IS
  'Empreendimentos publicados (publicar_site=true) para o Portal público. '
  'security_invoker; PII/interno bloqueado por grant de coluna. Filtre por tenant_id no cliente.';

-- ============================================================================
-- 4. portal_imoveis (imóveis manuais aprovados) — security_invoker
-- ============================================================================
CREATE OR REPLACE VIEW public.portal_imoveis
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  codigo_imovel,
  titulo,
  tipo,
  tipo_simplificado,
  finalidade,
  logradouro,
  numero,
  complemento,
  bairro,
  cidade,
  estado,
  cep,
  area_total,
  area_util,
  quartos,
  suites,
  banheiros,
  vagas,
  salas,
  valor_venda,
  valor_locacao,
  valor_condominio,
  valor_iptu,
  descricao,
  fotos,             -- jsonb: [{id, url, ...}] — URL aponta pro Storage Supabase
  metragem_m2,
  condominio_id,     -- FK opcional -> portal_condominios.id
  exclusivo,
  area_comum,        -- jsonb
  area_privativa,    -- jsonb
  aceita_troca,
  link_video,
  tour_virtual,
  created_at,
  updated_at
FROM public.imoveis_locais
WHERE status_aprovacao = 'aprovado';

COMMENT ON VIEW public.portal_imoveis IS
  'Imóveis manuais aprovados (status_aprovacao=aprovado) para o Portal público. '
  'security_invoker; dados do proprietário (PII) bloqueados por grant de coluna (LGPD). Filtre por tenant_id no cliente.';

-- ============================================================================
-- 5. Grants das views
-- ============================================================================
GRANT SELECT ON public.portal_condominios TO anon, authenticated;
GRANT SELECT ON public.portal_imoveis      TO anon, authenticated;

COMMIT;
