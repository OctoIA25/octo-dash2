-- ============================================================
-- Porta aberta: a chave da API estava legível por qualquer membro
--
-- ACHADO EM 22/09/2026, ao levantar o P4.7. A `tenant_api_keys` guarda duas
-- coisas, as duas em texto puro:
--
--   provider='crm'    — a chave que AUTENTICA a API interna (/api/v1/*).
--                       Quem a tem fala com o servidor como a imobiliária
--                       inteira, por fora de qualquer tela e de qualquer
--                       verificação de cargo.
--   provider='openai' — a chave da OpenAI da casa, que gasta dinheiro de verdade.
--
-- E a política de leitura era "é membro deste tenant". Ou seja: o corretor,
-- que é o perfil mais baixo do sistema, lia as duas com o login normal dele.
-- Provado no banco local com a conta de uma corretora antes de escrever isto.
--
-- Em produção, no dia do achado: 7 chaves `crm` em 5 imobiliárias e 1 chave
-- OpenAI de 164 caracteres.
--
-- Duas coisas erradas, e as duas são consertadas aqui:
--
--   1. A política deixava QUALQUER MEMBRO ler. Passa a ser admin ou dono.
--   2. O `pg_default_acl` desta base dá tudo ao `anon` em toda relação nova, e
--      esta tabela nunca teve REVOKE. Hoje o anônimo é barrado só pela política
--      (o `auth.uid()` dele é nulo). Uma política mal escrita amanhã e a chave
--      sai pela API pública. A permissão é retirada de verdade.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tirar a permissão que ninguém concedeu
-- ------------------------------------------------------------
REVOKE ALL ON public.tenant_api_keys FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_api_keys TO authenticated;
GRANT ALL ON public.tenant_api_keys TO service_role;

-- ------------------------------------------------------------
-- 2. Só admin e dono
--
-- O servidor não passa por aqui: ele lê como `service_role`, que a RLS não
-- alcança. Então apertar isto não quebra a autenticação da API — só fecha a
-- leitura pelo navegador.
-- ------------------------------------------------------------
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_api_keys_select ON public.tenant_api_keys;
DROP POLICY IF EXISTS tenant_api_keys_insert ON public.tenant_api_keys;
DROP POLICY IF EXISTS tenant_api_keys_update ON public.tenant_api_keys;
DROP POLICY IF EXISTS tenant_api_keys_delete ON public.tenant_api_keys;
-- A do dono da plataforma comparava e-mail dentro da política. Fica a função,
-- que é a mesma que o resto do sistema usa.
DROP POLICY IF EXISTS tenant_api_keys_owner_bypass ON public.tenant_api_keys;

CREATE POLICY tenant_api_keys_admin_le ON public.tenant_api_keys
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin_or_owner(tenant_id));

CREATE POLICY tenant_api_keys_admin_cria ON public.tenant_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin_or_owner(tenant_id));

CREATE POLICY tenant_api_keys_admin_altera ON public.tenant_api_keys
  FOR UPDATE TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin_or_owner(tenant_id));

CREATE POLICY tenant_api_keys_admin_apaga ON public.tenant_api_keys
  FOR DELETE TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin_or_owner(tenant_id));

COMMENT ON TABLE public.tenant_api_keys IS
  'Chaves de API do tenant. provider=crm autentica a API interna; provider=openai gasta dinheiro. '
  'Leitura restrita a admin e dono desde 22/09/2026 — antes disso qualquer membro lia em texto puro.';

NOTIFY pgrst, 'reload schema';

COMMIT;
