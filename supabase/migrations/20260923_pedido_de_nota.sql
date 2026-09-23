-- ============================================================
-- Pedido de nota fiscal (P4.6) — preparar e avisar, não emitir
--
-- DECIDIDO PELO CHEFE EM 22/09/2026, perguntado com estas palavras: "o que
-- você quer que a Dash faça com a nota?" — **"só preparar e avisar"**.
--
-- Isso muda o item inteiro. Emitir nota exige certificado digital A1,
-- inscrição municipal e um emissor contratado — três contas externas que a
-- casa não tem, e que estavam travando o P4.6 em 40%. PREPARAR não exige
-- nada disso: a Dash monta o pedido, diz o que falta, e avisa quem emite.
--
-- O QUE JÁ EXISTIA, e por isso não foi refeito:
--   * `vendas.nf_numero`, `nf_data`, `nf_arquivo` — onde a nota emitida é
--     registrada. A Conferência de Vendas (P4.4) já grava isso.
--   * `construtora_cnpjs` — o CNPJ do tomador, só dígitos, com CHECK de
--     formato e um principal por construtora.
--   * `cnpj_valido()` — a validação de dígito verificador.
--
-- O QUE FALTAVA era a pergunta: **de quais vendas ainda falta nota, e o que
-- impede cada uma?**
--
-- A TELA É A LISTA DE COMPRAS DO CHEFE
-- Cada pendência aparece pelo nome. "Falta o CNPJ da construtora X" não é
-- erro do sistema: é a informação que alguém precisa ir buscar. Em produção,
-- em 22/09, havia 14 construtoras distintas nos lançamentos e ZERO CNPJs
-- cadastrados — então a tela nasce dizendo exatamente quais 14 faltam, em vez
-- de quatorze linhas em branco que ninguém sabe interpretar.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Quem já foi avisado, e quando
--
-- Sem isto, "avisar" viraria um e-mail repetido toda vez que alguém abrisse a
-- tela. A linha nasce quando alguém clica em avisar, e some quando a nota é
-- registrada na venda.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_de_nota (
  venda_id uuid PRIMARY KEY REFERENCES public.vendas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  avisado_em timestamptz NOT NULL DEFAULT now(),
  avisado_por uuid NOT NULL,
  /** O que foi passado adiante, como foi passado. Fotografia, não referência. */
  conteudo jsonb NOT NULL,

  observacao text
);

CREATE INDEX IF NOT EXISTS pedido_de_nota_tenant_idx
  ON public.pedido_de_nota (tenant_id, avisado_em DESC);

