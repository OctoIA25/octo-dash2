-- ============================================================
-- "Quantos passaram por cada etapa" passa a ser contado NO BANCO
--
-- ============================================================
-- O DEFEITO, achado em 24/09 com dado de verdade
-- ============================================================
--
-- A versão anterior baixava os eventos e contava em JavaScript, pedindo
-- `.limit(50000)`. O PostgREST **corta a resposta em mil linhas** — é o
-- `db-max-rows` dele — e não avisa: não há erro, não há cabeçalho de alerta,
-- a resposta simplesmente vem menor.
--
-- E como a consulta ordenava por data, as mil linhas que chegavam eram as mil
-- MAIS ANTIGAS, todas da primeira etapa. O resultado na tela:
--
--     passaram: [1000, 0, 0, 0, 0, 0, 0, 0]
--
-- Mil leads em "Novos Leads" e zero em todo o resto — um funil que despenca,
-- plausível para quem não sabe, e completamente falso.
--
-- O aviso de truncagem que existia para justamente isso **não disparou**: ele
-- comparava o que chegou com o MEU teto de 50 mil, e mil é menor que 50 mil.
-- Ou seja, a defesa foi escrita contra o limite errado.
--
-- Não apareceu antes porque a base de teste tinha 5 eventos. Apareceu quando
-- ela passou a ter 4.900 — e a Lotus, com 817 hoje, cruzaria essa linha
-- sozinha em algumas semanas, sem nada na tela mudando de cor.
--
-- ============================================================
-- POR QUE NO BANCO, E NÃO PAGINANDO
-- ============================================================
--
-- Paginar resolveria o teto e manteria o resto: trazer 50 mil linhas pela
-- rede para contar 8 números. A pergunta é um `group by` — ela pertence ao
-- banco, e ali não há teto de linha nenhum porque o que volta são 8 linhas.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.funil_passaram_por_etapa(
  p_tenant_id uuid,
  p_de timestamptz DEFAULT NULL,
  p_ate timestamptz DEFAULT NULL
)
RETURNS TABLE (etapa text, passaram bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- `lead_events` está com RLS ligada e SEM policy: ninguém lê pelo navegador,
  -- de propósito. Esta função é a porta, e ela confere a filiação antes —
  -- `auth.uid() IS NULL` é o servidor, que já se autenticou por fora.
  SELECT e.para AS etapa, count(DISTINCT e.lead_id) AS passaram
    FROM public.lead_events e
   WHERE e.tenant_id = p_tenant_id
     AND e.event_type = 'lead.stage_changed'
     AND e.para IS NOT NULL
     AND (p_de  IS NULL OR e.created_at >= p_de)
     AND (p_ate IS NULL OR e.created_at <= p_ate)
     AND (
       auth.uid() IS NULL
       OR public.is_platform_owner()
       OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
     )
   GROUP BY e.para;
$function$;

COMMENT ON FUNCTION public.funil_passaram_por_etapa(uuid, timestamptz, timestamptz) IS
  'Quantos leads DISTINTOS passaram por cada etapa. Conta no banco porque o PostgREST corta a resposta em mil linhas sem avisar — contar no JavaScript dava [1000,0,0,0,...] em 24/09.';

-- ------------------------------------------------------------
-- Quando o registro de etapa começa. A tela escreve esta data ao lado dos
-- números, e sem ela "162 passaram" ao lado de "969 agora" parece perda.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.funil_inicio_do_historico(
  p_tenant_id uuid,
  p_de timestamptz DEFAULT NULL,
  p_ate timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT min(e.created_at)
    FROM public.lead_events e
   WHERE e.tenant_id = p_tenant_id
     AND e.event_type = 'lead.stage_changed'
     AND e.para IS NOT NULL
     AND (p_de  IS NULL OR e.created_at >= p_de)
     AND (p_ate IS NULL OR e.created_at <= p_ate)
     AND (
       auth.uid() IS NULL
       OR public.is_platform_owner()
       OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
     );
$function$;

REVOKE ALL ON FUNCTION public.funil_passaram_por_etapa(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.funil_inicio_do_historico(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_passaram_por_etapa(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.funil_inicio_do_historico(uuid, timestamptz, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
