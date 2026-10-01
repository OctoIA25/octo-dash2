-- ============================================================
-- A comissão passa a ler o nível de onde a Gestão de Equipe grava — e a venda
-- que nasceu sem nível ou sem percentual se completa sozinha do cadastro.
--
-- O DEFEITO (medido em produção, 30/09): duas fontes para o mesmo dado.
--   - A Gestão de Equipe grava o nível em `tenant_memberships.permissions
--     ->>'nivel_comissao'` (12 pessoas, 9 na Lotus). Calculadora de
--     comissionamento, planilha, relatório e contratos leem dali.
--   - A Conferência de vendas lia a coluna `tenant_memberships.nivel`, criada
--     em 20260921 e que NINGUÉM grava: vazia em todas as casas.
-- Resultado: o Humberto tem "Pleno — 45%" no cadastro e as vendas dele nascem
-- "(sem nível)". As 29 vendas da Lotus estão assim — e com percentual zero,
-- porque a Santa Ângela não tem % cadastrado.
--
-- AS DUAS REGRAS QUE ESTA MIGRATION MANTÉM:
--   1. O que foi calculado não muda. Promover alguém não mexe numa venda que já
--      tinha nível; mudar o % de uma construtora não mexe numa venda que já
--      tinha percentual.
--   2. Vazio não é valor. Nível NULL e percentual 0 querem dizer "não sabido
--      quando a venda nasceu", não "o corretor não tinha nível". Completar isso
--      do cadastro não reescreve nada — e fica no histórico da venda.
--
-- As 29 da Lotus: todas de proposta assinada, nenhuma recebida, nenhum repasse.
-- ============================================================

