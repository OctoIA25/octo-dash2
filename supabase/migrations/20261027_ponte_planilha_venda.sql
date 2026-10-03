-- ============================================================
-- Ponte planilha → venda (projeção 90d, 03/10/2026)
--
-- Decidido em 03/10: as duas abas da Conferência continuam (Planilha e CRM).
-- Mas o Financeiro só pode ter UMA fonte, ou a mesma comissão entra duas
-- vezes no "a receber". A fonte é `vendas`; a planilha alimenta `vendas`.
--
-- Cada linha da planilha com comissão vira (ou se liga a) uma venda:
--   1. já ligada e ainda casa ............ mantém e preenche o recebimento vazio
--   2. ligada e não casa mais ............ desliga (a linha deslocou)
--   3. uma venda livre casa .............. liga
--   4. nenhuma venda casa ................ cria
--   5. o resto ........................... "sem par", e alguém resolve
-- Casar = mesma data (ou o dia seguinte: a proposta assinada às 22h já é
-- amanhã em UTC) e mesmo VGV, ±R$ 1.
--
-- A linha é identificada pelo NÚMERO DA LINHA na planilha. Se alguém inserir
-- uma linha no meio, o conteúdo desliza (já aconteceu com as colunas). Por isso
-- a regra 2 confere o conteúdo a cada atualização, em vez de confiar no id.
-- ============================================================

