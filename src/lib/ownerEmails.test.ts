import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * O módulo resolve a lista de owners UMA vez no import, a partir de
 * import.meta.env. Para testar os ramos da env var, manipulamos o stub e
 * re-importamos o módulo com vi.resetModules() + import dinâmico.
 */
async function loadModule() {
  vi.resetModules();
  return import('./ownerEmails');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('isOwnerEmail — lista padrão (sem VITE_OWNER_EMAILS)', () => {
  it('reconhece os owners padrão', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', '');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail('octo.inteligenciaimobiliaria@gmail.com')).toBe(true);
    expect(isOwnerEmail('yasminroque@dinamoaceleradora.com.br')).toBe(true);
  });

  it('é case-insensitive e ignora espaços', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', '');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail('  YasminRoque@DinamoAceleradora.com.br  ')).toBe(true);
    expect(isOwnerEmail('OCTO.inteligenciaimobiliaria@GMAIL.com')).toBe(true);
  });

  it('retorna false para não-owners', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', '');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail('corretor@imobiliaria.com')).toBe(false);
  });

  it('é seguro contra null/undefined/string vazia', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', '');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail('')).toBe(false);
    expect(isOwnerEmail('   ')).toBe(false);
    expect(isOwnerEmail('semarroba')).toBe(false);
    expect(isOwnerEmail('@')).toBe(false);
  });
});

describe('isOwnerEmail — VITE_OWNER_EMAILS configurada', () => {
  it('substitui a lista padrão pelos emails da env var', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', 'novo@owner.com, outro@owner.com');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail('novo@owner.com')).toBe(true);
    expect(isOwnerEmail('outro@owner.com')).toBe(true);
    // Os defaults NÃO são mais owners quando a env var é fornecida.
    expect(isOwnerEmail('octo.inteligenciaimobiliaria@gmail.com')).toBe(false);
  });

  it('normaliza e descarta entradas inválidas da env var', async () => {
    vi.stubEnv('VITE_OWNER_EMAILS', '  VALID@owner.com , , lixo , ');
    const { isOwnerEmail } = await loadModule();
    expect(isOwnerEmail('valid@owner.com')).toBe(true);
    // "lixo" (sem @) e entradas vazias são descartadas; não viram owner.
    expect(isOwnerEmail('lixo')).toBe(false);
    expect(isOwnerEmail('')).toBe(false);
  });

  it('cai na lista padrão quando a env var não tem nenhum item válido', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_OWNER_EMAILS', ' , , lixo ');
    const { isOwnerEmail } = await loadModule();
    // Sem item válido → volta à default (nunca lista vazia, nunca "todos owner").
    expect(isOwnerEmail('octo.inteligenciaimobiliaria@gmail.com')).toBe(true);
    expect(isOwnerEmail('lixo')).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
