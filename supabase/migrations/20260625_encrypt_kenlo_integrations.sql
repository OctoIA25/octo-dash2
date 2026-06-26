-- Cifra em repouso das credenciais Kenlo (AES-256-GCM via app, chave EMAIL_ENCRYPTION_KEY).
-- As colunas planas (kenlo_password, auth_token) seguem existindo durante a transição:
-- o KenloAuthService faz migração preguiçosa (lê plano → regrava cifrado). Uma migration
-- posterior, após validação em produção, zera/remove as colunas planas.

ALTER TABLE public.kenlo_integrations
  ADD COLUMN IF NOT EXISTS kenlo_password_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS auth_token_encrypted TEXT;

-- Acelera a varredura de tenants ativos pelo scheduler.
CREATE INDEX IF NOT EXISTS idx_kenlo_integrations_status
  ON public.kenlo_integrations (status);
