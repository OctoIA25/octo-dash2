-- Migration: Criar tabela google_calendar_tokens
-- Armazena tokens OAuth do Google Calendar por usuário/tenant

CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint para garantir um token por usuário/tenant
  CONSTRAINT google_calendar_tokens_user_tenant_unique UNIQUE (user_id, tenant_id)
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_user_id ON google_calendar_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_tenant_id ON google_calendar_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_expires_at ON google_calendar_tokens(expires_at);

-- RLS (Row Level Security)
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários veem apenas seus próprios tokens
CREATE POLICY "Usuários veem apenas seus tokens"
  ON google_calendar_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Usuários criam tokens para si mesmos
CREATE POLICY "Usuários criam tokens para si mesmos"
  ON google_calendar_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Usuários atualizam apenas seus tokens
CREATE POLICY "Usuários atualizam apenas seus tokens"
  ON google_calendar_tokens
  FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: Usuários deletam apenas seus tokens
CREATE POLICY "Usuários deletam apenas seus tokens"
  ON google_calendar_tokens
  FOR DELETE
  USING (user_id = auth.uid());

-- Adicionar coluna google_event_id na tabela agenda_eventos
ALTER TABLE agenda_eventos 
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_synced BOOLEAN DEFAULT FALSE;

-- Índice para buscar eventos por google_event_id
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_google_event_id 
  ON agenda_eventos(google_event_id) 
  WHERE google_event_id IS NOT NULL;

-- Comentários
COMMENT ON TABLE google_calendar_tokens IS 'Armazena tokens OAuth do Google Calendar por usuário/tenant';
COMMENT ON COLUMN google_calendar_tokens.access_token IS 'Token de acesso temporário';
COMMENT ON COLUMN google_calendar_tokens.refresh_token IS 'Token para renovar access_token';
COMMENT ON COLUMN google_calendar_tokens.expires_at IS 'Data/hora de expiração do access_token';
COMMENT ON COLUMN agenda_eventos.google_event_id IS 'ID do evento no Google Calendar';
COMMENT ON COLUMN agenda_eventos.google_calendar_synced IS 'Indica se evento está sincronizado com Google Calendar';
