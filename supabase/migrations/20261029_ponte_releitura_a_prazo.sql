-- ============================================================
-- Ponte planilha → venda: a releitura de venda a prazo (03/10/2026)
--
-- Achado ao ensaiar a planilha nova (143f1eXp…): o importador grava uma linha
-- por vez, e a linha principal de uma venda a prazo chega ANTES das parcelas.
-- Ela nascia recebida na data da 1ª parcela e ficava assim — a regra era "a
-- planilha só preenche o vazio". Caso real: Angelo Finati, R$ 66.250, 6
-- parcelas, a última em 31/07; ficaria recebida em 09/02.
--
-- Agora a baixa que a PRÓPRIA PLANILHA deu (marcada no histórico da venda)
-- acompanha as parcelas: vai para a data da última, ou sai se falta alguma.
-- Baixa feita na Dash não tem a marca e não se mexe. A venda criada já
-- recebida pela planilha passa a deixar essa marca.
--
-- Só a função muda; o resto da 20261027 (aplicada em produção hoje) fica.
-- ============================================================

BEGIN;

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
      )
      RETURNING id INTO v_id;
      -- A marca de que foi a PLANILHA que deu a baixa: é ela que deixa a
      -- releitura mover essa data depois (venda a prazo), e só essa.
      IF v_recebido IS NOT NULL THEN
        INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
        VALUES (v_id, l.tenant_id, 'recebido_em', NULL, v_recebido::text,
                'recebimento lido da planilha de vendas (venda criada da planilha)', auth.uid());
      END IF;
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
  END IF;

  -- A prazo: a baixa que a PRÓPRIA PLANILHA deu (histórico) acompanha as
  -- parcelas quando elas chegam — vai para a data da última, ou sai se falta
  -- alguma. É o que conserta a releitura, em que a linha principal chega antes
  -- das parcelas. Baixa feita na Dash (sem a marca da planilha) não se mexe.
  IF public.situacao_na_planilha(p_linha_id) = 'parcelado' THEN
    SELECT v.recebido_em INTO v_antes FROM vendas v
     WHERE v.id = v_id AND v.recebido_em IS NOT NULL AND v.valor_recebido = v.comissao_bruta
       AND (SELECT count(*) FROM lancamentos_financeiros
             WHERE origem = 'venda' AND origem_id = v_id AND status <> 'cancelado') <= 1
       AND EXISTS (SELECT 1 FROM venda_historico h
                    WHERE h.venda_id = v.id AND h.campo = 'recebido_em'
                      AND h.justificativa LIKE 'recebimento lido da planilha%'
                      AND h.para = v.recebido_em::text);
    IF v_antes IS NOT NULL AND v_antes IS DISTINCT FROM v_recebido THEN
      UPDATE vendas SET recebido_em = v_recebido,
                        valor_recebido = CASE WHEN v_recebido IS NULL THEN NULL ELSE valor_recebido END
       WHERE id = v_id;
      INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
      VALUES (v_id, l.tenant_id, 'recebido_em', v_antes::text, v_recebido::text,
              CASE WHEN v_recebido IS NULL
                   THEN 'recebimento lido da planilha de vendas (a prazo com parcela em aberto: a data era só a da 1ª)'
                   ELSE 'recebimento lido da planilha de vendas (a prazo quitada: vale a data da última parcela)' END,
              auth.uid());
    END IF;
  END IF;
  RETURN 'ligada';
END;
$function$;

REVOKE ALL ON FUNCTION public.venda_da_planilha(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venda_da_planilha(uuid) TO service_role;

COMMIT;
