/**
 * Regressão estrutural da migração do Meta Lead Ads. As tabelas vivem no
 * Postgres (fora do vitest); estes asserts travam o que, se sumir, só aparece
 * como bug em produção.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../../supabase/migrations/20260806_create_meta_leadgen.sql'),
  'utf8',
);

describe('migração meta lead ads', () => {
  it('cria as duas tabelas', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tenant_meta_leadgen_config/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.meta_leadgen_events/);
  });

  it('leadgen_id é UNIQUE — é a idempotência contra reentrega da Meta', () => {
    expect(sql).toMatch(/leadgen_id\s+text\s+NOT NULL UNIQUE/);
  });

  it('webhook_token é UNIQUE com DEFAULT do banco — é o identificador do tenant no path, nunca muda', () => {
    expect(sql).toMatch(/webhook_token\s+text\s+NOT NULL UNIQUE\s+DEFAULT\s+replace\(gen_random_uuid/);
  });

  it('verify_token tem DEFAULT do banco — elimina corrida de dois saves concorrentes', () => {
    expect(sql).toMatch(/verify_token\s+text\s+NOT NULL\s+DEFAULT\s+replace\(gen_random_uuid/);
  });

  it('guarda os segredos apenas cifrados (sem coluna plaintext)', () => {
    expect(sql).toMatch(/app_secret_encrypted/);
    expect(sql).toMatch(/system_user_token_encrypted/);
    expect(sql).not.toMatch(/app_secret\s+text/);
    expect(sql).not.toMatch(/system_user_token\s+text/);
  });

  it('nasce inactive — ativar é ação explícita do admin', () => {
    expect(sql).toMatch(/status\s+text NOT NULL DEFAULT 'inactive'/);
  });

  it('NÃO entra na exclusividade de CRM — Meta é fonte, não CRM', () => {
    expect(sql).not.toMatch(/CREATE\s+TRIGGER[\s\S]*deactivate_other_crm_provider/i);
    expect(sql).not.toMatch(/EXECUTE\s+FUNCTION\s+public\.deactivate_other_crm_provider/i);
  });

  it('liga RLS sem policies nas duas tabelas (só service_role acessa)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.tenant_meta_leadgen_config ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.meta_leadgen_events ENABLE ROW LEVEL SECURITY/);
  });

  it('indexa a varredura de eventos pendentes', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_pending/);
  });
});