-- 1. Uma fonte só para o nível ---------------------------------------------
-- Só devolve nível que o motor conhece: um texto qualquer no jsonb faria o
-- INSERT da venda estourar no CHECK de `vendas.nivel_corretor`. Estrito como o
-- `nivelValido` da tela (sem lower/trim): os dois lados nunca discordam.
CREATE OR REPLACE FUNCTION public.nivel_do_membro(p_tenant_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN x.n IN ('estagiario', 'junior', 'pleno', 'senior', 'coordenador') THEN x.n END
    FROM (SELECT tm.permissions->>'nivel_comissao' AS n
            FROM tenant_memberships tm
           WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id) x;
$$;
REVOKE ALL ON FUNCTION public.nivel_do_membro(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.tenant_memberships.nivel IS
  'OBSOLETA desde 20261006: ninguém grava aqui. O nível mora em permissions->>''nivel_comissao'' '
  '(Gestão de Equipe) e se lê por public.nivel_do_membro(). Renomear depois do deploy, e só então apagar.';

-- 2. A venda nasce com o nível do cadastro ---------------------------------
-- Igual à versão no ar (md5 850a18bf… em 30/09), trocando só a leitura do nível.
CREATE OR REPLACE FUNCTION public.proposta_assinada_cria_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_construtora_id uuid;
  v_pct numeric;
  v_imposto_pct numeric;
  v_bruta numeric;
  v_imposto numeric;
  v_lanc_id uuid;
  v_nivel text;
  v_nome text;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM 'proposta-assinada' THEN RETURN NEW; END IF;
  -- SEM guarda de "não mudou": ela existia para poupar trabalho, mas quebrava a
  -- carga inicial — `vendas_importar_assinadas` redispara o gatilho com um
  -- UPDATE que repõe o mesmo estágio, e a guarda o descartava em silêncio. A
  -- importação contava as vendas e não criava nenhuma. Quem protege contra
  -- duplicata é a checagem de `proposta_id` logo abaixo, que é a garantia de
  -- verdade; esta aqui só escondia o caminho da carga.

  -- Proposta sem valor não vira venda: sem VGV não há comissão a calcular, e
  -- uma venda de R$ 0 na lista atrapalha a conferência. São 9 das 70 em
  -- produção, e a tela as lista à parte com o motivo.
  IF COALESCE(NEW.value, 0) <= 0 THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM vendas v WHERE v.proposta_id = NEW.id) THEN RETURN NEW; END IF;

  -- O empreendimento da proposta casa com o lançamento sem acento e sem caixa.
  SELECT l.id, l.construtora, l.construtora_id INTO v_lanc_id, v_nome, v_construtora_id
    FROM lancamentos l
   WHERE l.tenant_id = NEW.tenant_id
     AND upper(public.sem_acento(btrim(l.nome)))
       = upper(public.sem_acento(btrim(COALESCE(NEW.forecast_empreendimento, ''))))
   LIMIT 1;

  -- O VÍNCULO POR ID VEM PRIMEIRO. `lancamentos.construtora` é texto digitado,
  -- e casar por ele é frágil: o banco local tinha "Santa Ângela Incorporadora"
  -- no cadastro contra "Santa Ângela" no lançamento, e a venda nasceu com
  -- percentual zero sem ninguém entender por quê. O `construtora_id` é o que o
  -- cadastro de construtoras preencheu; o nome fica só de reserva, para o
  -- lançamento antigo que ainda não foi ligado.
  IF v_construtora_id IS NOT NULL THEN
    SELECT c.comissao_padrao_pct INTO v_pct
      FROM construtoras c WHERE c.id = v_construtora_id AND c.tenant_id = NEW.tenant_id;
  ELSE
    SELECT c.id, c.comissao_padrao_pct INTO v_construtora_id, v_pct
      FROM construtoras c
     WHERE c.tenant_id = NEW.tenant_id
       AND upper(public.sem_acento(btrim(c.nome))) = upper(public.sem_acento(btrim(COALESCE(v_nome, ''))))
     LIMIT 1;
  END IF;

  -- Sem construtora casada, o percentual nasce ZERO e a venda fica visível
  -- assim: um percentual chutado produziria uma comissão errada com cara de
  -- certa, e é ela que vira dinheiro de gente lá na frente.
  v_pct := COALESCE(v_pct, 0);

  SELECT f.imposto_pct INTO v_imposto_pct
    FROM tenant_fiscal_config f WHERE f.tenant_id = NEW.tenant_id;
  v_imposto_pct := COALESCE(v_imposto_pct, 0);

  v_bruta := round(COALESCE(NEW.value, 0) * v_pct / 100.0, 2);
  v_imposto := round(v_bruta * v_imposto_pct / 100.0, 2);

  -- O NÍVEL DO MOMENTO, congelado na venda. Promover alguém depois não mexe
  -- nesta linha — é o critério de pronto do plano. Lido de onde a Gestão de
  -- Equipe grava (20261006); antes lia uma coluna que ninguém preenchia.
  v_nivel := public.nivel_do_membro(NEW.tenant_id, NEW.agent_user_id);

  INSERT INTO vendas (
    tenant_id, proposta_id, lead_id, data_venda, empreendimento, lancamento_id,
    construtora_id, tipo, corretor_id, corretor_nome, nivel_corretor,
    vgv, comissao_pct, comissao_bruta, imposto_pct, imposto_valor, comissao_liquida,
    comissao_da_proposta, status
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.lead_id,
    COALESCE(NEW.signed_at, now())::date,
    COALESCE(NEW.forecast_empreendimento, ''), v_lanc_id,
    v_construtora_id,
    CASE WHEN v_lanc_id IS NOT NULL THEN 'lancamento' ELSE 'terceiros' END,
    NEW.agent_user_id, COALESCE(NEW.agent_name, ''), v_nivel,
    NEW.value, v_pct, v_bruta, v_imposto_pct, v_imposto, v_bruta - v_imposto,
    NULLIF(NEW.commission_total, 0), 'a_faturar'
  );

  RETURN NEW;
END;
$function$;

-- 3. A trava do percentual aceita COMPLETAR, nunca mudar -------------------
-- A venda que nasceu com 0 pode receber o percentual do cadastro da sua
-- construtora — e só ele: qualquer outro número segue exigindo owner e
-- justificativa. Quem pode mudar o % da construtora já decide esse número.
CREATE OR REPLACE FUNCTION public.venda_protege_comissao_pct()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_justificativa text;
BEGIN
  NEW.atualizada_em := now();

  IF NEW.comissao_pct IS NOT DISTINCT FROM OLD.comissao_pct THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.comissao_pct, 0) = 0 AND NEW.comissao_pct > 0
     AND NEW.comissao_pct IS NOT DISTINCT FROM (
       SELECT c.comissao_padrao_pct FROM construtoras c
        WHERE c.id = NEW.construtora_id AND c.tenant_id = NEW.tenant_id) THEN
    INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
    VALUES (NEW.id, NEW.tenant_id, 'comissao_pct', OLD.comissao_pct::text, NEW.comissao_pct::text,
            'a venda nasceu sem percentual; completado do cadastro da construtora', auth.uid());
    RETURN NEW;
  END IF;

  v_justificativa := btrim(COALESCE(current_setting('app.justificativa_comissao', true), ''));

  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'o percentual de comissão é travado: só o owner da plataforma pode mudá-lo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_justificativa = '' THEN
    RAISE EXCEPTION 'mudar o percentual de comissão exige justificativa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
  VALUES (NEW.id, NEW.tenant_id, 'comissao_pct',
          OLD.comissao_pct::text, NEW.comissao_pct::text, v_justificativa, auth.uid());

  RETURN NEW;
END;
$function$;

