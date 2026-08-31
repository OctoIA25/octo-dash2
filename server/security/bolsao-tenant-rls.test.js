/**
 * Teste de regressão (NEW-1 — bolsao cross-tenant).
 *
 * Migração não-executável aqui (precisa do Postgres). Valida os invariantes do
 * SQL que habilita RLS e isola o pool de leads por tenant:
 *  - ENABLE ROW LEVEL SECURITY em bolsao;
 *  - policies POR COMANDO (SELECT/INSERT/UPDATE/DELETE), nenhuma FOR ALL;
 *  - isolamento por tenant_memberships + is_platform_owner;
 *  - sem USING(true); restrito a `authenticated`.
 *
 * NOTA: o estado real de RLS em produção precisa de verificação no banco
 * (ver cabeçalho da migration). Este teste garante que a MIGRATION está correta.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260824_bolsao_enable_rls.sql'),
  'utf8',
);

const policySql = sql.slice(sql.indexOf('ALTER TABLE public.bolsao ENABLE')).replace(/--[^\n]*/g, '');

describe('NEW-1 — bolsao: RLS com isolamento por tenant', () => {
  it('habilita RLS em bolsao', () => {
    expect(policySql.includes('ALTER TABLE public.bolsao ENABLE ROW LEVEL SECURITY')).toBe(true);
  });

  it('cria policies por comando SELECT/INSERT/UPDATE/DELETE', () => {
    expect(/CREATE POLICY[\s\S]*?FOR SELECT/i.test(policySql)).toBe(true);
    expect(/CREATE POLICY[\s\S]*?FOR INSERT/i.test(policySql)).toBe(true);
    expect(/CREATE POLICY[\s\S]*?FOR UPDATE/i.test(policySql)).toBe(true);
    expect(/CREATE POLICY[\s\S]*?FOR DELETE/i.test(policySql)).toBe(true);
  });

  it('NÃO usa FOR ALL nem USING(true)', () => {
    expect(/CREATE POLICY[\s\S]*?FOR ALL/i.test(policySql)).toBe(false);
    expect(policySql.toLowerCase().includes('using (true)')).toBe(false);
  });

  it('isola por tenant_memberships + is_platform_owner', () => {
    expect(policySql.includes('FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()')).toBe(true);
    expect(policySql.includes('is_platform_owner()')).toBe(true);
  });

  it('restringe a authenticated', () => {
    expect(policySql.includes('TO authenticated')).toBe(true);
  });
});
