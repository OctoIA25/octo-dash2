-- ============================================================
-- A comissão da venda é a que foi negociada na proposta.
--
-- Regra do Erick (01/10): "cada negociação é uma negociação diferente". A
-- comissão é o valor que entrou na proposta, e o percentual sai dela
-- (comissão ÷ VGV). O % da construtora fica de reserva, para a proposta que
-- veio sem comissão.
--
-- ANTES: a venda nascia com VGV × % da construtora. Nenhuma das 21
-- construtoras da Lotus tem %, então as 29 vendas estavam em R$ 0,00 — embora
-- todas tragam a comissão da proposta (`comissao_da_proposta`), que bate no
-- centavo com a planilha em 5 de 8 meses. E a view `vendas_assinadas` (metas,
-- Home) já lia a comissão da proposta: eram duas regras para o mesmo número,
-- que é o "VGC não bate entre as telas" (ajuste 10).
--
-- O RECEBIMENTO vem junto: a planilha registra quando cada comissão entrou.
-- Ligar a comissão sem isso faria o Financeiro mostrar como "a receber" o que
-- já foi recebido. A venda casa com UMA linha da planilha — mesmo VGV, mesma
-- data, mesma comissão —, e a linha com UMA venda; sem par único, não mexe.
--
-- FORA DESTE ARQUIVO, de propósito: o repasse das vendas antigas (corretor e
-- líder) e o nível da época. Gravar repasse cria "a pagar" no Financeiro, e
-- não se sabe se cada um já foi pago.
-- ============================================================

