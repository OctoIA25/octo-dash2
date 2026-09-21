-- Migration: Mapa interligado (P2.6)
-- Data: 2026-09-21
--
-- O Mapa de Imóveis já existe (Leaflet) e, desde 18/09, já mostra os imóveis.
-- O que falta é o "interligado": lançamentos e condomínios não aparecem nele,
-- e nenhuma das três tabelas guarda coordenada.
--
-- POR QUE COORDENADA NA LINHA, SE JÁ EXISTE `geocoded_addresses`
-- O cache existente tem 193 linhas e é chaveado por ENDEREÇO — ele responde
-- "onde fica esta rua". Serve, e continua servindo, para não geocodificar duas
-- vezes o mesmo endereço.
--
-- Mas o plano pede pino ARRASTÁVEL, e pino é por REGISTRO. Dois imóveis no
-- mesmo endereço compartilham a linha do cache: arrastar o pino de um moveria o
-- do outro. E o cache tem 0 linhas com `source = 'manual'` — o arrastar nunca
-- existiu, então não há nada a preservar. São duas perguntas diferentes:
--   cache  → "que coordenada tem este endereço?"
--   coluna → "onde fica o pino DESTE registro?"
--
-- `geo_origem = 'manual'` é o que protege a posição arrastada de ser
-- sobrescrita na próxima geocodificação. É a regra que o plano chama de pronta:
-- "pino arrastado não volta para a posição automática".
--
-- ORDEM DO DEPLOY: banco antes do servidor e do front. Colunas aditivas.
-- Rollback: dropar as colunas; o mapa volta a resolver tudo pelo cache.

-- ------------------------------------------------------------
-- 1. As coordenadas, nos três tipos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lancamentos', 'condominios', 'imoveis_locais'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS latitude double precision', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS longitude double precision', t);

    -- 'manual' = alguém arrastou o pino. A geocodificação automática nunca
    -- sobrescreve essa linha.
    EXECUTE format($f$
      ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS geo_origem text
        CHECK (geo_origem IS NULL OR geo_origem IN ('automatica', 'manual'))
    $f$, t);

    -- 'aproximada' = o pino saiu de bairro/cidade, não de um endereço.
    -- Decidido pelo chefe em 21/09/2026: 18 dos 59 lançamentos da Lotus não têm
    -- endereço de plantão nenhum. Em vez de sumirem do mapa, entram pelo bairro
    -- — e a tela DIZ que aquele pino é aproximado. Pino aproximado sem aviso é
    -- pior que pino nenhum: o corretor leva o cliente ao lugar errado.
    EXECUTE format($f$
      ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS geo_precisao text
        CHECK (geo_precisao IS NULL OR geo_precisao IN ('exata', 'aproximada'))
    $f$, t);

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS geo_em timestamptz', t);

    -- O plano pede "relatório dos endereços que não foram encontrados". Guardado
    -- na própria linha, o relatório é uma consulta — e o gestor vê o motivo ao
    -- lado do cadastro, em vez de num arquivo que alguém precisa abrir.
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS geo_erro text', t);

    -- Quem ainda não tem coordenada é o que o script em massa procura.
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id) WHERE latitude IS NULL
    $f$, t || '_sem_geo_idx', t);
  END LOOP;
END $$;

-- A coluna nova nasce sem permissão para quem já lia a tabela: sem isto, a
-- tela continua vendo o registro e o pino nunca aparece — e não há erro.
GRANT SELECT (latitude, longitude, geo_origem, geo_precisao, geo_em, geo_erro)
  ON public.lancamentos, public.condominios, public.imoveis_locais
  TO authenticated;
GRANT UPDATE (latitude, longitude, geo_origem, geo_precisao, geo_em, geo_erro)
  ON public.lancamentos, public.condominios, public.imoveis_locais
  TO authenticated;

