-- Verificação da migration 20260624_create_platform_owners.sql
-- Rodar no SQL Editor do Supabase. NÃO altera dados (só checa estado).

-- 1) A função existe e está como SECURITY DEFINER com search_path fixo?
SELECT
  p.proname,
  p.prosecdef                              AS security_definer,   -- esperado: true
  pg_get_function_identity_arguments(p.oid) AS args,
  p.proconfig                              AS config              -- esperado: {search_path=public}
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_platform_owner';

-- 2) A tabela existe, com RLS ligado?
SELECT relname, relrowsecurity AS rls_on   -- esperado: rls_on = true
FROM pg_class
WHERE relname = 'platform_owners' AND relnamespace = 'public'::regnamespace;

-- 3) Quais owners estão cadastrados? (esperado: os 2 emails do seed)
SELECT email, note, created_at FROM public.platform_owners ORDER BY created_at;

-- 4) Policies da platform_owners — esperado: SÓ uma policy de SELECT, nenhuma de
--    INSERT/UPDATE/DELETE para authenticated/anon.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'platform_owners';

-- 5) Teste funcional do reconhecimento de owner.
--    Substitua o email abaixo para simular o JWT de cada usuário.
--    OBS: auth.jwt() só resolve dentro de uma sessão autenticada real; este SELECT
--    testa a LÓGICA da tabela (a parte que a função consulta).
SELECT
  EXISTS (SELECT 1 FROM public.platform_owners
          WHERE email = lower('yasminroque@dinamoaceleradora.com.br')) AS yasmin_eh_owner,   -- true
  EXISTS (SELECT 1 FROM public.platform_owners
          WHERE email = lower('octo.inteligenciaimobiliaria@gmail.com')) AS octo_eh_owner,    -- true
  EXISTS (SELECT 1 FROM public.platform_owners
          WHERE email = lower('corretor.qualquer@imobiliaria.com')) AS corretor_eh_owner;     -- false

-- 6) (Opcional) Confirmar que escrita pela API pública está bloqueada:
--    rode este INSERT no SQL Editor COM a role 'authenticated' simulada — deve FALHAR
--    por RLS. Via service_role (padrão do SQL Editor) ele PASSA — isso é esperado,
--    pois o SQL Editor usa privilégios elevados. O bloqueio vale pra anon/authenticated
--    via PostgREST, que é o vetor real.
-- SET LOCAL role authenticated;
-- INSERT INTO public.platform_owners(email) VALUES ('atacante@evil.com');  -- deve dar erro de RLS