-- 4. Completar do cadastro --------------------------------------------------
-- Só preenche o que está vazio: nível NULL e percentual 0. Venda já recebida
-- fica como está — o dinheiro entrou, e a conferência dela é outra conversa.
-- A bruta é a mesma conta do nascimento (VGV × %); a líquida e o "a receber"
-- do Financeiro vêm dos gatilhos que já existem na tabela.
CREATE OR REPLACE FUNCTION public.vendas_completar_do_cadastro(
  p_tenant_id uuid, p_construtora_id uuid DEFAULT NULL, p_corretor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_niveis int;
  v_pcts int;
BEGIN
  WITH alvo AS (
    SELECT v.id, v.tenant_id, public.nivel_do_membro(v.tenant_id, v.corretor_id) AS nivel
      FROM vendas v
     WHERE v.tenant_id = p_tenant_id
       AND v.nivel_corretor IS NULL AND v.corretor_id IS NOT NULL
       AND (p_corretor_id IS NULL OR v.corretor_id = p_corretor_id)
       AND (p_construtora_id IS NULL OR v.construtora_id = p_construtora_id)
  ), feitas AS (
    UPDATE vendas v SET nivel_corretor = a.nivel
      FROM alvo a
     WHERE v.id = a.id AND a.nivel IS NOT NULL
    RETURNING v.id, v.tenant_id, a.nivel
  ), registro AS (
    INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
    SELECT f.id, f.tenant_id, 'nivel_corretor', NULL, f.nivel,
           'a venda nasceu sem nível; completado do cadastro do corretor', auth.uid()
      FROM feitas f
    RETURNING 1
  )
  SELECT count(*) INTO v_niveis FROM registro;

  UPDATE vendas v
     SET comissao_pct = c.comissao_padrao_pct,
         comissao_bruta = round(v.vgv * c.comissao_padrao_pct / 100.0, 2),
         imposto_valor = round(round(v.vgv * c.comissao_padrao_pct / 100.0, 2) * v.imposto_pct / 100.0, 2)
    FROM construtoras c
   WHERE c.id = v.construtora_id AND c.tenant_id = v.tenant_id
     AND v.tenant_id = p_tenant_id
     AND COALESCE(v.comissao_pct, 0) = 0
     AND COALESCE(c.comissao_padrao_pct, 0) > 0
     AND v.recebido_em IS NULL
     AND (p_corretor_id IS NULL OR v.corretor_id = p_corretor_id)
     AND (p_construtora_id IS NULL OR v.construtora_id = p_construtora_id);
  GET DIAGNOSTICS v_pcts = ROW_COUNT;

  RETURN jsonb_build_object('niveis', v_niveis, 'percentuais', v_pcts);
END $$;
REVOKE ALL ON FUNCTION public.vendas_completar_do_cadastro(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5. Quem dispara: preencher o cadastro ------------------------------------
-- O Erick cadastra o % da Santa Ângela, ou alguém dá nível a um corretor, e as
-- vendas que esperavam por isso se completam na hora — sem botão e sem dev.
CREATE OR REPLACE FUNCTION public.tg_construtora_completa_vendas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(NEW.comissao_padrao_pct, 0) > 0
     AND NEW.comissao_padrao_pct IS DISTINCT FROM OLD.comissao_padrao_pct THEN
    PERFORM public.vendas_completar_do_cadastro(NEW.tenant_id, p_construtora_id => NEW.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_construtora_completa_vendas ON public.construtoras;
CREATE TRIGGER tr_construtora_completa_vendas
  AFTER UPDATE OF comissao_padrao_pct ON public.construtoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_construtora_completa_vendas();

CREATE OR REPLACE FUNCTION public.tg_membro_completa_vendas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.permissions->>'nivel_comissao') IS DISTINCT FROM (OLD.permissions->>'nivel_comissao') THEN
    PERFORM public.vendas_completar_do_cadastro(NEW.tenant_id, p_corretor_id => NEW.user_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_membro_completa_vendas ON public.tenant_memberships;
CREATE TRIGGER tr_membro_completa_vendas
  AFTER UPDATE OF permissions ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_membro_completa_vendas();

REVOKE ALL ON FUNCTION public.tg_construtora_completa_vendas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_membro_completa_vendas() FROM PUBLIC, anon, authenticated;

-- 6. As vendas que já existem ----------------------------------------------
-- Na Lotus: as 29 ganham o nível de quem tem nível no cadastro. O percentual
-- continua 0 até a Santa Ângela ter o dela — e aí o gatilho da seção 5 faz o resto.
SELECT public.vendas_completar_do_cadastro(t.id)
  FROM public.tenants t
 WHERE EXISTS (SELECT 1 FROM public.vendas v WHERE v.tenant_id = t.id);
