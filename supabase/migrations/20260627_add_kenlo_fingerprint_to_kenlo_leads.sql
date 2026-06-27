-- Hash do subconjunto de campos vindos do Kenlo, gravado a cada sincronização.
-- Serve de gate de escrita: o sync só faz UPDATE de um lead existente quando o
-- fingerprint do payload difere do armazenado — evita UPDATE/trigger desnecessários
-- a cada ciclo (a cada 3 min) quando nada mudou no Kenlo. Ver server/kenlo/leadNormalizer.js (kenloFingerprint).
--
-- Aditivo e idempotente: rollback não exige DROP (coluna órfã é inerte). Leads
-- existentes ficam com NULL e recebem o fingerprint no primeiro ciclo após o deploy
-- (NULL != hash → um UPDATE de reconciliação por lead, uma única vez).
ALTER TABLE public.kenlo_leads
  ADD COLUMN IF NOT EXISTS kenlo_fingerprint TEXT;

COMMENT ON COLUMN public.kenlo_leads.kenlo_fingerprint IS 'Hash (sha256/16) dos campos sincronizados do Kenlo. Gate de escrita do sync incremental: UPDATE só ocorre quando o hash do payload difere do armazenado.';
