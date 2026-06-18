/**
 * Teste de regressão (C6 — edge function xml-create-broker-access sem auth).
 *
 * É uma função Deno (não importável/executável no vitest Node), então validamos o
 * invariante a nível de código-fonte: a autorização (validar JWT do caller + exigir
 * owner/admin do tenant alvo) DEVE existir e ocorrer ANTES de qualquer escrita
 * (createUser / upsert de membership / brokers). Sem isso, volta o furo cross-tenant.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '../../supabase/functions/xml-create-broker-access/index.ts'),
  'utf8',
);

describe('C6 — xml-create-broker-access exige autorização do caller', () => {
  it('valida o JWT do caller (auth.getUser do token Bearer)', () => {
    expect(src.includes('supabase.auth.getUser(token)')).toBe(true);
    expect(src.includes('Bearer ')).toBe(true);
    expect(src.includes('401')).toBe(true);
  });

  it('exige owner da plataforma OU admin/owner do tenant alvo (403 caso contrário)', () => {
    expect(src.includes('PLATFORM_OWNER_EMAIL')).toBe(true);
    expect(src.includes("from(\"tenant_memberships\")")).toBe(true);
    expect(src.includes('.eq("user_id", caller.id)')).toBe(true);
    expect(src.includes('.in("role", ["admin", "owner"])')).toBe(true);
    expect(src.includes('403')).toBe(true);
  });

  it('a autorização ocorre ANTES das escritas (createUser / upsert)', () => {
    const authIdx = src.indexOf('supabase.auth.getUser(token)');
    const createUserIdx = src.indexOf('auth.admin.createUser');
    const membershipUpsertIdx = src.indexOf('onConflict: "tenant_id,user_id"');
    expect(authIdx).toBeGreaterThan(-1);
    expect(createUserIdx).toBeGreaterThan(authIdx);
    expect(membershipUpsertIdx).toBeGreaterThan(authIdx);
  });
});
