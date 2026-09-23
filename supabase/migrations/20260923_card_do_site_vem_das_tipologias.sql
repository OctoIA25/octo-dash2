-- ============================================================
-- O card do site passa a vir das tipologias (P2.1)
--
-- O plano pede: *"Card do site: 'Dormitórios' e 'Valor mínimo' passam a vir
-- das tipologias ('2 e 3 dorms · a partir de R$ 389 mil')"*.
--
-- Hoje a view `portal_lancamentos` entrega `dormitorios` e `preco_texto`
-- CRUS — os campos de texto livre, escritos à mão. Medido na Lotus: são
-- coisas como `"2 e 3 dorms"`, `"Lotes"`, `"Studio a 2 suítes"`, e o preço
-- preenchido em 30 dos 61.
--
-- A RESERVA É POR LANÇAMENTO, E A DECISÃO É DO CHEFE (20/09/2026): quem já
-- tem tipologia vê o dado novo; quem não tem continua vendo o texto de hoje.
-- A migração acontece empreendimento a empreendimento, sem um dia em que o
-- site inteiro fica vazio.
--
-- ============================================================
-- ATENÇÃO — ESTA REGRA EXISTE EM DOIS LUGARES, E É DE PROPÓSITO
-- ============================================================
--
-- A mesma derivação vive em `src/features/imoveis/utils/tipologias.ts`
-- (`paraOCard`), porque a tela de edição mostra a PRÉVIA do card enquanto a
-- pessoa digita — dado ainda não salvo, que o banco não pode calcular.
--
-- E vive aqui porque quem desenha o card publicado é o **site externo**, que
-- lê esta view e não roda o nosso TypeScript.
--
-- Nenhuma das duas dá para eliminar. O que dá é tornar a divergência
-- BARULHENTA: `supabase/tests/card_do_site.test.sql` repete, caso a caso, as
-- mesmas expectativas de `utils/__tests__/tipologias.test.ts`. Mudou uma,
-- muda a outra — e o teste cai se não mudar.
-- ============================================================

BEGIN;