-- ------------------------------------------------------------
-- 2. O endereço de cada tipo, numa regra só
-- ------------------------------------------------------------
-- Existe para o servidor e a tela NÃO montarem cada um o seu endereço. Duas
-- montagens divergentes dariam duas chaves de cache para o mesmo lugar, e o
-- mapa geocodificaria de novo o que já sabia.
--
-- Devolve NULL quando não há nem cidade: sem cidade, a busca por "Rua X" acha
-- uma Rua X em qualquer canto do Brasil, e o pino cai longe sem avisar.
CREATE OR REPLACE FUNCTION public.mapa_endereco(
  p_logradouro text,
  p_numero     text,
  p_bairro     text,
  p_cidade     text,
  p_estado     text
)
RETURNS TABLE (endereco text, precisao text)
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT
    CASE
      WHEN btrim(COALESCE(p_cidade, '')) = '' THEN NULL
      WHEN btrim(COALESCE(p_logradouro, '')) <> '' THEN
        concat_ws(', ',
          NULLIF(btrim(p_logradouro), '') || COALESCE(' ' || NULLIF(btrim(p_numero), ''), ''),
          NULLIF(btrim(p_bairro), ''),
          NULLIF(btrim(p_cidade), ''),
          NULLIF(btrim(p_estado), ''),
          'Brasil')
      ELSE
        concat_ws(', ',
          NULLIF(btrim(p_bairro), ''),
          NULLIF(btrim(p_cidade), ''),
          NULLIF(btrim(p_estado), ''),
          'Brasil')
    END,
    CASE
      WHEN btrim(COALESCE(p_cidade, '')) = '' THEN NULL
      WHEN btrim(COALESCE(p_logradouro, '')) <> '' THEN 'exata'
      ELSE 'aproximada'
    END;
$function$;

-- ------------------------------------------------------------
-- 3. Os pontos do mapa
-- ------------------------------------------------------------
-- Um lugar só que sabe montar o ponto de cada tipo. A tela pede, desenha, e não
-- precisa conhecer três formatos de cadastro.
--
-- Os imóveis entram aqui TAMBÉM — e não só pela lista que a tela já recebe —
-- porque a coordenada arrastada mora agora na linha. A tela usa estes pontos
-- como posição preferida do imóvel que ela já tem em mãos; o imóvel que só
-- existe no XML (Japi) continua sendo resolvido pelo cache de endereço.
CREATE OR REPLACE FUNCTION public.mapa_pontos(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_pontos jsonb;
  v_totais jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  WITH pontos AS (
    SELECT
      'lancamento'::text AS tipo,
      l.id::text         AS id,
      NULL::text         AS ref,
      l.nome             AS nome,
      array_to_string(l.codigos, ', ') AS codigo,
      l.latitude, l.longitude, l.geo_origem, l.geo_precisao, l.geo_erro,
      l.bairro, l.cidade,
      (l.fotos ->> 0)    AS foto,
      -- Preço calculado das tipologias (P2.1); o texto livre é o que sempre
      -- apareceu no card e continua valendo quando não há tipologia.
      COALESCE(
        (SELECT 'a partir de R$ ' || to_char(public.lancamento_preco_a_partir(l.id), 'FM999G999G999')
           WHERE public.lancamento_preco_a_partir(l.id) IS NOT NULL),
        NULLIF(btrim(l.preco_texto), '')
      )                  AS preco,
      ('/imoveis/lancamentos/' || l.id::text) AS link,
      (SELECT e.endereco FROM public.mapa_endereco(
         NULLIF(btrim(l.endereco_plantao), ''), NULL, l.bairro, l.cidade, NULL) e) AS endereco
    FROM lancamentos l
    WHERE l.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'condominio', c.id::text, NULL, c.nome, c.codigo,
      c.latitude, c.longitude, c.geo_origem, c.geo_precisao, c.geo_erro,
      c.bairro, c.cidade, (c.fotos ->> 0), NULL,
      ('/imoveis?tab=condominios&id=' || c.id::text),
      (SELECT e.endereco FROM public.mapa_endereco(c.logradouro, c.numero, c.bairro, c.cidade, c.estado) e)
    FROM condominios c
    WHERE c.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'imovel', i.id::text, i.codigo_imovel, i.titulo, i.codigo_imovel,
      i.latitude, i.longitude, i.geo_origem, i.geo_precisao, i.geo_erro,
      i.bairro, i.cidade, (i.fotos ->> 0),
      CASE
        WHEN i.valor_venda > 0 THEN 'R$ ' || to_char(i.valor_venda, 'FM999G999G999')
        WHEN i.valor_locacao > 0 THEN 'R$ ' || to_char(i.valor_locacao, 'FM999G999G999') || '/mês'
      END,
      ('/imoveis?id=' || i.id::text),
      (SELECT e.endereco FROM public.mapa_endereco(i.logradouro, i.numero, i.bairro, i.cidade, i.estado) e)
    FROM imoveis_locais i
    WHERE i.tenant_id = p_tenant_id
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.tipo, p.nome) FILTER (WHERE p.latitude IS NOT NULL), '[]'::jsonb),
    jsonb_build_object(
      'lancamentos', jsonb_build_object(
        'total', count(*) FILTER (WHERE p.tipo = 'lancamento'),
        'no_mapa', count(*) FILTER (WHERE p.tipo = 'lancamento' AND p.latitude IS NOT NULL),
        -- Quem nem endereço tem NUNCA vai aparecer, por mais que se
        -- geocodifique. É outro problema do "ainda não geocodifiquei", e o
        -- contador da tela precisa saber a diferença para não prometer.
        'sem_endereco', count(*) FILTER (WHERE p.tipo = 'lancamento' AND p.endereco IS NULL)
      ),
      'condominios', jsonb_build_object(
        'total', count(*) FILTER (WHERE p.tipo = 'condominio'),
        'no_mapa', count(*) FILTER (WHERE p.tipo = 'condominio' AND p.latitude IS NOT NULL),
        'sem_endereco', count(*) FILTER (WHERE p.tipo = 'condominio' AND p.endereco IS NULL)
      ),
      'imoveis', jsonb_build_object(
        'total', count(*) FILTER (WHERE p.tipo = 'imovel'),
        'no_mapa', count(*) FILTER (WHERE p.tipo = 'imovel' AND p.latitude IS NOT NULL),
        'sem_endereco', count(*) FILTER (WHERE p.tipo = 'imovel' AND p.endereco IS NULL)
      ),
      'aproximados', count(*) FILTER (WHERE p.latitude IS NOT NULL AND p.geo_precisao = 'aproximada'),
      'com_erro', count(*) FILTER (WHERE p.geo_erro IS NOT NULL)
    )
  INTO v_pontos, v_totais
  FROM pontos p;

  RETURN jsonb_build_object('pontos', v_pontos, 'totais', v_totais);
