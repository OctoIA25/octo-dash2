-- Migration: Painel comercial (P3.1)
-- Data: 2026-09-21
--
-- O painel lê `commercial_sales`, que hoje tem 37 vendas ativas da Lotus
-- (12/01 a 24/08/2026), R$ 14,46 M de VGV e R$ 737 mil de VGC. Três coisas
-- foram medidas antes de escrever, e todas mudaram o desenho.
--
-- 1. O FILTRO "LANÇAMENTOS · PRONTOS/TERCEIROS" NÃO TEM COLUNA.
--    A coluna `tipo` de `commercial_sales` não é isso — ela guarda o nível do
--    corretor (ES, PL, TL, Estagiário, Tropa). O que existe é o campo
--    `empreendimento`, e nele um dos valores é literalmente "TERCEIROS".
--
-- 2. "RESERVA CASTANHEIRA" (16 vendas) E "CASTANHEIRA" (11) SÃO O MESMO.
--    Juntas somam 27 das 37 vendas e R$ 12,4 M — sem juntar, todo relatório por
--    empreendimento nasce partido ao meio. Confirmado pelo chefe em 21/09.
--
-- 3. OITO VENDAS TÊM VGV ZERADO, MAS TÊM COMISSÃO (R$ 76 mil).
--    São as de TERCEIROS (7) e PARCERIA (1). Incluí-las no ticket médio o
--    derruba de R$ 498.524 para R$ 390.735 — 28% a menos — porque divide por
--    vendas que não entraram no numerador. Decidido: elas ficam FORA do que
--    depende de VGV (ticket e % de comissão), continuam contando em número de
--    vendas e em VGC, e a tela DIZ quantas ficaram de fora.
--
-- ORDEM DO DEPLOY: banco antes do front.

-- ------------------------------------------------------------
-- 1. O nome de verdade do empreendimento, e o que ele é
-- ------------------------------------------------------------
-- Uma tabela responde às duas perguntas de propósito: "como este
-- empreendimento se chama de verdade" e "ele é lançamento ou de terceiros".
-- Separá-las daria dois cadastros para manter, e o segundo ficaria vazio.
CREATE TABLE IF NOT EXISTS public.vendas_empreendimento_alias (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Como vem na planilha, já normalizado (maiúsculas, sem espaço nas pontas).
  nome_bruto text NOT NULL,
  nome_canonico text NOT NULL,

  -- NULO é resposta legítima: "ninguém classificou ainda". A tela conta essas
  -- vendas à parte, em vez de empurrá-las para um dos lados e mentir no filtro.
  tipo text CHECK (tipo IS NULL OR tipo IN ('lancamento', 'terceiros')),

  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, nome_bruto)
);

REVOKE ALL ON public.vendas_empreendimento_alias FROM anon, authenticated;
GRANT SELECT ON public.vendas_empreendimento_alias TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendas_empreendimento_alias TO authenticated;
GRANT ALL ON public.vendas_empreendimento_alias TO service_role;

ALTER TABLE public.vendas_empreendimento_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendas_alias_select ON public.vendas_empreendimento_alias;
CREATE POLICY vendas_alias_select ON public.vendas_empreendimento_alias
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS vendas_alias_write ON public.vendas_empreendimento_alias;
CREATE POLICY vendas_alias_write ON public.vendas_empreendimento_alias
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- O que o dado mostra, e SÓ o que ele mostra. "TERCEIROS" é terceiros porque
-- está escrito. Os que casam com um lançamento cadastrado são lançamento.
-- PARCERIA fica sem classificação: não há evidência de qual dos dois é, e
-- chutar faria o filtro mentir em R$ 9,8 mil de comissão.
INSERT INTO public.vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo)
SELECT DISTINCT
  cs.tenant_id,
  upper(btrim(cs.empreendimento)),
  CASE upper(btrim(cs.empreendimento))
    -- Confirmado pelo chefe em 21/09: é o mesmo empreendimento.
    WHEN 'CASTANHEIRA' THEN 'RESERVA CASTANHEIRA'
    ELSE upper(btrim(cs.empreendimento))
  END,
  CASE
    WHEN upper(btrim(cs.empreendimento)) IN ('TERCEIROS') THEN 'terceiros'
    WHEN upper(btrim(cs.empreendimento)) IN ('CASTANHEIRA', 'RESERVA CASTANHEIRA', 'GIOVIALE', 'RESERVA MARAJOARA II')
      THEN 'lancamento'
    ELSE NULL
  END