-- ------------------------------------------------------------
-- A conta, num lugar só
-- ------------------------------------------------------------
-- Nulo quando a comissão da proposta não serve: vazia, zero, ou maior que o
-- próprio VGV (erro de digitação — e o CHECK de 0–100% derrubaria a assinatura
-- da proposta inteira).
CREATE OR REPLACE FUNCTION public.pct_da_comissao(p_comissao numeric, p_vgv numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_comissao > 0 AND p_vgv > 0 AND p_comissao <= p_vgv
              THEN round(p_comissao / p_vgv * 100, 4) END
$$;
REVOKE ALL ON FUNCTION public.pct_da_comissao(numeric, numeric) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- A venda nova: a comissão da proposta primeiro, a da construtora de reserva
-- ------------------------------------------------------------
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
  -- e casar por ele é frágil. O nome fica só de reserva, para o lançamento
  -- antigo que ainda não foi ligado.
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

  -- A COMISSÃO NEGOCIADA MANDA (20261014). O % da construtora só vale quando a
  -- proposta veio sem comissão. Sem nenhum dos dois, nasce ZERO e visível
  -- assim: um percentual chutado produziria uma comissão errada com cara de
  -- certa, e é ela que vira dinheiro de gente lá na frente.
  IF public.pct_da_comissao(NEW.commission_total, NEW.value) IS NOT NULL THEN
    v_pct := public.pct_da_comissao(NEW.commission_total, NEW.value);
    v_bruta := round(NEW.commission_total, 2);
  ELSE
    v_pct := COALESCE(v_pct, 0);
    v_bruta := round(NEW.value * v_pct / 100.0, 2);
  END IF;

  SELECT f.imposto_pct INTO v_imposto_pct
    FROM tenant_fiscal_config f WHERE f.tenant_id = NEW.tenant_id;
  v_imposto_pct := COALESCE(v_imposto_pct, 0);
  v_imposto := round(v_bruta * v_imposto_pct / 100.0, 2);

  -- O NÍVEL DO MOMENTO, congelado na venda. Promover alguém depois não mexe
  -- nesta linha — é o critério de pronto do plano. Lido de onde a Gestão de
  -- Equipe grava (20261006).
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

-- ------------------------------------------------------------
-- A trava do percentual: completar o que nasceu zero, com a comissão da
-- proposta ou com o % da construtora — e só isso. O resto continua exigindo o
-- dono da plataforma e uma justificativa.
-- ------------------------------------------------------------
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
     AND NEW.comissao_pct IS NOT DISTINCT FROM public.pct_da_comissao(NEW.comissao_da_proposta, NEW.vgv) THEN
    INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
    VALUES (NEW.id, NEW.tenant_id, 'comissao_pct', OLD.comissao_pct::text, NEW.comissao_pct::text,
            'a venda nasceu sem percentual; completado com a comissão negociada na proposta', auth.uid());
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

-- ------------------------------------------------------------
-- As vendas que já existem: completar com a comissão da proposta
-- ------------------------------------------------------------
-- Só o que está zerado (percentual E comissão). Venda com percentual — posto
-- pelo dono com justificativa, ou vindo da construtora — não é tocada.
CREATE OR REPLACE FUNCTION public.vendas_completar_da_proposta(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  UPDATE vendas v
     SET comissao_pct   = public.pct_da_comissao(v.comissao_da_proposta, v.vgv),
         comissao_bruta = round(v.comissao_da_proposta, 2),
         imposto_valor  = round(round(v.comissao_da_proposta, 2) * v.imposto_pct / 100.0, 2)
   WHERE v.tenant_id = p_tenant_id
     AND COALESCE(v.comissao_pct, 0) = 0
     AND COALESCE(v.comissao_bruta, 0) = 0
     AND public.pct_da_comissao(v.comissao_da_proposta, v.vgv) IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.vendas_completar_da_proposta(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- O recebimento que a planilha já registrou
-- ------------------------------------------------------------
-- Par único dos dois lados: a venda casa com uma linha só, e a linha com uma
-- venda só. Venda que já tem recebimento não é sobrescrita. O resto do caminho
-- é o que já existe: a venda vira "recebido" e o lançamento do Financeiro
-- nasce baixado.
CREATE OR REPLACE FUNCTION public.vendas_recebido_da_planilha(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH par AS (
    SELECT v.id AS venda_id, pl.id AS linha_id, pl.data_recebimento
      FROM vendas v
      JOIN commercial_sales pl
        ON pl.tenant_id = v.tenant_id AND pl.is_active
       AND round(pl.valor_vgv, 2) = round(v.vgv, 2)
       AND pl.data_assinatura = v.data_venda
       AND round(pl.comissao_total_venda, 2) = round(v.comissao_bruta, 2)
     WHERE v.tenant_id = p_tenant_id AND v.comissao_bruta > 0
  ), unico AS (
    SELECT p.* FROM par p
     WHERE (SELECT count(*) FROM par x WHERE x.venda_id = p.venda_id) = 1
       AND (SELECT count(*) FROM par x WHERE x.linha_id = p.linha_id) = 1
       AND p.data_recebimento IS NOT NULL
  ), feito AS (
    UPDATE vendas v
       SET recebido_em = u.data_recebimento,
           valor_recebido = v.comissao_bruta
      FROM unico u
     WHERE v.id = u.venda_id AND v.recebido_em IS NULL AND v.valor_recebido IS NULL
    RETURNING v.id, v.tenant_id, v.recebido_em
  )
  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
  SELECT f.id, f.tenant_id, 'recebido_em', NULL, f.recebido_em::text,
         'recebimento lido da planilha de vendas (mesmo VGV, data e comissão)', auth.uid()
    FROM feito f;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.vendas_recebido_da_planilha(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- As vendas de hoje: primeiro a comissão, depois o recebimento (que casa
-- pela comissão já completada).
-- ------------------------------------------------------------
SELECT public.vendas_completar_da_proposta(t.id)
  FROM public.tenants t WHERE EXISTS (SELECT 1 FROM public.vendas v WHERE v.tenant_id = t.id);
SELECT public.vendas_recebido_da_planilha(t.id)
  FROM public.tenants t WHERE EXISTS (SELECT 1 FROM public.vendas v WHERE v.tenant_id = t.id);
