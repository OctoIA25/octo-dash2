/**
 * Teste de regressão (C5 — cluster de RLS: recruitment_*, tenant_source_images,
 * agent_conversations). Migrações não-executáveis aqui; validamos os invariantes SQL.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mig = (f) => readFileSync(join(__dirname, '../../supabase/migrations/', f), 'utf8');

const recruitment = mig('20260617_fix_recruitment_rls_and_functions.sql');
const sourceImages = mig('20260617_fix_tenant_source_images_rls.sql');
const agentConv = mig('20260617_fix_agent_conversations_insert_tenant_gate.sql');

// helper: corpo sem comentários SQL
const noComments = (s) => s.replace(/--[^\n]*/g, '');

describe('C5 — recruitment RLS + DEFINER functions', () => {
  const body = noComments(recruitment);
  it('elimina o predicado quebrado tenant_id = auth.uid()', () => {
    expect(body.includes('tenant_id = auth.uid()')).toBe(false);
  });
  it('isola candidates e stages por membership + owner', () => {
    expect(body.includes('tm.tenant_id = recruitment_candidates.tenant_id')).toBe(true);
    expect(body.includes('tm.tenant_id = recruitment_stages.tenant_id')).toBe(true);
    expect(body.includes("auth.jwt() ->> 'email'")).toBe(true);
  });
  it('endurece as funções DEFINER (search_path + guard de caller)', () => {
    expect((body.match(/SET search_path = public/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((body.match(/RAISE EXCEPTION 'forbidden/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(body.includes('tm.tenant_id = p_tenant_id')).toBe(true);
  });
});

describe('C5 — tenant_source_images RLS', () => {
  const body = noComments(sourceImages);
  it('não referencia mais a tabela inexistente users', () => {
    expect(/FROM users\b/.test(body)).toBe(false);
  });
  it('isola por tenant_memberships + owner, restrito a authenticated', () => {
    expect(body.includes('tm.tenant_id = tenant_source_images.tenant_id')).toBe(true);
    expect(body.includes('TO authenticated')).toBe(true);
    expect(body.includes('ENABLE ROW LEVEL SECURITY')).toBe(true);
  });
});

describe('C5 — agent_conversations INSERT gate', () => {
  const body = noComments(agentConv);
  it('restaura o gate de tenant (membership) mantendo owner', () => {
    expect(body.includes('user_id = auth.uid()')).toBe(true);
    expect(body.includes('tm.tenant_id = agent_conversations.tenant_id')).toBe(true);
    expect(body.includes("auth.jwt() ->> 'email'")).toBe(true);
  });
});
