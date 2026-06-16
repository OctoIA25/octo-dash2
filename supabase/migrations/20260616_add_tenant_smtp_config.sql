-- ============================================================
-- MIGRATION: SMTP por tenant (envio de recomendações com remetente próprio)
--
-- Segurança da senha SMTP:
--   - Dados NÃO-secretos (host, porta, usuário, remetente) ficam em
--     tenant_recommendation_config — legíveis pelos membros do tenant (para
--     exibir a config na tela).
--   - A SENHA fica em tenant_email_secrets, CIFRADA (AES-256-GCM, chave no
--     servidor) e numa tabela com RLS SEM POLICIES: apenas o service_role
--     (servidor Express) consegue ler/gravar. O frontend nunca acessa a senha.
-- ============================================================

-- 1) Colunas SMTP não-secretas
ALTER TABLE public.tenant_recommendation_config
  ADD COLUMN IF NOT EXISTS smtp_host TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port INTEGER,
  ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_user TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from TEXT;

COMMENT ON COLUMN public.tenant_recommendation_config.smtp_from
  IS 'Remetente (From) dos e-mails deste tenant; no Gmail deve casar com smtp_user';

-- 2) Tabela isolada para o segredo (senha cifrada)
CREATE TABLE IF NOT EXISTS public.tenant_email_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Payload cifrado (AES-256-GCM): "iv:authTag:ciphertext" em base64.
  smtp_pass_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS habilitado e SEM POLICIES: nenhum usuário (anon/authenticated) lê ou
-- escreve. Só o service_role (que ignora RLS) acessa — ou seja, só o servidor.
ALTER TABLE public.tenant_email_secrets ENABLE ROW LEVEL SECURITY;

-- Defesa extra: revoga qualquer privilégio direto dos roles do PostgREST.
REVOKE ALL ON public.tenant_email_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_tenant_email_secrets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_email_secrets_updated_at ON public.tenant_email_secrets;
CREATE TRIGGER trg_tenant_email_secrets_updated_at
  BEFORE UPDATE ON public.tenant_email_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_email_secrets_updated_at();

COMMENT ON TABLE public.tenant_email_secrets
  IS 'Senha SMTP por tenant, cifrada (AES-256-GCM). Acessível apenas pelo service_role (servidor).';