FROM public.commercial_sales cs
WHERE coalesce(btrim(cs.empreendimento), '') <> ''
ON CONFLICT (tenant_id, nome_bruto) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Dias úteis — para a projeção do mês
-- ------------------------------------------------------------
-- "No ritmo atual, quanto fecha" é vendas até hoje ÷ dias úteis passados ×
-- dias úteis do mês. Contar dias corridos faria a projeção de um mês que
-- começou num sábado sair 40% menor.
--
-- Feriado NÃO entra: a Dash não tem calendário de feriados, e inventar um
-- daria uma projeção que ninguém consegue conferir. Segunda a sexta é o que
-- dá para afirmar.
CREATE OR REPLACE FUNCTION public.dias_uteis(p_de date, p_ate date)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT count(*)::int
    FROM generate_series(p_de, p_ate, interval '1 day') d
   WHERE extract(isodow FROM d) < 6;
$function$;

-- ------------------------------------------------------------
-- 3. Os contadores de um período
-- ------------------------------------------------------------
-- Existe separada para o painel chamá-la TRÊS vezes — período atual, mês
-- anterior e mesmo mês do ano anterior — sem triplicar a conta. Três cópias
-- divergiriam na primeira correção.
CREATE OR REPLACE FUNCTION public.painel_comercial_periodo(
  p_tenant_id uuid,
  p_de        date,
  p_ate       date,
  -- 'todos' | 'lancamento' | 'terceiros'
  p_tipo      text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH vendas AS (
    SELECT cs.*,
           COALESCE(a.nome_canonico, upper(btrim(cs.empreendimento))) AS emp,
           a.tipo AS tipo_emp
      FROM commercial_sales cs
      LEFT JOIN vendas_empreendimento_alias a
             ON a.tenant_id = cs.tenant_id
            AND a.nome_bruto = upper(btrim(cs.empreendimento))
     WHERE cs.tenant_id = p_tenant_id
       AND cs.is_active
       AND cs.data_assinatura >= p_de
       AND cs.data_assinatura <= p_ate
       AND (p_tipo = 'todos' OR a.tipo = p_tipo)
  )
  SELECT jsonb_build_object(
    'vendas', count(*),
    'vgv', COALESCE(sum(valor_vgv), 0),
    'vgc', COALESCE(sum(valor_vgc), 0),

    -- Só as vendas COM VGV entram no ticket e na % de comissão. Oito das 37
    -- têm comissão e nenhum VGV; incluí-las derruba o ticket em 28%.
    'vendas_com_vgv', count(*) FILTER (WHERE COALESCE(valor_vgv, 0) > 0),
    'vendas_sem_vgv', count(*) FILTER (WHERE COALESCE(valor_vgv, 0) = 0),
    'ticket_medio', CASE WHEN count(*) FILTER (WHERE COALESCE(valor_vgv, 0) > 0) > 0
                         THEN round(sum(valor_vgv) FILTER (WHERE valor_vgv > 0)
                                    / count(*) FILTER (WHERE COALESCE(valor_vgv, 0) > 0))
                    END,
    'pct_comissao', CASE WHEN COALESCE(sum(valor_vgv) FILTER (WHERE valor_vgv > 0), 0) > 0
                         THEN round(100.0 * sum(valor_vgc) FILTER (WHERE valor_vgv > 0)
                                    / sum(valor_vgv) FILTER (WHERE valor_vgv > 0), 2)
                    END,

    -- ATENÇÃO: isto conta NOMES distintos, não pessoas. Medido em 21/09/2026,
    -- as 37 vendas da Lotus trazem 14 nomes — primeiro nome, apelido e até
    -- dois numa célula só ("Flávia e Humberto"), com "Humberto" e "Humberto
    -- Martinez" quase certamente a mesma pessoa. Por isso o campo se chama
    -- `nomes_que_venderam`, e não `produtivos`: o painel não pode dividir isso
    -- por membros e chamar de produtividade.
    'nomes_que_venderam', count(DISTINCT corretor_nome) FILTER (WHERE coalesce(btrim(corretor_nome), '') <> ''),
    -- Quantos desses nomes a Dash consegue reconhecer como membro. Só 3 dos 14
    -- casam hoje; enquanto isso, a % de produtivos não é afirmável.
    'nomes_reconhecidos', count(DISTINCT corretor_nome) FILTER (
      WHERE coalesce(btrim(corretor_nome), '') <> ''
        AND EXISTS (
          SELECT 1 FROM tenant_memberships tm
          JOIN auth.users u ON u.id = tm.user_id
          WHERE tm.tenant_id = p_tenant_id
            AND upper(public.sem_acento(btrim(COALESCE(u.raw_user_meta_data->>'name', u.email))))
              = upper(public.sem_acento(btrim(vendas.corretor_nome)))
        )
    ),
    -- Vendas cujo empreendimento ninguém classificou ainda. A tela mostra: sem
    -- isso, trocar o filtro faz vendas sumirem sem explicação.
    'sem_classificacao', count(*) FILTER (WHERE tipo_emp IS NULL)
  )
  FROM vendas;
$function$;

-- ------------------------------------------------------------
-- 4. O painel
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_comercial(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_tipo      text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, v_hoje);
  v_tipo text := COALESCE(NULLIF(btrim(p_tipo), ''), 'todos');
  v_atual jsonb;
  v_mes_ant jsonb;
  v_ano_ant jsonb;
  v_propostas int;
  v_ativos int;
  v_metas jsonb;
  v_projecao jsonb;
  v_uteis_ate int;
  v_uteis_mes int;
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

  v_atual   := painel_comercial_periodo(p_tenant_id, v_de, v_ate, v_tipo);
  -- Mês anterior e mesmo mês do ano anterior, na MESMA largura de janela: o
  -- mês atual costuma estar pela metade, e comparar meio mês com mês inteiro
  -- mostraria queda todo dia 5.
  v_mes_ant := painel_comercial_periodo(p_tenant_id,
                 (v_de - interval '1 month')::date, (v_ate - interval '1 month')::date, v_tipo);
  v_ano_ant := painel_comercial_periodo(p_tenant_id,
                 (v_de - interval '1 year')::date, (v_ate - interval '1 year')::date, v_tipo);

  SELECT count(*) INTO v_propostas
    FROM proposals p
   WHERE p.tenant_id = p_tenant_id
     AND p.created_at >= v_de AND p.created_at < (v_ate + 1);

  -- "Ativos" é quem pode vender: membro do tenant que não é dono da
  -- plataforma. O owner aparece como membro comum em vários tenants e
  -- inflaria o denominador de "produtivos".
  SELECT count(*) INTO v_ativos
    FROM tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id
     AND lower(u.email) <> 'octo.inteligenciaimobiliaria@gmail.com';

  -- As metas do período, da tela Metas. Hoje a tabela está VAZIA na plataforma
  -- inteira — e é por isso que o painel devolve null em vez de zero: zero
  -- pintaria uma barra de 100% contra uma meta que ninguém cadastrou.
  SELECT jsonb_build_object(
    'vendas', max(target_value) FILTER (WHERE lower(name) LIKE '%venda%'),
    'propostas', max(target_value) FILTER (WHERE lower(name) LIKE '%proposta%' OR lower(name) LIKE '%analise%'),
    'vgc', max(target_value) FILTER (WHERE lower(name) LIKE '%vgc%' OR lower(name) LIKE '%comiss%'),
    'cadastradas', count(*)
  ) INTO v_metas
  FROM goals g
  WHERE g.tenant_id = p_tenant_id AND g.status = 'active'
    AND g.start_date <= v_ate AND g.end_date >= v_de;

  -- Projeção: ritmo por dia ÚTIL decorrido, aplicado ao mês inteiro. Só faz
  -- sentido quando a janela é o mês corrente — em período escolhido à mão,
  -- "projeção do mês" não quer dizer nada, e devolver null é mais honesto.
  IF v_de = date_trunc('month', v_hoje)::date AND v_ate >= v_hoje THEN
    v_uteis_ate := dias_uteis(v_de, v_hoje);
    v_uteis_mes := dias_uteis(v_de, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
    v_projecao := jsonb_build_object(
      'dias_uteis_decorridos', v_uteis_ate,
      'dias_uteis_no_mes', v_uteis_mes,
      'vendas', CASE WHEN v_uteis_ate > 0
                     THEN round((v_atual->>'vendas')::numeric / v_uteis_ate * v_uteis_mes) END,
      'vgv', CASE WHEN v_uteis_ate > 0
                  THEN round((v_atual->>'vgv')::numeric / v_uteis_ate * v_uteis_mes) END
    );
  END IF;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'tipo', v_tipo,
    'atual', v_atual,
    'mes_anterior', v_mes_ant,
    'ano_anterior', v_ano_ant,
    'propostas', v_propostas,
    'ativos', v_ativos,
    'metas', v_metas,
    'projecao', v_projecao
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_comercial(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_comercial(uuid, date, date, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.painel_comercial_periodo(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_comercial_periodo(uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dias_uteis(date, date) TO authenticated, service_role;
