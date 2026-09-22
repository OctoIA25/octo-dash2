-- ============================================================
-- Porta aberta: a lista de gente da plataforma inteira
--
-- ACHADO NA AUDITORIA DE 16/09 e reconferido em produção em 22/09, com o
-- número pior: a view `user_profiles` devolve os 126 usuários da plataforma —
-- nome, e-mail e telefone — para QUALQUER pessoa autenticada.
--
-- Simulado em produção com um corretor de verdade: ele tem 20 colegas na
-- imobiliária dele, e leu o e-mail de 126 pessoas. Ou seja, a lista de
-- funcionários das imobiliárias CONCORRENTES.
--
-- Por que passou despercebido: a view lê `auth.users`, que o `authenticated`
-- não alcança direto. Como ela não declara `security_invoker`, roda com os
-- poderes de quem a criou — e nesse caminho a RLS de ninguém se aplica. Uma
-- view assim é um furo sem policy para consertar: o conserto é a própria
-- consulta.
--
-- O QUE NÃO FOI FEITO, de propósito: revogar. Seis telas leem esta view —
-- roleta, times, Central de Leads, recrutamento, vendas — e todas buscam gente
-- da PRÓPRIA casa. Tirar o acesso quebraria as seis para consertar um vazamento
-- que se resolve com um filtro.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.user_profiles AS
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data ->> 'name'       AS full_name,
    u.raw_user_meta_data ->> 'phone'      AS phone,
    u.raw_user_meta_data ->> 'avatar_url' AS avatar_url,
    u.raw_user_meta_data ->> 'role'       AS role,
    u.raw_user_meta_data ->> 'tenant_id'  AS tenant_id
  FROM auth.users u
  WHERE
    -- O SERVIDOR. Ele lê como `service_role`, sem usuário no token, e precisa
    -- da lista inteira para sincronizações e relatórios. Mesma porta que o
    -- resto do sistema já usa.
    auth.uid() IS NULL

    -- O DONO DA PLATAFORMA, que entra nas imobiliárias por impersonação.
    OR public.is_platform_owner()

    -- EU MESMO. Vale para quem ainda não tem vínculo nenhum — sem isto, um
    -- usuário recém-criado não conseguiria ver o próprio perfil.
    OR u.id = auth.uid()

    -- E QUEM DIVIDE IMOBILIÁRIA COMIGO. Uma subconsulta só, resolvida de uma
    -- vez: um EXISTS por linha custaria uma varredura por usuário da base.
    OR u.id IN (
      SELECT colega.user_id
        FROM tenant_memberships eu
        JOIN tenant_memberships colega ON colega.tenant_id = eu.tenant_id
       WHERE eu.user_id = auth.uid()
    );

-- O `pg_default_acl` desta base dá tudo ao anônimo em toda relação nova, e a
-- view herdou escrita que nunca serviu para nada: ninguém grava em `auth.users`
-- por aqui. Sai por higiene — permissão que existe sem uso é permissão que um
-- dia alguém descobre.
REVOKE ALL ON public.user_profiles FROM anon;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO service_role;

COMMENT ON VIEW public.user_profiles IS
  'Perfis vindos de auth.users. Desde 22/09/2026 mostra apenas quem divide imobiliária com quem consulta — antes disso devolvia a plataforma inteira para qualquer pessoa autenticada.';

NOTIFY pgrst, 'reload schema';

COMMIT;
