-- Owner da plataforma configurável: troca o email hardcoded por uma tabela.
--
-- Contexto: até aqui, "quem é owner" (acesso cross-tenant via impersonation) era
-- o email 'octo.inteligenciaimobiliaria@gmail.com', hardcoded em ~29 migrations
-- (comparação inline com auth.jwt() ->> 'email') e dentro de
-- public.is_platform_owner(). Promover um novo owner só no frontend NÃO bastava:
-- o RLS do banco continuava reconhecendo apenas aquele email, então o owner novo
-- impersonava um tenant mas via zero linhas.
--
-- Esta migração:
--   1) cria public.platform_owners (fonte única de verdade no banco);
--   2) tranca a escrita da própria tabela (só service_role/SQL direto), pra que
--      nenhum usuário comum se autopromova a owner;
--   3) reescreve is_platform_owner() pra consultar a tabela. Os 3 arquivos que já
--      usam a função (whatsapp_*) passam a aceitar QUALQUER owner cadastrado, sem
--      alteração.
--
-- Escopo: as ~29 policies que comparam o email INLINE (não via função) NÃO são
-- alteradas aqui — ficam para fase incremental (ver relatório). Até lá, owner novo
-- só tem acesso pleno onde a policy usa is_platform_owner().
--
-- Idempotente. Aditiva (não dropa nada além de redefinir a função, via CREATE OR
-- REPLACE com a mesma assinatura).

-- ===== 1) Tabela =====
CREATE TABLE IF NOT EXISTS public.platform_owners (
  email      text PRIMARY KEY,
  user_id    uuid,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_owners IS
  'Owners da plataforma (acesso cross-tenant via impersonation). Escrita só via '
  'service_role/SQL direto — nunca pela API pública. Fonte de verdade de '
  'is_platform_owner().';

-- Normalização: garante email sempre em lowercase, mesmo se inserido errado.
CREATE OR REPLACE FUNCTION public.platform_owners_lowercase_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_owners_lowercase ON public.platform_owners;
CREATE TRIGGER trg_platform_owners_lowercase
  BEFORE INSERT OR UPDATE ON public.platform_owners
  FOR EACH ROW EXECUTE FUNCTION public.platform_owners_lowercase_email();

-- ===== 2) Seed (idempotente) =====
INSERT INTO public.platform_owners (email, note)
VALUES
  ('octo.inteligenciaimobiliaria@gmail.com', 'Owner original (Octo)'),
  ('yasminroque@dinamoaceleradora.com.br', 'Owner adicionado 2026-06-24')
ON CONFLICT (email) DO NOTHING;

-- ===== 3) Reescrever is_platform_owner() =====
-- DEFINIDA ANTES do RLS porque a policy de SELECT abaixo a referencia. Em ambientes
-- onde a função ainda não existe (migração do whatsapp não aplicada), criar a policy
-- antes quebraria. CREATE OR REPLACE cobre ambos os casos (nova ou já existente).
--
-- Mantém a assinatura () -> boolean. SECURITY DEFINER pra ler a tabela apesar do
-- RLS restritivo dela. search_path fixo (hardening contra table shadowing).
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_owners po
    WHERE po.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Não precisa de execução por anon.
REVOKE EXECUTE ON FUNCTION public.is_platform_owner() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

-- ===== 4) RLS da própria tabela (trancado) =====
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;

-- Limpa qualquer policy pré-existente (re-execução / criação fora do repo).
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_owners'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.platform_owners', pol.policyname);
  END LOOP;
END $$;

-- SELECT: apenas owners enxergam a lista de owners.
-- (Sem recursão: is_platform_owner() é SECURITY DEFINER e lê a tabela direto,
-- não reaplica o RLS de platform_owners.)
CREATE POLICY "platform_owners_select_owner_only"
  ON public.platform_owners
  FOR SELECT
  TO authenticated
  USING (public.is_platform_owner());

-- INSERT/UPDATE/DELETE: NENHUMA policy para authenticated/anon — a API pública não
-- escreve. Gestão de owners só via service_role (bypassa RLS) ou SQL direto.
-- Isto é deliberado: a tabela que define owners não pode ser gravável por usuário
-- comum, senão ele se autopromove.