END;
$function$;

REVOKE ALL ON FUNCTION public.mapa_pontos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mapa_pontos(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mapa_endereco(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mapa_endereco(text, text, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. O que ainda falta geocodificar
-- ------------------------------------------------------------
-- É a fila do script em massa, e também o relatório do plano: quem não tem
-- coordenada, com o endereço que será tentado e o erro da última tentativa.
-- Só o servidor chama (service_role): é ele que fala com o Nominatim.
CREATE OR REPLACE FUNCTION public.mapa_fila_de_geocodificacao(
  p_tenant_id uuid,
  p_limite    int DEFAULT 100,
  -- true = refaz também quem já falhou uma vez. O padrão é não insistir: um
  -- endereço que o Nominatim não achou hoje não vai achar daqui a uma hora, e
  -- insistir só gasta a cota de 1 por segundo.
  p_com_erro  boolean DEFAULT false
)
RETURNS TABLE (tipo text, id uuid, endereco text, precisao text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tipo, id, endereco, precisao FROM (
    SELECT 'lancamento'::text AS tipo, l.id, e.endereco, e.precisao, l.geo_erro
      FROM lancamentos l
      CROSS JOIN LATERAL public.mapa_endereco(NULLIF(btrim(l.endereco_plantao), ''), NULL, l.bairro, l.cidade, NULL) e
     WHERE l.tenant_id = p_tenant_id AND l.latitude IS NULL AND e.endereco IS NOT NULL
    UNION ALL
    SELECT 'condominio', c.id, e.endereco, e.precisao, c.geo_erro
      FROM condominios c
      CROSS JOIN LATERAL public.mapa_endereco(c.logradouro, c.numero, c.bairro, c.cidade, c.estado) e
     WHERE c.tenant_id = p_tenant_id AND c.latitude IS NULL AND e.endereco IS NOT NULL
    UNION ALL
    SELECT 'imovel', i.id, e.endereco, e.precisao, i.geo_erro
      FROM imoveis_locais i
      CROSS JOIN LATERAL public.mapa_endereco(i.logradouro, i.numero, i.bairro, i.cidade, i.estado) e
     WHERE i.tenant_id = p_tenant_id AND i.latitude IS NULL AND e.endereco IS NOT NULL
  ) f
  WHERE p_com_erro OR f.geo_erro IS NULL
  ORDER BY f.tipo, f.endereco
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 1000);
$function$;

REVOKE ALL ON FUNCTION public.mapa_fila_de_geocodificacao(uuid, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mapa_fila_de_geocodificacao(uuid, int, boolean) TO service_role;
