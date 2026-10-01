-- ============================================================
-- A.5 · Funil de safra (coorte), separado por Lançamento e Pronto.
--
-- O problema: o funil diz "152 passaram por Novos Leads" e "704 estão agora",
-- e mistura quem entrou ontem com quem entrou em março. Comparando setembro
-- com agosto, não dá para saber se melhorou a captação ou se a base velha
-- maturou. A safra conta SÓ os leads que entraram no período.
--
-- Nenhuma tabela nova (Manual): é consulta sobre o que já existe.
--   - entrada   = leads.created_at, no dia de São Paulo;
--   (lead_events.lead_id é TEXTO; proposals.lead_id é uuid.)
--   - atuação   = leads.classification ('lancamento' | 'pronto' | 'indefinido');
--   - etapa     = passou por ela se há evento de mudança para ela, OU se a
--                 etapa atual está adiante na ordem do funil. O registro de
--                 eventos começa em 10/09/2026; sem a segunda regra, um lead
--                 de agosto que hoje está em Visita pareceria nunca ter
--                 passado por Interação.
--   - fechou    = chegou a Proposta Assinada: evento, etapa atual, ou proposta
--                 assinada ligada ao lead. A data é a primeira das conhecidas.
--
-- Medido em 30/09 na Lotus: das 29 vendas, NENHUMA aponta para um lead, e só 5
-- leads chegaram a Proposta Assinada. O número de "fechou" sai pequeno — e é
-- o verdadeiro; a tela diz de onde ele vem.
-- ============================================================

CREATE OR REPLACE FUNCTION public.funil_de_safra(
  p_tenant_id uuid,
  p_de date,
  p_ate date,
  p_etapas text[],
  p_atuacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fim text := p_etapas[array_length(p_etapas, 1)];
  v jsonb;
BEGIN
  -- Mesma porta do funil_passaram_por_etapa: o servidor (sem usuário), o dono
  -- da plataforma, ou quem é da casa. Só números agregados saem daqui.
  IF NOT (auth.uid() IS NULL
          OR coalesce(public.is_platform_owner(), false)
          OR EXISTS (SELECT 1 FROM tenant_memberships tm
                      WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR coalesce(array_length(p_etapas, 1), 0) = 0 THEN
    RAISE EXCEPTION 'periodo_invalido';
  END IF;

  WITH safra AS (
    SELECT l.id, l.created_at, l.status
      FROM leads l
     WHERE l.tenant_id = p_tenant_id
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
       AND (p_atuacao IS NULL OR p_atuacao = ANY (l.classification))
  ), fechamento AS (
    SELECT s.id, s.created_at, s.status,
           LEAST(
             (SELECT min(e.created_at) FROM lead_events e
               WHERE e.tenant_id = p_tenant_id AND e.lead_id = s.id::text
                 AND e.event_type = 'lead.stage_changed' AND e.para = v_fim),
             (SELECT min(p.signed_at) FROM proposals p
               WHERE p.tenant_id = p_tenant_id AND p.lead_id = s.id AND p.stage_id = 'proposta-assinada')
           ) AS fechou_em
      FROM safra s
  ), lead_a_lead AS (
    SELECT f.*,
           (f.fechou_em IS NOT NULL OR f.status = v_fim) AS fechou
      FROM fechamento f
  ), posicionado AS (
    -- Quem fechou passou pelo funil inteiro, mesmo que o card tenha ficado
    -- parado antes (a proposta foi assinada sem ninguém arrastar o card). E
    -- todo lead da safra passou pela primeira etapa — inclusive o arquivado,
    -- cuja etapa atual está fora da lista: sem o GREATEST, a Lotus mostrava
    -- "Novos Leads 505" ao lado de "508 entraram" (setembro, medido em 01/10).
    SELECT x.*,
           CASE WHEN x.fechou THEN array_length(p_etapas, 1)
                ELSE GREATEST(1, coalesce(array_position(p_etapas, x.status), 0)) END AS posicao
      FROM lead_a_lead x
  )
  SELECT jsonb_build_object(
    'entraram', (SELECT count(*) FROM lead_a_lead),
    'por_etapa', (
      SELECT coalesce(jsonb_agg(n ORDER BY i), '[]'::jsonb)
        FROM (
          SELECT i, (SELECT count(*) FROM posicionado x
                      WHERE x.posicao >= i
                         OR EXISTS (SELECT 1 FROM lead_events e
                                     WHERE e.tenant_id = p_tenant_id AND e.lead_id = x.id::text
                                       AND e.event_type = 'lead.stage_changed' AND e.para = p_etapas[i])) AS n
            FROM generate_subscripts(p_etapas, 1) AS i
        ) por),
    'fecharam', (SELECT count(*) FROM lead_a_lead WHERE fechou),
    'fecharam_com_data', (SELECT count(*) FROM lead_a_lead WHERE fechou_em IS NOT NULL),
    'mediana_dias', (
      SELECT round(percentile_cont(0.5) WITHIN GROUP (
               ORDER BY extract(epoch FROM (fechou_em - created_at)) / 86400.0)::numeric, 1)
        FROM lead_a_lead WHERE fechou_em IS NOT NULL),
    'viva', (SELECT count(*) FROM lead_a_lead WHERE NOT fechou AND status IS DISTINCT FROM 'Arquivado'),
    'arquivados', (SELECT count(*) FROM lead_a_lead WHERE NOT fechou AND status = 'Arquivado'),
    'inicio_do_historico', (SELECT min(e.created_at) FROM lead_events e
                             WHERE e.tenant_id = p_tenant_id AND e.event_type = 'lead.stage_changed')
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.funil_de_safra(uuid, date, date, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_de_safra(uuid, date, date, text[], text) TO authenticated, service_role;

COMMENT ON FUNCTION public.funil_de_safra(uuid, date, date, text[], text) IS
  'A.5 · Funil de safra: só os leads que ENTRARAM no período (dia de São Paulo), por etapa, com % que fechou, mediana de dias até fechar e safra viva. Atuação opcional: lancamento | pronto.';
