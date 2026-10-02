-- ============================================================
-- Funil da Visão Geral: as propostas viram UMA etapa, e o fim é a VENDA
--
-- Pedido do chefe em 02/10/2026, sobre o funil de Cliente Interessado:
--   "proposta ficaria tudo junto, e no final colocaria o último item como
--    venda (...) as vendas que constam aí são as que estão no Conferência de
--    vendas, cada uma tem que filtrar de acordo com o período dela".
--
-- Duas contas novas, e as duas são do banco:
--
-- 1. QUANTOS PASSARAM POR "PROPOSTA". A etapa da tela junta 'Proposta
--    Enviada', 'Proposta Criada' e 'Proposta Assinada'. Somar o que
--    funil_passaram_por_etapa devolve para cada uma conta DUAS VEZES o lead
--    que passou por mais de uma — medido na Lotus em 02/10: 3 + 5 = 8, para
--    5 leads de verdade. Por isso o grupo é contado aqui, por lead distinto.
--
-- 2. QUANTAS VENDAS NO PERÍODO. A fonte é `vendas` — a mesma tabela da
--    Conferência de vendas —, pela data de cada venda (`data_venda`). Não
--    pela entrada do lead: nenhuma das 29 vendas da Lotus aponta para lead.
--    `vendas_conferencia` não serve aqui porque só admin a lê, e o funil é
--    visto também pelos 15 do cargo Corretor da Lotus. Desta porta sai só o
--    NÚMERO de vendas — nem valor, nem comissão, nem nome.
--
--    E o corretor conta SÓ AS DELE, a mesma regra dos leads desse funil
--    (useLeadsMetrics: corretor vê os próprios, os outros papéis veem a casa).
--    Decidido aqui, e não na tela, para que nenhum corretor leia o total da
--    casa chamando a função direto.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.funil_passaram_por_alguma(
  p_tenant_id uuid,
  p_etapas text[],
  p_de timestamptz DEFAULT NULL,
  p_ate timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Mesma porta de funil_passaram_por_etapa: `lead_events` não tem policy, e
  -- `auth.uid() IS NULL` é o servidor, que já se autenticou por fora.
  SELECT count(DISTINCT e.lead_id)
    FROM public.lead_events e
   WHERE e.tenant_id = p_tenant_id
     AND e.event_type = 'lead.stage_changed'
     AND e.para = ANY (p_etapas)
     AND (p_de  IS NULL OR e.created_at >= p_de)
     AND (p_ate IS NULL OR e.created_at <= p_ate)
     AND (
       auth.uid() IS NULL
       OR public.is_platform_owner()
       OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
     );
$function$;

COMMENT ON FUNCTION public.funil_passaram_por_alguma(uuid, text[], timestamptz, timestamptz) IS
  'Quantos leads DISTINTOS passaram por ALGUMA das etapas — a "Proposta" do funil junta três. Somar por etapa contava duas vezes quem passou por mais de uma.';

CREATE OR REPLACE FUNCTION public.funil_vendas_no_periodo(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_atuacao text DEFAULT NULL        -- 'lancamento' | 'pronto', como em funil_de_safra
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_so_do_corretor uuid;
BEGIN
  IF NOT (auth.uid() IS NULL
          OR coalesce(public.is_platform_owner(), false)
          OR EXISTS (SELECT 1 FROM tenant_memberships tm
                      WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  -- O dono da plataforma também tem membership nas casas: ele vem antes.
  IF NOT coalesce(public.is_platform_owner(), false)
     AND EXISTS (SELECT 1 FROM tenant_memberships tm
                  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid()
                    AND tm.role = 'corretor') THEN
    v_so_do_corretor := auth.uid();
  END IF;

  -- Sem período = todas, como "Todo período" na tela. Os status entram todos,
  -- igual à Conferência sem filtro: o número tem de bater com o de lá.
  RETURN (
    SELECT count(*)
      FROM vendas v
     WHERE v.tenant_id = p_tenant_id
       AND (v_so_do_corretor IS NULL OR v.corretor_id = v_so_do_corretor)
       AND (p_de  IS NULL OR v.data_venda >= p_de)
       AND (p_ate IS NULL OR v.data_venda <= p_ate)
       -- Na venda, o pronto se chama 'terceiros' (vendas_tipo_check).
       AND (p_atuacao IS NULL
            OR v.tipo = CASE p_atuacao WHEN 'pronto' THEN 'terceiros' ELSE p_atuacao END)
  );
END;
$function$;

COMMENT ON FUNCTION public.funil_vendas_no_periodo(uuid, date, date, text) IS
  'A etapa Venda do funil: quantas vendas da Conferência caem no período, pela data_venda. Corretor conta só as dele. Só o número — valores seguem só para admin em vendas_conferencia.';

REVOKE ALL ON FUNCTION public.funil_passaram_por_alguma(uuid, text[], timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.funil_vendas_no_periodo(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_passaram_por_alguma(uuid, text[], timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.funil_vendas_no_periodo(uuid, date, date, text) TO authenticated, service_role;

COMMIT;

-- Função nova: sem isto o PostgREST não a enxerga e a chamada volta "function
-- not found" — na tela, a Venda ficaria em branco.
NOTIFY pgrst, 'reload schema';