/** Só a tipologia disponível entra no card. Espelha `disponiveis()`. */
CREATE OR REPLACE FUNCTION public.card_dormitorios(p_lancamento_id uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  WITH n AS (
    SELECT DISTINCT dormitorios AS d
      FROM public.tipologias
     WHERE lancamento_id = p_lancamento_id
       AND disponivel
       AND dormitorios IS NOT NULL AND dormitorios > 0
     ORDER BY 1
  ), lista AS (SELECT array_agg(d) AS ds FROM n)
  SELECT CASE
    WHEN ds IS NULL THEN NULL
    WHEN array_length(ds, 1) = 1
      THEN ds[1] || CASE WHEN ds[1] = 1 THEN ' dorm' ELSE ' dorms' END
    ELSE array_to_string(ds[1:array_length(ds,1)-1], ', ')
         || ' e ' || ds[array_length(ds,1)] || ' dorms'
  END
  FROM lista;
$function$;

/**
 * "R$ 389 mil" / "R$ 1,2 mi". Espelha `reais()` do TypeScript, inclusive o
 * detalhe de não mostrar decimal no milhão redondo.
 */
CREATE OR REPLACE FUNCTION public.card_reais(p_valor numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_valor IS NULL THEN NULL
    WHEN p_valor >= 1000000 THEN
      'R$ ' || replace(
        CASE WHEN p_valor::numeric % 1000000 = 0
             THEN to_char(p_valor / 1000000, 'FM999999990')
             ELSE to_char(p_valor / 1000000, 'FM999999990.0') END, '.', ',')
      || ' mi'
    ELSE 'R$ ' || to_char(round(p_valor / 1000), 'FM999999990') || ' mil'
  END;
$function$;

/** "64 a 92 m²", ou "64 m²" quando só há uma. Espelha `resumoDeArea()`. */
CREATE OR REPLACE FUNCTION public.card_area(p_lancamento_id uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  WITH a AS (
    SELECT min(area_privativa_m2) AS lo, max(area_privativa_m2) AS hi
      FROM public.tipologias
     WHERE lancamento_id = p_lancamento_id AND disponivel
       AND area_privativa_m2 IS NOT NULL AND area_privativa_m2 > 0
  ), fmt AS (
    SELECT replace(to_char(round(lo, 1), 'FM999999990.9'), '.', ',') AS slo,
           replace(to_char(round(hi, 1), 'FM999999990.9'), '.', ',') AS shi,
           lo, hi FROM a
  )
  SELECT CASE
    WHEN lo IS NULL THEN NULL
    WHEN lo = hi THEN rtrim(rtrim(slo, '0'), ',') || ' m²'
    ELSE rtrim(rtrim(slo, '0'), ',') || ' a ' || rtrim(rtrim(shi, '0'), ',') || ' m²'
  END FROM fmt;
$function$;

/**
 * O que o card mostra, com a reserva do texto de hoje. Espelha `paraOCard()`.
 *
 * `origem` sai junto de propósito: o site (e quem for depurar) precisa poder
 * dizer se aquele card já é o dado novo ou ainda é o texto antigo. Sem isso,
 * "2 e 3 dorms" vindo do texto e "2 e 3 dorms" vindo das tipologias ficam
 * indistinguíveis, e ninguém sabe o que já migrou.
 */
CREATE OR REPLACE FUNCTION public.card_do_lancamento(p_lancamento_id uuid)
RETURNS TABLE (dormitorios text, preco text, area text, origem text)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_dorms text; v_preco numeric; v_area text;
  v_texto_dorms text; v_texto_preco text; v_preco_num numeric;
BEGIN
  v_dorms := public.card_dormitorios(p_lancamento_id);
  v_preco := public.lancamento_preco_a_partir(p_lancamento_id);
  v_area  := public.card_area(p_lancamento_id);

  -- Tipologia cadastrada mas sem NENHUM número aproveitável cai na reserva:
  -- um card vazio é pior do que o texto antigo.
  IF v_dorms IS NOT NULL OR v_preco IS NOT NULL THEN
    RETURN QUERY SELECT v_dorms,
      CASE WHEN v_preco IS NULL THEN NULL
           ELSE 'a partir de ' || public.card_reais(v_preco) END,
      v_area, 'tipologias'::text;
    RETURN;
  END IF;

  SELECT NULLIF(btrim(l.dormitorios), ''), NULLIF(btrim(l.preco_texto), ''), l.preco_num
    INTO v_texto_dorms, v_texto_preco, v_preco_num
    FROM public.lancamentos l WHERE l.id = p_lancamento_id;

  IF v_texto_preco IS NULL AND v_preco_num IS NOT NULL AND v_preco_num > 0 THEN
    v_texto_preco := 'a partir de ' || public.card_reais(v_preco_num);
  END IF;

  IF v_texto_preco IS NULL AND v_texto_dorms IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, 'nada'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_texto_dorms, v_texto_preco, NULL::text, 'texto'::text;
END;
$function$;

-- ------------------------------------------------------------
-- A view pública
--
-- As colunas `dormitorios`, `specs` e `preco_texto` CONTINUAM como estavam:
-- o site externo as lê hoje, e trocar o significado delas por baixo mudaria a
-- tela dele sem aviso. As novas vêm ao lado, com nome próprio, e o site passa
-- a usá-las quando quiser — uma troca que alguém decide, não que acontece.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.portal_lancamentos;
CREATE VIEW public.portal_lancamentos
WITH (security_invoker = true) AS
SELECT
  l.id, l.tenant_id, l.nome, l.descricao, l.fotos, l.endereco_plantao,
  l.cidade, l.bairro, l.estagio, l.construtora,
  l.dormitorios, l.specs, l.preco_texto, l.exclusivo, l.tipo_dorms, l.preco_num,
  l.created_at, l.updated_at,
  -- P2.1: o card derivado das tipologias, com reserva no texto acima.
  c.dormitorios AS card_dormitorios,
  c.preco       AS card_preco,
  c.area        AS card_area,
  c.origem      AS card_origem
FROM public.lancamentos l
CROSS JOIN LATERAL public.card_do_lancamento(l.id) c
WHERE l.publicar_site = true;

COMMENT ON VIEW public.portal_lancamentos IS
  'Lançamentos publicados para o Portal público. As colunas card_* vêm das tipologias (P2.1), com reserva no texto antigo por lançamento; card_origem diz de onde cada uma veio.';

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.card_dormitorios(uuid)', 'public.card_area(uuid)',
    'public.card_reais(numeric)', 'public.card_do_lancamento(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    -- `anon` PRECISA executar: a view é lida pelo site público, e sem isto o
    -- LATERAL falha e o portal inteiro para.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END
$do$;

-- `pg_default_acl` dá tudo ao `anon` em toda relação NOVA — e uma view recriada
-- é uma relação nova. Medido aqui: a view nasceu com INSERT, UPDATE, DELETE e
-- TRUNCATE para `anon`.
--
-- Hoje isso não é explorável, porque o CROSS JOIN LATERAL torna a view não
-- auto-atualizável e o Postgres recusa a escrita. Mas é arma engatilhada: no
-- dia em que alguém simplificar a view, a permissão já está aqui e ela passa a
-- aceitar escrita sem ninguém decidir isso. Foi exatamente assim que
-- `user_profiles` aceitou DELETE e o Recrutamento apagou contas.
REVOKE ALL ON public.portal_lancamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_lancamentos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