BEGIN;

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS planilha_id uuid REFERENCES public.commercial_sales(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendas_planilha_id_uniq
  ON public.vendas (planilha_id) WHERE planilha_id IS NOT NULL;
COMMENT ON COLUMN public.vendas.planilha_id IS
  'A linha da planilha comercial que é esta venda. NULL = a venda não está na planilha (ou a linha deslocou).';

-- ------------------------------------------------------------
-- 1. Qual lançamento é este nome — a regra da aba Planilha, num lugar só
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancamento_da_planilha(p_tenant_id uuid, p_empreendimento text)
RETURNS TABLE (tipo_negocio text, lancamento_id uuid, construtora_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- O de-para de nomes manda; sem ele, o nome igual ao do cadastro. LIMIT 1
  -- nos dois: "Castanheira" e "CASTANHEIRA" podem coexistir no de-para.
  SELECT COALESCE(al.tipo, CASE WHEN lanc.id IS NOT NULL THEN 'lancamento' END),
         lanc.id, lanc.construtora_id
    FROM (SELECT 1) um
    LEFT JOIN LATERAL (
      SELECT a.tipo, a.lancamento_id
        FROM vendas_empreendimento_alias a
       WHERE a.tenant_id = p_tenant_id
         AND public.normalizar_texto(a.nome_bruto) = public.normalizar_texto(p_empreendimento)
       ORDER BY a.lancamento_id IS NULL, a.nome_bruto
       LIMIT 1
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT l.id, l.construtora_id
        FROM lancamentos l
       WHERE l.tenant_id = p_tenant_id
         AND (l.id = al.lancamento_id
              OR (al.lancamento_id IS NULL
                  AND public.normalizar_texto(l.nome) = public.normalizar_texto(p_empreendimento)))
       LIMIT 1
    ) lanc ON true;
$function$;

-- ------------------------------------------------------------
-- 1b. Pago / parcelado / pendente como a PLANILHA diz — a regra de 29/09,
--     que morava dentro de vendas_planilha_conferencia, agora num lugar só:
--     a ponte também precisa dela. Numa venda a prazo, a data de recebimento
--     da linha principal é a da 1ª parcela, não a da comissão inteira.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.situacao_na_planilha(p_linha_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN b.observacoes ~* '(parcelad|\m[0-9]+ de [0-9]+\M)' THEN 'parcelado'
    WHEN COALESCE(b.total_unidade,0) = 0 AND COALESCE(b.valor_vgv,0) = 0
         AND COALESCE(b.comissao_total_venda,0) = 0
         AND COALESCE(b.repasse_20,0) + COALESCE(b.repasse_40,0)
             + COALESCE(b.repasse_45,0) + COALESCE(b.repasse_50,0) > 0 THEN 'parcelado'
    WHEN public.normalizar_texto(b.cliente_nome) <> '' AND EXISTS (
      SELECT 1 FROM public.commercial_sales p
       WHERE p.tenant_id = b.tenant_id
         AND p.is_active
         AND p.id <> b.id
         AND p.data_assinatura IS NOT DISTINCT FROM b.data_assinatura
         AND public.normalizar_texto(p.cliente_nome) = public.normalizar_texto(b.cliente_nome)
         AND COALESCE(p.total_unidade,0) = 0 AND COALESCE(p.valor_vgv,0) = 0
         AND COALESCE(p.comissao_total_venda,0) = 0
         AND COALESCE(p.repasse_20,0) + COALESCE(p.repasse_40,0)
             + COALESCE(p.repasse_45,0) + COALESCE(p.repasse_50,0) > 0) THEN 'parcelado'
    WHEN b.data_recebimento IS NOT NULL THEN 'pago'
    ELSE 'pendente'
  END
  FROM public.commercial_sales b
 WHERE b.id = p_linha_id;
$function$;

-- ------------------------------------------------------------
-- 2. Uma linha da planilha → a venda dela
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_da_planilha(p_linha_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.commercial_sales%ROWTYPE;
  v_ligada public.vendas%ROWTYPE;
  v_livres integer;
  v_todas integer;
  v_gemeas integer;
  v_id uuid;
  v_lp record;
  v_imposto_pct numeric;
  v_corretor uuid;
  v_recebido date;
  v_antes date;
BEGIN
  SELECT * INTO l FROM commercial_sales WHERE id = p_linha_id;
  IF NOT FOUND THEN RETURN 'ignorada'; END IF;

  -- Linha inativa, sem data ou sem comissão (as parcelas soltas da planilha)
  -- não é venda. Se estava ligada, desliga: a venda fica, o vínculo não.
  IF NOT l.is_active OR l.data_assinatura IS NULL OR COALESCE(l.comissao_total_venda, 0) <= 0 THEN
    WITH solta AS (
      UPDATE vendas SET planilha_id = NULL WHERE planilha_id = p_linha_id RETURNING id, tenant_id
    )
    INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
    SELECT id, tenant_id, 'planilha_id', p_linha_id::text, NULL,
           'a linha da planilha deixou de ser venda (inativa, sem data ou sem comissão)', auth.uid()
      FROM solta;
    RETURN 'ignorada';
  END IF;

  -- A prazo, a data da linha principal é a da 1ª parcela. A venda só conta
  -- como recebida quando a linha principal E todas as parcelas abaixo dela
  -- (mesmo cliente e data, comissão zero, repasse preenchido) têm data — e
  -- então na data da última. Faltando uma, fica a receber até alguém parcelar
  -- na Dash. Era o caso de 30/01 da Lotus: R$ 66.250 em 6 parcelas, quitado.
  -- ponytail: na RELEITURA da planilha a linha principal chega antes das
  -- parcelas, e uma venda a prazo nova nasce recebida pela 1ª data; a carga
  -- (todas as linhas já lá) acerta. Conferir as vendas a prazo depois de reler.
  IF public.situacao_na_planilha(p_linha_id) = 'parcelado' THEN
    WITH parcelas AS (
      SELECT p.data_recebimento
        FROM commercial_sales p
       WHERE p.tenant_id = l.tenant_id AND p.is_active AND p.id <> l.id
         AND p.data_assinatura IS NOT DISTINCT FROM l.data_assinatura
         AND public.normalizar_texto(p.cliente_nome) = public.normalizar_texto(l.cliente_nome)
         AND COALESCE(p.total_unidade,0) = 0 AND COALESCE(p.valor_vgv,0) = 0
         AND COALESCE(p.comissao_total_venda,0) = 0
         AND COALESCE(p.repasse_20,0) + COALESCE(p.repasse_40,0)
             + COALESCE(p.repasse_45,0) + COALESCE(p.repasse_50,0) > 0
    )
    SELECT CASE WHEN l.data_recebimento IS NOT NULL AND count(*) > 0
                 AND count(*) FILTER (WHERE data_recebimento IS NULL) = 0
                THEN GREATEST(l.data_recebimento, max(data_recebimento)) END
      INTO v_recebido FROM parcelas;
  ELSE
    v_recebido := l.data_recebimento;
  END IF;

  SELECT * INTO v_ligada FROM vendas WHERE planilha_id = p_linha_id;
  IF FOUND THEN
    IF v_ligada.data_venda IN (l.data_assinatura, l.data_assinatura + 1)
       AND abs(v_ligada.vgv - COALESCE(l.valor_vgv, 0)) < 1 THEN
      v_id := v_ligada.id;
    ELSE
      -- A linha mudou de VGV ou data: alguém corrigiu a planilha, ou uma linha
      -- foi inserida no meio e o conteúdo deslizou. De dentro do gatilho não
      -- dá para saber qual dos dois. Desliga; o conteúdo novo ainda pode casar
      -- com uma venda livre (o deslizamento se conserta), mas esta linha NUNCA
      -- cria venda (guarda do histórico, abaixo): a venda dela continua
      -- existindo, e outra contaria a mesma comissão duas vezes.
      UPDATE vendas SET planilha_id = NULL WHERE id = v_ligada.id;
      INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
      VALUES (v_ligada.id, v_ligada.tenant_id, 'planilha_id', p_linha_id::text, NULL,
              'a linha da planilha mudou de VGV ou data: desligada', auth.uid());
    END IF;
  END IF;

  IF v_id IS NULL THEN
    -- Casar = data (ou o dia seguinte) e VGV; LIGAR exige também a comissão,
    -- como em 20261014: "mesmo VGV e data com outra comissão não é a mesma venda".
    SELECT count(*),
           count(*) FILTER (WHERE planilha_id IS NULL AND abs(comissao_bruta - l.comissao_total_venda) < 1),
           (min(id::text) FILTER (WHERE planilha_id IS NULL AND abs(comissao_bruta - l.comissao_total_venda) < 1))::uuid
      INTO v_todas, v_livres, v_id
      FROM vendas
     WHERE tenant_id = l.tenant_id
       AND data_venda IN (l.data_assinatura, l.data_assinatura + 1)
       AND abs(vgv - COALESCE(l.valor_vgv, 0)) < 1;

    -- Par único dos DOIS lados: outra linha ativa igual a esta, ainda sem
    -- venda, torna qualquer escolha um chute.
    SELECT count(*) INTO v_gemeas
      FROM commercial_sales o
     WHERE o.tenant_id = l.tenant_id AND o.is_active AND o.id <> l.id
       AND o.data_assinatura = l.data_assinatura
       AND abs(COALESCE(o.valor_vgv, 0) - COALESCE(l.valor_vgv, 0)) < 1
       AND abs(COALESCE(o.comissao_total_venda, 0) - l.comissao_total_venda) < 1
       AND NOT EXISTS (SELECT 1 FROM vendas x WHERE x.planilha_id = o.id);

    IF v_gemeas = 0 AND v_livres = 1 THEN
      UPDATE vendas SET planilha_id = p_linha_id WHERE id = v_id;
    ELSIF v_gemeas = 0 AND v_todas = 0
      -- Linha que já teve venda e foi desligada não cria outra: a venda dela
      -- continua existindo, só não casa mais com o conteúdo.
      AND NOT EXISTS (SELECT 1 FROM venda_historico h
                       WHERE h.tenant_id = l.tenant_id AND h.campo = 'planilha_id'
                         AND h.de = p_linha_id::text) THEN
      SELECT * INTO v_lp FROM public.lancamento_da_planilha(l.tenant_id, l.empreendimento);
      SELECT f.imposto_pct INTO v_imposto_pct FROM tenant_fiscal_config f WHERE f.tenant_id = l.tenant_id;
      v_imposto_pct := COALESCE(v_imposto_pct, 0);
      -- O corretor só quando o de-para aponta UMA pessoa: venda a quatro mãos
      -- fica com o nome escrito, e ninguém é escolhido no chute.
      SELECT CASE WHEN count(*) = 1 THEN min(d.user_id::text)::uuid END INTO v_corretor
        FROM public.corretores_da_venda(l.tenant_id, l.corretor_nome) d;

      INSERT INTO vendas (
        tenant_id, planilha_id, data_venda, empreendimento, lancamento_id, construtora_id, tipo,
        corretor_id, corretor_nome, cliente, vgv, comissao_pct, comissao_bruta,
        imposto_pct, imposto_valor, recebido_em, valor_recebido, status
      ) VALUES (
        l.tenant_id, p_linha_id, l.data_assinatura, COALESCE(l.empreendimento, ''),
        v_lp.lancamento_id, v_lp.construtora_id,
        CASE WHEN v_lp.tipo_negocio = 'lancamento' THEN 'lancamento' ELSE 'terceiros' END,
        v_corretor, COALESCE(l.corretor_nome, ''), COALESCE(l.cliente_nome, ''),
        COALESCE(l.valor_vgv, 0),
        COALESCE(public.pct_da_comissao(l.comissao_total_venda, l.valor_vgv), 0),
        round(l.comissao_total_venda, 2),
        v_imposto_pct, round(l.comissao_total_venda * v_imposto_pct / 100.0, 2),
        v_recebido,
        CASE WHEN v_recebido IS NOT NULL THEN round(l.comissao_total_venda, 2) END,
        'a_faturar'
      );
      RETURN 'criada';
    ELSE
      RETURN 'sem_par';
    END IF;
  END IF;

  -- A planilha só PREENCHE o vazio, e só na venda à vista (onde a venda
  -- manda): o que a Dash já registrou, a planilha não desfaz nem refaz.
  IF v_recebido IS NOT NULL THEN
    WITH feito AS (
      UPDATE vendas SET recebido_em = v_recebido, valor_recebido = comissao_bruta
       WHERE id = v_id AND recebido_em IS NULL AND valor_recebido IS NULL
         AND (SELECT count(*) FROM lancamentos_financeiros
               WHERE origem = 'venda' AND origem_id = v_id AND status <> 'cancelado') <= 1
      RETURNING id, tenant_id, recebido_em
    )
    INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
    SELECT f.id, f.tenant_id, 'recebido_em', NULL, f.recebido_em::text,
           'recebimento lido da planilha de vendas (mesmo VGV, data e comissão)', auth.uid()
      FROM feito f;
  ELSIF public.situacao_na_planilha(p_linha_id) = 'parcelado' THEN
    -- A prazo com parcela em aberto: se a venda está quitada pela data da
    -- linha principal com a comissão inteira — a baixa que a própria planilha
    -- dá quando a linha principal chega antes das parcelas —, ela sai. Uma
    -- baixa feita na Dash com outra data ou outro valor fica.
    SELECT recebido_em INTO v_antes FROM vendas
     WHERE id = v_id AND recebido_em = l.data_recebimento AND valor_recebido = comissao_bruta
       AND (SELECT count(*) FROM lancamentos_financeiros
             WHERE origem = 'venda' AND origem_id = v_id AND status <> 'cancelado') <= 1;
    IF v_antes IS NOT NULL THEN
      UPDATE vendas SET recebido_em = NULL, valor_recebido = NULL WHERE id = v_id;
      INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
      VALUES (v_id, l.tenant_id, 'recebido_em', v_antes::text, NULL,
              'a planilha diz a prazo com parcela em aberto: a data era só a da 1ª parcela', auth.uid());
    END IF;
  END IF;
  RETURN 'ligada';
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_planilha_vira_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.venda_da_planilha(NEW.id);
  -- Uma parcela (comissão zero, repasse preenchido) muda o que a linha
  -- principal da venda dela quer dizer: reavalia a principal. É o que conserta
  -- a releitura, em que a principal chega antes das parcelas.
  IF COALESCE(NEW.comissao_total_venda, 0) = 0
     AND COALESCE(NEW.repasse_20,0) + COALESCE(NEW.repasse_40,0)
         + COALESCE(NEW.repasse_45,0) + COALESCE(NEW.repasse_50,0) > 0 THEN
    PERFORM public.venda_da_planilha(h.id)
       FROM commercial_sales h
      WHERE h.tenant_id = NEW.tenant_id AND h.is_active AND h.id <> NEW.id
        AND h.data_assinatura IS NOT DISTINCT FROM NEW.data_assinatura
        AND public.normalizar_texto(h.cliente_nome) = public.normalizar_texto(NEW.cliente_nome)
        AND COALESCE(h.comissao_total_venda, 0) > 0;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_planilha_vira_venda ON public.commercial_sales;
CREATE TRIGGER tr_planilha_vira_venda
  AFTER INSERT OR UPDATE ON public.commercial_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_planilha_vira_venda();

-- A carga inicial: as linhas que já estão lá. Rodar de novo não duplica.
CREATE OR REPLACE FUNCTION public.vendas_ligar_planilha(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_res text;
  v_cont jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  FOR r IN SELECT id FROM commercial_sales
            WHERE tenant_id = p_tenant_id AND is_active
            ORDER BY data_assinatura NULLS LAST, source_row_number LOOP
    v_res := public.venda_da_planilha(r.id);
    v_cont := jsonb_set(v_cont, ARRAY[v_res], to_jsonb(COALESCE((v_cont->>v_res)::int, 0) + 1));
  END LOOP;
  RETURN v_cont;
END;
$function$;

-- ------------------------------------------------------------
-- 3. A proposta adota a venda que chegou antes pela planilha
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
  v_adotar uuid;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM 'proposta-assinada' THEN RETURN NEW; END IF;
  -- SEM guarda de "não mudou": `vendas_importar_assinadas` redispara o gatilho
  -- com um UPDATE que repõe o mesmo estágio. Quem protege contra duplicata é a
  -- checagem de `proposta_id` logo abaixo.

  -- Proposta sem valor não vira venda.
  IF COALESCE(NEW.value, 0) <= 0 THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM vendas v WHERE v.proposta_id = NEW.id) THEN RETURN NEW; END IF;

  -- A VENDA QUE CHEGOU ANTES — pela planilha ou criada à mão na Conferência —
  -- É ADOTADA, não duplicada (20261027). Pelo dia de São Paulo: assinada às
  -- 22h, a proposta já é amanhã em UTC, e quem lança anota o dia daqui.
  SELECT CASE WHEN count(*) = 1 THEN min(v.id::text)::uuid END INTO v_adotar
    FROM vendas v
   WHERE v.tenant_id = NEW.tenant_id AND v.proposta_id IS NULL
     AND v.data_venda = (COALESCE(NEW.signed_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date
     AND abs(v.vgv - NEW.value) < 1;
  IF v_adotar IS NOT NULL THEN
    UPDATE vendas
       SET proposta_id = NEW.id,
           lead_id = COALESCE(lead_id, NEW.lead_id),
           corretor_id = COALESCE(corretor_id, NEW.agent_user_id),
           comissao_da_proposta = NULLIF(NEW.commission_total, 0)
     WHERE id = v_adotar;
    RETURN NEW;
  END IF;

  SELECT l.id, l.construtora, l.construtora_id INTO v_lanc_id, v_nome, v_construtora_id
    FROM lancamentos l
   WHERE l.tenant_id = NEW.tenant_id
     AND upper(public.sem_acento(btrim(l.nome)))
       = upper(public.sem_acento(btrim(COALESCE(NEW.forecast_empreendimento, ''))))
   LIMIT 1;

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

  -- A COMISSÃO NEGOCIADA MANDA (20261014).
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
-- 4. A aba Planilha: a permissão do Gerente, a regra de lançamento num lugar
--    só, e a situação da venda ligada (o resto da função é o de 20260929)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_planilha_conferencia(p_tenant_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_corretor text DEFAULT NULL::text, p_equipe_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_construtora_id uuid DEFAULT NULL::uuid, p_lancamento_id uuid DEFAULT NULL::uuid, p_situacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.vendas_pode_editar(p_tenant_id) THEN
    RAISE EXCEPTION 'sem permissao para a conferencia de vendas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH base AS (
    SELECT
      cs.*,
      COALESCE(cs.repasse_20,0) + COALESCE(cs.repasse_40,0)
        + COALESCE(cs.repasse_45,0) + COALESCE(cs.repasse_50,0) AS repasse_corretor,
      -- LANÇAMENTO OU PRONTO, e qual lançamento: do cadastro, porque a
      -- planilha não diz. O de-para de nomes manda; sem ele, o nome igual ao
      -- do cadastro de lançamentos.
      lp.tipo_negocio,
      lp.lancamento_id,
      lp.construtora_id
    FROM public.commercial_sales cs
    -- O de-para de nomes e o cadastro de lançamentos: a mesma regra da ponte
    -- planilha → venda (20261027), num lugar só.
    LEFT JOIN LATERAL public.lancamento_da_planilha(cs.tenant_id, cs.empreendimento) lp ON true
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND (p_de  IS NULL OR cs.data_assinatura >= p_de)
     AND (p_ate IS NULL OR cs.data_assinatura <= p_ate)
  ),
  classificadas AS (
    SELECT
      b.*,
      -- "Comissão Imobiliária" COMO A PLANILHA ESCREVEU, e a conta só quando
      -- a célula não é legível.
      --
      -- A conta (comissão − corretor − team leader) acerta a venda comum, e
      -- era a única saída enquanto a importação zera `valor_conta_japi`. Mas
      -- ela erra justamente as linhas que o chefe explicou em 29/09: a parcela
      -- tem comissão total ZERADA e repasse preenchido, e a conta dava
      -- −R$ 1.250,00 onde a planilha diz +R$ 1.250,00. Erra também a venda
      -- com parceiro (a parte da Japi não está em coluna nenhuma que a conta
      -- enxergue): R$ 44.375,00 onde a planilha diz R$ 21.875,00. Medido em
      -- produção: 8 das 37 linhas.
      --
      -- A célula é a posição 20 de `raw_row` — conferida nas 37 linhas, que
      -- batem com a conta no centavo em todas as vendas comuns.
      -- ponytail: posição fixa. Se a planilha ganhar ou perder uma coluna
      -- antes desta, a leitura desliza; por isso só vale célula que começa
      -- com "R$" — data, nome e vazio caem na conta. O certo é a importação
      -- gravar a coluna pelo cabeçalho, e aí esta leitura sai.
      COALESCE(
        CASE WHEN b.raw_row -> 'values' ->> 20 ~ '^\s*R\$\s*-?[0-9.]+(,[0-9]{1,2})?\s*$'
             THEN replace(regexp_replace(b.raw_row -> 'values' ->> 20, '[^0-9,-]', '', 'g'), ',', '.')::numeric
        END,
        COALESCE(b.comissao_total_venda,0) - b.repasse_corretor - COALESCE(b.team_leader_valor,0)
      ) AS comissao_imobiliaria,
      -- ============================================================
      -- PAGO / PARCELADO / PENDENTE, lido do que a planilha já diz. A regra
      -- mora em `situacao_na_planilha` desde 03/10, porque a ponte também a usa.
      --
      -- Não é campo novo para alguém preencher: a planilha tem a data de
      -- recebimento e o "Status recebimento", e os três estados saem deles.
      -- Uma segunda fonte para a mesma resposta divergiria na primeira
      -- releitura do Drive.
      --
      --   PARCELADO  o texto diz ("PARCELADO", "1 de 5"), OU a linha é uma
      --              parcela — Total Unidade, Total (-3%) e Comissão Total
      --              zerados, mas repasse preenchido —, OU a venda tem parcelas
      --              abaixo dela (mesmo cliente, mesma data de assinatura).
      --              O repasse é o que separa parcela de linha em branco.
      --   PAGO       tem data de recebimento.
      --   PENDENTE   o resto: "A RECEBER", "Pendente", "ver na Caixa".
      -- ============================================================
      -- A situação da DASH quando ela sabe mais que a planilha: a venda foi paga,
      -- ou foi parcelada aqui. Fora disso, o que a planilha diz (regra de 29/09).
      CASE WHEN vd.id IS NOT NULL AND (rs.situacao = 'pago' OR rs.parcelas > 1) THEN rs.situacao
           ELSE public.situacao_na_planilha(b.id)
      END AS situacao,
      vd.id AS venda_id,
      rs.parcelas, rs.pagas AS parcelas_pagas,
      (vd.id IS NULL AND COALESCE(b.comissao_total_venda, 0) > 0) AS sem_par
    FROM base b
    LEFT JOIN public.vendas vd ON vd.planilha_id = b.id
    LEFT JOIN LATERAL public.venda_parcelas_resumo(vd.id) rs ON vd.id IS NOT NULL
  ),
  linhas AS (
    SELECT
      c.id,
      -- AS COLUNAS DA PLANILHA DO DRIVE, na ordem dela, menos as três que o
      -- chefe tirou em 29/09 (Área M², R$ M², Total (-3%)).
      c.empreendimento,
      NULLIF(btrim(COALESCE(c.quadra, '') || CASE WHEN COALESCE(c.unidade,'') <> ''
                                                  THEN ' · ' || c.unidade ELSE '' END), '') AS unidade_codigo,
      -- "De onde veio o lead" — Santa, Dejoy, Permuta. Já é o que a coluna
      -- da planilha guarda; vai como foi escrito.
      c.origem,
      c.total_unidade,           -- "Total Unidade"
      c.comissao_total_venda,    -- "Comissão Total"
      c.cliente_nome,
      c.corretor_nome,
      c.tipo AS nivel_corretor,  -- "Tipo": o nível do corretor (PL, Tropa, TL…)
      c.repasse_corretor,        -- os quatro percentuais: cada venda usa um só
      c.team_leader_valor,       -- "Team Leader": é VALOR, não nome
      c.comissao_imobiliaria,
      c.data_assinatura,
      c.data_recebimento,
      c.observacoes AS status_recebimento,  -- o texto livre, que continua na tela
      c.situacao,
      c.venda_id,
      c.parcelas,
      c.parcelas_pagas,
      c.sem_par,
      -- 29/09: é o tipo que diz à tela onde vai o código. Lançamento mostra
      -- Qd · Un; o resto (terceiros e o que ninguém classificou, como a
      -- PARCERIA) mostra o código do imóvel, digitado na Dash.
      c.tipo_negocio,
      cod.codigo AS codigo_imovel
    FROM classificadas c
    -- O código é da VENDA, não da linha: as parcelas herdam o da cabeça.
    -- A chave é a mesma que identifica a venda a prazo lá em cima.
    LEFT JOIN public.venda_planilha_codigo cod
           ON cod.tenant_id = c.tenant_id
          AND cod.cliente_chave = public.normalizar_texto(c.cliente_nome)
          AND cod.data_assinatura = c.data_assinatura
          AND cod.empreendimento_chave = public.normalizar_texto(c.empreendimento)
   WHERE (NULLIF(p_corretor, '') IS NULL
          OR public.normalizar_texto(c.corretor_nome) = public.normalizar_texto(p_corretor))
     -- EQUIPE: a de hoje de quem recebe a venda. O corretor da planilha é
     -- texto, e é o de-para (`corretores_da_venda`) que diz quem ele é; a
     -- venda a quatro mãos entra na equipe de qualquer um dos dois.
     -- Ex-membro não tem equipe, e some deste recorte — só dele.
     AND (p_equipe_id IS NULL OR EXISTS (
          SELECT 1
            FROM public.corretores_da_venda(p_tenant_id, c.corretor_nome) d
            JOIN public.tenant_memberships tm
              ON tm.tenant_id = p_tenant_id AND tm.user_id = d.user_id
           WHERE tm.team_id = p_equipe_id))
     AND (NULLIF(p_tipo, '') IS NULL OR c.tipo_negocio = p_tipo)
     AND (p_construtora_id IS NULL OR c.construtora_id = p_construtora_id)
     AND (p_lancamento_id IS NULL OR c.lancamento_id = p_lancamento_id)
     AND (NULLIF(p_situacao, '') IS NULL OR c.situacao = p_situacao)
  )
  SELECT jsonb_build_object(
    'linhas', COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.data_assinatura DESC NULLS LAST), '[]'::jsonb),
    'total_linhas', count(*),
    'total_unidade', COALESCE(sum(l.total_unidade), 0),
    'total_comissao', COALESCE(sum(l.comissao_total_venda), 0),
    'total_imobiliaria', COALESCE(sum(l.comissao_imobiliaria), 0),
    'total_recebido', COALESCE(sum(l.comissao_total_venda) FILTER (WHERE l.data_recebimento IS NOT NULL), 0)
  ) INTO v_resultado
  FROM linhas l;

  RETURN v_resultado;
END;
$function$;

-- ------------------------------------------------------------
-- 5. Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.lancamento_da_planilha(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venda_da_planilha(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.situacao_na_planilha(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.situacao_na_planilha(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lancamento_da_planilha(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.venda_da_planilha(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.vendas_ligar_planilha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_ligar_planilha(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
