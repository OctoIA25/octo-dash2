-- ============================================================
-- O site da Lotus voltou a mostrar os corretores
--
-- INCIDENTE. Em 22/09 subimos `20260922_user_profiles_so_colegas.sql`, que
-- fechou um buraco real: a view `user_profiles` entregava o e-mail dos 123
-- usuários a qualquer pessoa logada, e ainda aceitava DELETE. A linha 75
-- daquela migração é `REVOKE ALL ON public.user_profiles FROM anon`.
--
-- O que ninguém viu: **o site público da Lotus lia essa view.** Não
-- diretamente — pela `portal_brokers`, que é `security_invoker = true` e faz
-- JOIN com ela. Com o REVOKE, o site passou a receber
-- `permission denied for view user_profiles`, e a lista de corretores sumiu.
--
-- Foi o chefe que percebeu, dias depois. Nenhum alarme disparou: o site não
-- monitora, e o Dash não tem como saber que o portal quebrou.
--
-- ============================================================
-- POR QUE NÃO BASTA DEVOLVER A PERMISSÃO
-- ============================================================
--
-- A saída óbvia seria `GRANT SELECT ON user_profiles TO anon`. Ela reabriria o
-- buraco inteiro, e de um jeito pior que antes.
--
-- A view tem esta primeira condição:
--
--     WHERE auth.uid() IS NULL OR is_platform_owner() OR ...
--
-- `auth.uid() IS NULL` existe para o SERVIDOR, que fala com o banco sem JWT.
-- Mas o visitante anônimo do site TAMBÉM tem `auth.uid()` nulo. Devolver o
-- GRANT ao `anon` entregaria a view inteira — **e-mail e telefone de todos os
-- 123 usuários, sem login**. Seria trocar um vazamento para quem tem senha por
-- um vazamento para a internet.
--
-- ============================================================
-- A SAÍDA: O PORTAL PARA DE DEPENDER DELA
-- ============================================================
--
-- `portal_brokers` precisa de três coisas: nome, foto e CRECI. Não precisa de
-- e-mail, e nunca mostrou e-mail. Então ela passa a ler `auth.users`
-- diretamente, **sem passar pela view de perfis**, e a rodar com as permissões
-- do DONO — que é o normal de uma view curada de portal público, e o que as
-- irmãs dela (`portal_imoveis`, `portal_condominios`) já fazem.
--
-- O que isso expõe, e é o mesmo que o site sempre mostrou: id, nome, foto,
-- CRECI e a contagem de imóveis aprovados. **E-mail e telefone continuam fora**
-- — não estão na lista de colunas, e é por isso que este desenho é mais seguro
-- que o de antes, e não menos.
--
-- O recorte por imobiliária continua escrito na própria view, com o uuid da
-- Lotus. Rodando como dono, é ELE que segura a fronteira — então quem mexer
-- aqui um dia precisa saber: **tirar esse WHERE entrega os corretores de todas
-- as imobiliárias para a internet.**
--
-- As colunas saem com o mesmo nome e na mesma ordem de antes. O site é de
-- outra pessoa e lê isto hoje; renomear uma coluna aqui quebraria a tela dele
-- sem aviso, que foi exatamente o que aconteceu em 22/09.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.portal_brokers;

-- Sem `security_invoker`: roda com as permissões do dono, de propósito.
CREATE VIEW public.portal_brokers AS
SELECT
  m.user_id   AS id,
  m.tenant_id,
  u.raw_user_meta_data ->> 'name'       AS name,
  u.raw_user_meta_data ->> 'avatar_url' AS photo_url,
  m.creci,
  COALESCE((
    SELECT count(*)
      FROM public.imoveis_locais il
     WHERE il.tenant_id = m.tenant_id
       AND il.criado_por = m.user_id
       AND il.status_aprovacao = 'aprovado'
  ), 0::bigint) AS imoveis_ativos
FROM public.tenant_memberships m
JOIN auth.users u ON u.id = m.user_id
WHERE m.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid
  AND m.role = ANY (ARRAY['corretor'::text, 'team_leader'::text])
  -- Quem não tem nome não vira card: o site desenharia um retângulo vazio.
  AND COALESCE(btrim(u.raw_user_meta_data ->> 'name'), '') <> '';

COMMENT ON VIEW public.portal_brokers IS
  'Corretores da Lotus para o site público. Roda como dono e lê auth.users direto — NÃO passa por user_profiles, que é fechada ao anônimo desde 22/09. Expõe nome, foto e CRECI; nunca e-mail ou telefone. O WHERE do tenant é a fronteira: tirá-lo entrega todas as imobiliárias.';

-- `pg_default_acl` dá tudo ao `anon` em relação nova, e uma view recriada é
-- relação nova. Sem este REVOKE ela nasceria com INSERT/UPDATE/DELETE —
-- inofensivo hoje (o JOIN a torna não auto-atualizável), armado para amanhã.
REVOKE ALL ON public.portal_brokers FROM PUBLIC;
REVOKE ALL ON public.portal_brokers FROM anon;
REVOKE ALL ON public.portal_brokers FROM authenticated;
GRANT SELECT ON public.portal_brokers TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