-- ------------------------------------------------------------
-- 2. De quais vendas falta nota, e o que impede cada uma
--
-- `pendencias` é um array de texto, e não um booleano "pronto": a diferença
-- entre "falta o CNPJ" e "falta o valor" é o que decide quem resolve. Um
-- `pronto = false` obrigaria a pessoa a adivinhar o quê.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_a_emitir(p_tenant_id uuid)
RETURNS TABLE (
  venda_id uuid,
  data_venda date,
  empreendimento text,
  tomador text,
  cnpj text,
  valor numeric,
  descricao_servico text,
  recebimento_previsto_em date,
  avisado_em timestamptz,
  pendencias text[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    v.id,
    v.data_venda,
    v.empreendimento,
    COALESCE(c.razao_social, c.nome, v.empreendimento) AS tomador,
    cn.cnpj,
    v.comissao_bruta,
    -- A descrição que vai na nota. Montada aqui, e não na tela, porque o
    -- texto tem de ser o mesmo no que se copia, no que se avisa e no que
    -- fica gravado no pedido.
    'Comissão de intermediação imobiliária — ' || COALESCE(v.empreendimento, 'venda')
      || COALESCE(' — venda de ' || to_char(v.data_venda, 'DD/MM/YYYY'), '') AS descricao_servico,
    v.recebimento_previsto_em,
    p.avisado_em,
    (
      -- Sem CNPJ não se emite nota para ninguém. É a pendência nº 1 da casa:
      -- 14 construtoras, zero CNPJs, medido em 22/09.
      CASE WHEN cn.cnpj IS NULL
        THEN ARRAY['falta o CNPJ de ' || COALESCE(c.nome, v.empreendimento, 'construtora sem nome')]
        ELSE ARRAY[]::text[] END
      ||
      -- Construtora não cadastrada: a venda guarda o nome do empreendimento,
      -- e ninguém ligou a um cadastro com razão social.
      CASE WHEN v.construtora_id IS NULL
        THEN ARRAY['a venda não está ligada a uma construtora cadastrada']
        ELSE ARRAY[]::text[] END
      ||
      CASE WHEN COALESCE(v.comissao_bruta, 0) <= 0
        THEN ARRAY['a comissão está zerada'] ELSE ARRAY[]::text[] END
    ) AS pendencias
  FROM public.vendas v
  LEFT JOIN public.construtoras c ON c.id = v.construtora_id
  -- Só o CNPJ PRINCIPAL: uma construtora pode ter vários, e a nota vai para
  -- um. Escolher "qualquer um" faria a nota sair no CNPJ errado de vez em
  -- quando, que é o tipo de erro que só aparece na contabilidade.
  LEFT JOIN public.construtora_cnpjs cn
    ON cn.construtora_id = v.construtora_id AND cn.principal
  LEFT JOIN public.pedido_de_nota p ON p.venda_id = v.id
 WHERE v.tenant_id = p_tenant_id
   -- O PORTEIRO. Esta função é SECURITY DEFINER e tem EXECUTE para
   -- `authenticated`: sem esta linha, o único filtro seria o `p_tenant_id` que
   -- o PRÓPRIO chamador manda. Qualquer pessoa logada — de qualquer
   -- imobiliária — passava o uuid de outra casa e recebia empreendimento,
   -- tomador, CNPJ e comissão bruta das vendas dela.
   --
   -- Faltou na primeira versão desta migração, e passou porque o teste só
   -- exercitava o caminho do admin. Aqui vai como predicado, e não como
   -- `IF ... RETURN`, porque a função é LANGUAGE sql. É o mesmo porteiro das
   -- outras 19 funções do Financeiro — a consistência é o que torna a falta
   -- visível na próxima revisão.
   AND public.financeiro_pode_ver(p_tenant_id)
   -- Nota emitida sai da lista. `nf_numero` é preenchido na Conferência de
   -- Vendas, que é onde quem confere o dinheiro já trabalha.
   --
   -- E o filtro é SÓ esse. Escrevi `status <> 'cancelada'` na primeira versão
   -- e o teste acusou: esse status não existe — os de verdade são
   -- `a_faturar`, `faturado`, `recebido` e `divergente`. Filtrar por status
   -- além do número da nota criaria duas respostas para "já tem nota?", e uma
   -- venda `recebido` SEM nota é justamente o que alguém precisa ver: entrou
   -- dinheiro e não há nota.
   AND COALESCE(btrim(v.nf_numero), '') = ''
 ORDER BY v.data_venda DESC NULLS LAST;
$function$;

-- ------------------------------------------------------------
-- 3. Marcar como avisado
--
-- Não manda e-mail: grava que foi avisado, com o conteúdo do que foi passado.
-- Quem avisa é a pessoa, pelo meio que ela já usa — e a Dash para de perguntar.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedido_de_nota_avisar(
  p_venda_id uuid,
  p_conteudo jsonb,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid := auth.uid(); v_tenant uuid;
BEGIN
  IF v_eu IS NULL THEN RETURN NULL; END IF;

  SELECT tenant_id INTO v_tenant FROM vendas WHERE id = p_venda_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Quem cuida do dinheiro. Um corretor não avisa a contabilidade sobre a
  -- nota da casa — e o P4.5 já restringiu o Financeiro a esse mesmo grupo.
  IF NOT public.is_tenant_admin_or_owner(v_tenant) AND NOT public.is_platform_owner() THEN
    RETURN NULL;
  END IF;

  INSERT INTO pedido_de_nota (venda_id, tenant_id, avisado_por, conteudo, observacao)
  VALUES (p_venda_id, v_tenant, v_eu, COALESCE(p_conteudo, '{}'::jsonb), p_observacao)
  ON CONFLICT (venda_id) DO UPDATE
    SET avisado_em = now(), avisado_por = v_eu,
        conteudo = EXCLUDED.conteudo, observacao = EXCLUDED.observacao;

  RETURN jsonb_build_object('avisado', true, 'em', now());
END;
$function$;

-- ------------------------------------------------------------
-- 4. Quem enxerga o quê
-- ------------------------------------------------------------
REVOKE ALL ON public.pedido_de_nota FROM anon, authenticated;
GRANT SELECT ON public.pedido_de_nota TO authenticated;
GRANT ALL ON public.pedido_de_nota TO service_role;

ALTER TABLE public.pedido_de_nota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_de_nota_admin_le ON public.pedido_de_nota;
CREATE POLICY pedido_de_nota_admin_le ON public.pedido_de_nota
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.notas_a_emitir(uuid)',
    'public.pedido_de_nota_avisar(uuid, jsonb, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

COMMENT ON TABLE public.pedido_de_nota IS
  'Registro de que alguém foi avisado para emitir a nota de uma venda. A Dash NÃO emite nota — decidido em 22/09: preparar e avisar.';

NOTIFY pgrst, 'reload schema';

COMMIT;
