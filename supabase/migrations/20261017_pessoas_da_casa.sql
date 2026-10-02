-- ============================================================
-- Quem é GENTE na imobiliária, com o nome do cadastro
--
-- Pedido do Erick em 01/10: "precisa tirar a Lia e não identificado no
-- Ranking". O "Ranking da Equipe" do Início (e o de Relatórios que lê leads)
-- somava na TELA, pelo nome escrito no lead. Três defeitos de uma vez:
--
--   1. A Lia entrava: desde 17/09 ela é dona de todo lead novo da Lotus.
--   2. "Não atribuído" entrava: é o texto que a tela põe no lead sem dono.
--   3. A mesma pessoa aparecia várias vezes, uma por grafia: "FERNANDA SOUZA"
--      (251 leads) e "Fernanda Souza" (171); Gabriele em três, uma delas o
--      e-mail.
--
-- A tela não pode descobrir sozinha quem é a Lia: `usuario_assistente_ia`
-- roda com a permissão de quem chama, e o corretor não enxerga o cadastro
-- dela — para ele a função devolve nulo. A regra de quem é gente já existe
-- (`conta_de_pessoa`, 20261016); esta função só a entrega para a tela, junto
-- com o nome do cadastro, que vira o nome único da pessoa no ranking.
--
-- Devolve só id e nome — nada de e-mail nem permissão — e só para quem é da
-- casa (ou o dono da plataforma).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pessoas_da_casa(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tm.user_id,
         btrim(regexp_replace(COALESCE(NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
                                       split_part(u.email, '@', 1)), '\s+', ' ', 'g')) AS nome
    FROM public.tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id
     AND public.conta_de_pessoa(u.email, tm.permissions)
     AND (
       auth.uid() IS NULL
       OR public.is_platform_owner()
       OR EXISTS (SELECT 1 FROM public.tenant_memberships x
                   WHERE x.tenant_id = p_tenant_id AND x.user_id = auth.uid())
     );
$function$;

COMMENT ON FUNCTION public.pessoas_da_casa(uuid) IS
  'Membros que sao gente (conta_de_pessoa: sem Lia, conta de teste e dono da plataforma), com o nome do cadastro. Fonte do ranking por pessoa da tela.';

REVOKE ALL ON FUNCTION public.pessoas_da_casa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pessoas_da_casa(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
