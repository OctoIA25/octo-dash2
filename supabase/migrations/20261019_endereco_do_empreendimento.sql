-- ============================================================
-- Endereço do empreendimento, separado do plantão
--
-- Pedido do Erick em 01/10: "colocar em Lançamentos, além do endereço de
-- plantão (que já tem), o Endereço do Empreendimento... muitas vezes não é o
-- mesmo". Até aqui o pino do lançamento no Mapa saía do plantão — o estande de
-- vendas, não o prédio.
--
-- O pino passa a sair do endereço do empreendimento; sem ele, do plantão, como
-- antes. O plantão continua sendo o que a Lia informa ao cliente para visita.
--
-- As duas funções abaixo são o texto de produção (pg_get_functiondef em 02/10)
-- com UMA troca: o endereço do lançamento. As duas montam o mesmo endereço de
-- propósito — a tela e a fila de geocodificação não podem divergir.
--
-- `authenticated` tem SELECT/UPDATE na tabela inteira: a coluna nova já nasce
-- legível e gravável pela tela. `anon` (site) lê só colunas listadas; esta
-- fica de fora até o site pedir.
-- ============================================================

BEGIN;

ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS endereco_empreendimento text;

COMMENT ON COLUMN public.lancamentos.endereco_empreendimento IS
  'Onde o prédio fica (nem sempre é o plantão). É a origem do pino no Mapa; vazio = usa endereco_plantao.';

CREATE OR REPLACE FUNCTION public.mapa_pontos(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
      -- 20261019: o empreendimento primeiro; o plantão só quando ele falta.
      (SELECT e.endereco FROM public.mapa_endereco(
         COALESCE(NULLIF(btrim(l.endereco_empreendimento), ''), NULLIF(btrim(l.endereco_plantao), '')),
         NULL, l.bairro, l.cidade, NULL) e) AS endereco
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

CREATE OR REPLACE FUNCTION public.mapa_fila_de_geocodificacao(p_tenant_id uuid, p_limite integer DEFAULT 100, p_com_erro boolean DEFAULT false)
 RETURNS TABLE(tipo text, id uuid, endereco text, precisao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tipo, id, endereco, precisao FROM (
    SELECT 'lancamento'::text AS tipo, l.id, e.endereco, e.precisao, l.geo_erro
      FROM lancamentos l
      -- 20261019: o empreendimento primeiro; o plantão só quando ele falta.
      CROSS JOIN LATERAL public.mapa_endereco(
        COALESCE(NULLIF(btrim(l.endereco_empreendimento), ''), NULLIF(btrim(l.endereco_plantao), '')),
        NULL, l.bairro, l.cidade, NULL) e
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

-- A coluna nova fica invisível para a tela sem isto — e sem erro nenhum.
NOTIFY pgrst, 'reload schema';

COMMIT;
