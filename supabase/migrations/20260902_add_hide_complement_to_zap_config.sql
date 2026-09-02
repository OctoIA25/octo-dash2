-- Oculta o complemento do endereço (ex.: "apto 12, bloco B") no feed VRSync
-- enviado aos portais. Flag por tenant, editável SOMENTE pelo owner da plataforma
-- (gate em server/zap/routes.js). Default false = comportamento atual (envia).
ALTER TABLE public.tenant_zap_config
  ADD COLUMN IF NOT EXISTS hide_complement boolean NOT NULL DEFAULT false;
