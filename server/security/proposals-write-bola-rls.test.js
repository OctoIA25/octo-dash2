/**
 * Teste de regressão (NEW-2 — proposals BOLA intra-tenant).
 *
 * Migração não-executável aqui (precisa do Postgres). Valida os invariantes
 * críticos do SQL da correção:
 *  - remove a policy FOR ALL "Tenant members can write proposals";
 *  - NÃO reintroduz nenhum FOR ALL na tabela proposals;
 *  - cria policies POR COMANDO (INSERT/UPDATE/DELETE) com escopo dono/gestor;
 *  - UPDATE tem USING e WITH CHECK (bloqueio de takeover);
 *  - restrito a `authenticated`.
 *
 * §44 da spec: detectar se um FOR ALL / SELECT permissivo volta a ampliar acesso.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260824_fix_proposals_write_bola.sql'),
  'utf8',
);

// Corpo sem comentários SQL (evita casar menções em comentário, ex.: o ROLLBACK).
const policySql = sql.slice(sql.indexOf('DROP POLICY')).replace(/--[^\n]*/g, '');

describe('NEW-2 — proposals: escrita por comando, sem FOR ALL', () => {
  it('remove a policy FOR ALL de escrita', () => {
    expect(policySql.includes('DROP POLICY IF EXISTS "Tenant members can write proposals" ON public.proposals')).toBe(true);
  });

  it('NÃO cria nenhuma policy FOR ALL em proposals (fora do bloco de rollback)', () => {
    expect(/CREATE POLICY[\s\S]*?FOR ALL/i.test(policySql)).toBe(false);
  });

  it('cria policies por comando INSERT, UPDATE e DELETE', () => {
    expect(/CREATE POLICY[\s\S]*?FOR INSERT/i.test(policySql)).toBe(true);
    expect(/CREATE POLICY[\s\S]*?FOR UPDATE/i.test(policySql)).toBe(true);
    expect(/CREATE POLICY[\s\S]*?FOR DELETE/i.test(policySql)).toBe(true);
  });

  it('escopa por dono (agent_user_id/created_by) OU gestor', () => {
    expect(policySql.includes('proposals_is_tenant_manager(tenant_id)')).toBe(true);
    expect(policySql.includes('agent_user_id = auth.uid()')).toBe(true);
    expect(policySql.includes('created_by = auth.uid()')).toBe(true);
  });

  it('mantém a âncora de tenant (proposals_can_access_tenant)', () => {
    expect(policySql.includes('proposals_can_access_tenant(tenant_id)')).toBe(true);
  });

  it('UPDATE tem USING e WITH CHECK (impede takeover no resultado)', () => {
    const update = policySql.slice(policySql.indexOf('FOR UPDATE'));
    expect(update.includes('USING')).toBe(true);
    expect(update.includes('WITH CHECK')).toBe(true);
  });

  it('restringe a authenticated', () => {
    expect(policySql.includes('TO authenticated')).toBe(true);
  });
});
