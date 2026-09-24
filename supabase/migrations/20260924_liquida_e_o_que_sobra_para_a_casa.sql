-- ============================================================
-- A "Líquida" passa a ser o que SOBRA PARA A CASA — pedido do chefe, 23/09
--
--   "a Líquida seria o valor da comissão total - o valor do corretor - o
--    valor do gerente (não colocar impostos ali, ainda... depois vamos usar
--    uma tela parecida e integrada com esta no financeiro)"
--
-- Hoje ela é `comissao_bruta - imposto_valor`, calculada no momento em que a
-- proposta é assinada. Passa a ser `comissao_bruta - (corretor + líder)`, e o
-- imposto sai da conta — por pedido dele, e "ainda".
--
-- ============================================================
-- POR QUE ISSO MUDA O MOMENTO EM QUE ELA EXISTE
-- ============================================================
--
-- A fórmula antiga só precisava do percentual de imposto, que nasce com a
-- venda. A nova precisa dos REPASSES, e os repasses são calculados depois, num
-- botão. Entre uma coisa e outra a líquida não é zero nem igual à bruta: ela é
-- DESCONHECIDA.
--
-- Por isso a coluna passa a aceitar nulo. Deixá-la em `comissao_bruta` até
-- alguém calcular a folha afirmaria que a casa fica com 100% da comissão — um
-- número redondo, plausível e errado, que é o defeito que este plano inteiro
-- vem desfazendo. A tela mostra "—" e diz que falta calcular a folha.
--
-- ============================================================
-- QUEM MAIS LÊ ESTA COLUNA
-- ============================================================
--
--   Financeiro › coluna "líquido"  (20260923_financeiro_portal_e_liquido)
--   Marketing  › ROAS               (20260921_campanhas_e_roi)
--
-- Nos dois, "líquido" quer dizer o que sobrou para a casa — então a fórmula
-- nova é mais certa ali do que a antiga, não menos. O que muda é que linha sem
-- folha calculada deixa de entrar na soma, e as duas telas somam ignorando
-- nulo. É menos do que antes, e é honesto: antes elas somavam a comissão
-- inteira como se fosse lucro.
-- ============================================================

BEGIN;

ALTER TABLE public.vendas ALTER COLUMN comissao_liquida DROP NOT NULL;
ALTER TABLE public.vendas ALTER COLUMN comissao_liquida DROP DEFAULT;

COMMENT ON COLUMN public.vendas.comissao_liquida IS
  'O que sobra para a casa: comissao_bruta menos os repasses de corretor e lider. NULO enquanto a folha nao foi calculada — nao e zero nem a bruta. O imposto NAO entra (pedido do chefe em 23/09).';

-- ------------------------------------------------------------
-- A conta, num lugar só
--
-- Função, e não expressão repetida nos gatilhos: ela é chamada de dois lados
-- (quando a folha muda e quando a comissão da venda muda), e duas cópias
-- divergiriam na primeira correção — que é exatamente o que o chefe pediu para
-- acabar.
-- ------------------------------------------------------------
-- A FÓRMULA, e ela existe UMA vez.
--
-- Eu a tinha escrito duas — uma em cada gatilho — e uma sabotagem de 24/09
-- mostrou o preço: alterei a fórmula num dos dois e o teste continuou verde,
-- porque aquele caso passava pelo outro caminho. Duas cópias da mesma conta de
-- dinheiro divergem na primeira correção, e a tela não acusa.
CREATE OR REPLACE FUNCTION public.venda_liquida_calculada(p_venda_id uuid, p_bruta numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- `corretor` e `lider` e mais ninguém: o pedido é "menos o valor do corretor
  -- menos o valor do gerente". Parceiro, indicador e captador saem da parte da
  -- casa quando existirem, e entram nesta conta no dia em que ele pedir.
  --
  -- Sem NENHUM repasse a conta não é zero: é desconhecida, e por isso NULO.
  SELECT CASE WHEN count(*) > 0
              THEN round(COALESCE(p_bruta, 0) - COALESCE(sum(valor), 0), 2) END
    FROM public.venda_repasses
   WHERE venda_id = p_venda_id AND papel IN ('corretor', 'lider');
$function$;

COMMENT ON FUNCTION public.venda_liquida_calculada(uuid, numeric) IS
  'O que sobra para a casa: a bruta menos os repasses de corretor e lider. NULO sem folha calculada. O imposto NAO entra (decisao do chefe, 23/09).';

CREATE OR REPLACE FUNCTION public.venda_recalcula_liquida(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.vendas v
     SET comissao_liquida = public.venda_liquida_calculada(v.id, v.comissao_bruta)
   WHERE v.id = p_venda_id
     AND v.comissao_liquida IS DISTINCT FROM public.venda_liquida_calculada(v.id, v.comissao_bruta);
END;
$function$;

COMMENT ON FUNCTION public.venda_recalcula_liquida(uuid) IS
  'Refaz `vendas.comissao_liquida` = comissao_bruta - (repasses de corretor e lider). Sem folha calculada, grava NULO.';

-- ------------------------------------------------------------
-- Quando a folha muda
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_repasse_refaz_liquida()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.venda_recalcula_liquida(COALESCE(NEW.venda_id, OLD.venda_id));
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_repasses_refazem_liquida ON public.venda_repasses;
CREATE TRIGGER tr_repasses_refazem_liquida
  AFTER INSERT OR UPDATE OR DELETE ON public.venda_repasses
  FOR EACH ROW EXECUTE FUNCTION public.tg_repasse_refaz_liquida();

-- ------------------------------------------------------------
-- Quando a comissão da venda muda
--
-- BEFORE, e não AFTER: mexer na própria linha depois de ela ser gravada
-- dispararia o gatilho de novo. Aqui basta escrever em NEW.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_venda_refaz_liquida()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.comissao_liquida := public.venda_liquida_calculada(NEW.id, NEW.comissao_bruta);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_venda_refaz_liquida ON public.vendas;
CREATE TRIGGER tr_venda_refaz_liquida
  BEFORE INSERT OR UPDATE OF comissao_bruta ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.tg_venda_refaz_liquida();

-- ------------------------------------------------------------
-- E as vendas que já existem
--
-- Sem isto, elas ficariam com a líquida antiga (bruta menos imposto) para
-- sempre: os gatilhos acima só disparam em quem for tocado daqui para a
-- frente, e a tela mostraria duas definições de "líquida" na mesma coluna,
-- sem nada indicando qual é qual.
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.vendas LOOP
    PERFORM public.venda_recalcula_liquida(r.id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.venda_recalcula_liquida(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venda_liquida_calculada(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venda_recalcula_liquida(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.venda_liquida_calculada(uuid, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
