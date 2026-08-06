/**
 * Regressão estrutural do lead.created em lead REVIVIDO (cliente que volta pelo
 * mesmo telefone → UPDATE, não INSERT). O trigger roda no Postgres, fora do
 * alcance do vitest; estes asserts travam os invariantes antes do deploy —
 * mesmo padrão source-scan de whatsapp/ensureConversationMigration.test.js.
 *
 * O assert mais importante é o último: o trigger reconhece o revive PELO
 * created_at reescrito. Se alguém tirar `created_at: now` de insertOrReviveLead,
 * o WHEN nunca é verdade e o revive volta a ser silencioso — sem erro nenhum.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, rel), 'utf8');

const sql = read('../supabase/migrations/20260805_enqueue_lead_revived_webhook.sql');
const server = read('./proxy-production.js');

describe('migração enqueue_lead_revived_webhook', () => {
  it('mantém a função com SECURITY DEFINER e search_path fixo', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enqueue_lead_created_webhook()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('varia o source_id no revive e mantém o id puro no INSERT', () => {
    // Sem isso o índice único (event_type, source_table, source_id) engoliria
    // todo revive: o lead já teve um lead.created na criação original.
    expect(sql).toMatch(/WHEN TG_OP = 'UPDATE'[\s\S]*?NEW\.id::text \|\| ':' \|\| \(EXTRACT\(EPOCH FROM NEW\.created_at\) \* 1000\)::bigint::text/);
    expect(sql).toMatch(/ELSE NEW\.id::text/);
    expect(sql).toContain('ON CONFLICT (event_type, source_table, source_id) DO NOTHING');
  });

  it('mantém o id do lead no payload (a Lia não vê o source_id composto)', () => {
    expect(sql).toMatch(/'id',\s+NEW\.id::text/);
  });

  it('dispara AFTER UPDATE em leads só quando created_at é reescrito e é recente', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER tr_enqueue_lead_revived_webhook\s+AFTER UPDATE ON public\.leads\s+FOR EACH ROW\s+WHEN \(NEW\.created_at IS DISTINCT FROM OLD\.created_at/,
    );
    // Freio contra escrita em massa que restaure created_at antigo.
    expect(sql).toMatch(/NEW\.created_at >= now\(\) - interval '5 minutes'/);
    expect(sql).toContain('DROP TRIGGER IF EXISTS tr_enqueue_lead_revived_webhook ON public.leads');
  });

  it('anexa o link da conversa no revive (BEFORE, antes do AFTER que enfileira)', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER tr_ensure_whatsapp_conversation_revived\s+BEFORE UPDATE ON public\.leads\s+FOR EACH ROW\s+WHEN \(NEW\.created_at IS DISTINCT FROM OLD\.created_at/,
    );
    expect(sql).toContain('EXECUTE FUNCTION public.ensure_whatsapp_conversation_for_lead()');
  });

  it('não toca em kenlo_leads (não existe revive no engine de sync)', () => {
    expect(sql).not.toMatch(/CREATE TRIGGER[\s\S]*?ON public\.kenlo_leads/);
  });

  it('insertOrReviveLead continua reescrevendo created_at — é o sinal do trigger', () => {
    const body = server.slice(
      server.indexOf('const insertOrReviveLead'),
      server.indexOf('const insertOrReviveLead') + 1500,
    );
    expect(body).toMatch(/\.update\(\{[^}]*created_at: now/);
    expect(body).toContain("from('leads')");
  });
});
