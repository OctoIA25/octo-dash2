-- ===========================================================================
-- Chave canônica de telefone do lead (deduplicação por número, não por string)
--
-- O PROBLEMA. `leads.phone` guarda o que cada origem manda: a Lia grava o
-- wa_id ("5544998810678", às vezes SEM o 9º dígito), o ZAP grava 11 dígitos
-- sem DDI, Meta/Imovelweb gravam "+55…", o Santa Ângela chegou a gravar
-- "+19984287733" (o '+' colado no DDD). A única trava é
-- unique_phone_per_tenant, que compara STRING: em 17/09/2026 havia 156 grupos
-- de leads (156 fichas a mais) que são a mesma pessoa em formatos diferentes.
--
-- O QUE ESTA MIGRATION FAZ. Adiciona uma coluna DERIVADA com a forma canônica
-- do número. O valor original de `phone` continua intacto — auditoria do que a
-- origem mandou — e a comparação passa a ser pela chave.
--
-- O QUE ELA NÃO FAZ. Não cria constraint de unicidade sobre a chave e não
-- apaga/mescla nada do histórico: hoje 142 dos 156 grupos duplicados nascem do
-- fluxo da Lia (n8n, fora deste repositório), e travar no banco faria o INSERT
-- dela falhar sem que se saiba como o workflow trata o erro. Enquanto isso a
-- coluna serve para (a) o servidor achar o lead existente ANTES de inserir e
-- (b) a dashboard mostrar "já existe outra ficha com este telefone".
--
-- Espelha server/utils/phone.js (classificarTelefone) e src/lib/contato.ts.
-- Mudou a regra aqui, muda nos três.
-- ===========================================================================

-- Migration bloqueia a tabela leads por instantes: falhar rápido é melhor que
-- segurar a fila de escrita dos syncs.
SET lock_timeout = '5s';

-- Chave canônica: '55' + DDD + número, ou NULL quando o valor não serve como
-- identificador (incompleto, dígito a mais, DDD inexistente).
-- Celular sem o 9º dígito recebe o 9 (faixa 6-9 do plano da Anatel, é o mesmo
-- número); FIXO (2-5) NÃO recebe, senão viraria um número que não existe.
-- search_path fixo: esta função é a expressão da coluna gerada, então roda sob
-- o search_path de QUEM escreve em leads (inclusive a Lia com service_role).
-- Sem fixar, os operadores/regex sairiam do caminho do chamador.
CREATE OR REPLACE FUNCTION public.lead_phone_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  WITH d AS (SELECT regexp_replace(COALESCE(v, ''), '\D', '', 'g') AS dg),
  n AS (
    SELECT dg,
           CASE WHEN dg ~ '^55\d{10,11}$' THEN substr(dg, 3)
                WHEN dg ~ '^\d{10,11}$'   THEN dg END AS nat
      FROM d
  )
  SELECT CASE
    WHEN nat IS NOT NULL THEN
      CASE WHEN substr(nat, 1, 2) ~ '^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$' THEN
        CASE
          WHEN substr(nat, 3) ~ '^9\d{8}$'     THEN '55' || nat
          WHEN substr(nat, 3) ~ '^[6-9]\d{7}$' THEN '55' || substr(nat, 1, 2) || '9' || substr(nat, 3)
          WHEN substr(nat, 3) ~ '^[2-5]\d{7}$' THEN '55' || nat
        END
      END
    -- E.164 de outro país (o wa_id da Lia traz +86, +351, +54…): vale como
    -- identificador, são iguais só se forem o mesmo número.
    WHEN length(dg) BETWEEN 12 AND 15 AND dg ~ '^[1-9]' AND dg NOT LIKE '55%' THEN dg
  END
  FROM n;
$$;

COMMENT ON FUNCTION public.lead_phone_key(text) IS
  'Forma canônica do telefone do lead para deduplicação; NULL quando o número não serve como identificador. Espelha server/utils/phone.js.';

-- Coluna derivada: sempre coerente com phone, impossível de esquecer de
-- atualizar. GENERATED não aceita INSERT/UPDATE — nenhum caminho de escrita
-- precisa mudar por causa dela.
--
-- ATENÇÃO AO MUDAR A REGRA DEPOIS: um CREATE OR REPLACE da função acima NÃO
-- recalcula o que já está gravado — as chaves antigas ficam como estavam, sem
-- erro nenhum, e o dedup passa a errar em silêncio. Mudou a regra, a coluna
-- precisa ser recriada (DROP COLUMN + este ADD COLUMN, que reescreve a tabela).
--
-- ADD COLUMN GENERATED reescreve a tabela inteira com ACCESS EXCLUSIVE: o
-- lock_timeout acima faz a migration falhar rápido em vez de segurar a fila de
-- escrita dos syncs se a tabela estiver ocupada.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (public.lead_phone_key(phone)) STORED;

COMMENT ON COLUMN public.leads.phone_key IS
  'Telefone canônico (derivado de phone). Usado para achar o lead existente antes de inserir e para sinalizar fichas duplicadas.';

-- Busca por chave dentro do tenant (é sempre assim que se pergunta).
CREATE INDEX IF NOT EXISTS idx_leads_tenant_phone_key
  ON public.leads (tenant_id, phone_key)
  WHERE phone_key IS NOT NULL;

-- GRANT explícito da coluna. Hoje `leads` tem GRANT no nível de TABELA para
-- anon/authenticated (conferido no banco em 17/09), então a coluna já nasceria
-- legível e esta linha é redundante — quem barra o anon é a RLS de leads, não o
-- GRANT. Fica pelo caso de o privilégio virar por coluna, como em
-- imoveis_locais, onde coluna nova sem GRANT quebrou a tela.
GRANT SELECT (phone_key) ON public.leads TO authenticated, service_role;
