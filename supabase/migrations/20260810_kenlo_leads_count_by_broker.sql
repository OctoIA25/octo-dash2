-- =============================================================================
-- Contagem de leads agrupada por corretor, em UMA query.
--
-- GET /api/v1/brokers precisa do total de leads de cada corretor. As alternativas
-- pelo PostgREST não servem:
--  * baixar as linhas e contar no Node → o teto de 1000 linhas corta em silêncio
--    (é o bug que estamos consertando);
--  * uma COUNT por corretor → 51 round-trips. Medido com o índice já criado:
--    ~264ms cada, ~2,8s a rota inteira num tenant com 71.626 leads. Índice nenhum
--    conserta o número de idas ao banco.
--  * select=attended_by_name,count() → o projeto tem agregação desabilitada
--    (PGRST123).
--
-- Daí a função: um GROUP BY devolve ~50 linhas e o casamento corretor↔lead
-- (por attended_by_id ou pelo nome) fica em server/brokerLeadStats.js, onde é
-- testável.
--
-- STABLE + SECURITY INVOKER (padrão): a função não escreve nada e respeita o RLS
-- de quem chamar. O servidor usa service_role, que já bypassa RLS — o escopo por
-- tenant é o parâmetro, obrigatório.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.kenlo_leads_count_by_broker(p_tenant_id uuid)
RETURNS TABLE (attended_by_id uuid, attended_by_name text, total bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kl.attended_by_id,
    kl.attended_by_name,
    count(*) AS total
  FROM public.kenlo_leads kl
  WHERE kl.tenant_id = p_tenant_id
  GROUP BY kl.attended_by_id, kl.attended_by_name;
$$;

COMMENT ON FUNCTION public.kenlo_leads_count_by_broker(uuid) IS
  'Total de leads por corretor (attended_by_id/attended_by_name) de um tenant. Usada por GET /api/v1/brokers.';

-- Só o servidor chama esta função, e ele usa service_role.
--
-- Por padrão o PostgREST expõe a função a PUBLIC, o que deixa a chave anon — que
-- vai dentro do bundle do frontend, ou seja, é pública — invocá-la. Conferido: não
-- vaza dado, porque SECURITY INVOKER + RLS de kenlo_leads filtram tudo. Mas a
-- chamada EXECUTA: cada uma faz o Postgres tentar um GROUP BY sobre as linhas do
-- tenant até bater o statement timeout (57014). Em laço, é CPU do banco de graça
-- para qualquer um.
REVOKE EXECUTE ON FUNCTION public.kenlo_leads_count_by_broker(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kenlo_leads_count_by_broker(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.kenlo_leads_count_by_broker(uuid) TO service_role;
