-- Migration: telefones extras do proprietário em imoveis_locais
-- Data: 2026-09-04
-- Motivo: o formulário de novo imóvel já pede telefone residencial e comercial
-- do proprietário, mas só havia coluna para um telefone — os outros dois eram
-- digitados e descartados no salvamento.

ALTER TABLE imoveis_locais
  ADD COLUMN IF NOT EXISTS proprietario_tel_residencial TEXT,
  ADD COLUMN IF NOT EXISTS proprietario_tel_comercial TEXT;

-- Planilha de Clientes Proprietários lê por tenant filtrando quem tem dono.
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_proprietario
  ON imoveis_locais(tenant_id, proprietario_nome)
  WHERE proprietario_nome IS NOT NULL;
