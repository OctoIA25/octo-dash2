/**
 * O que este teste protege: a troca de tenant precisa limpar o
 * `auth-state-cache` junto com a impersonation. Se só a impersonation mudar,
 * os ~29 componentes que usam `useAuth()` direto reidratam do cache e mostram
 * o tenant ANTERIOR até a sessão recarregar — bug silencioso e intermitente.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearImpersonatedTenant,
  enterTenant,
  exitTenant,
  fetchOwnerTenants,
  getImpersonatedTenantId,
  TEST_TENANT_ID,
} from './ownerTenantsService';

const tenantsRows = { current: [] as Array<Record<string, unknown>> };
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        is: () => ({ order: () => Promise.resolve({ data: tenantsRows.current, error: null }) }),
        order: () => Promise.resolve({ data: tenantsRows.current, error: null }),
      }),
    }),
  },
}));

const IMPERSONATION_KEY = 'owner-impersonation';
const AUTH_CACHE_KEY = 'auth-state-cache';

const reload = vi.fn();

beforeEach(() => {
  localStorage.clear();
  reload.mockClear();
  // jsdom não implementa reload(); substituímos por um spy.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
  });
});

/**
 * O tenant sintético tem id não-uuid: entrar nele faz o servidor estourar 22P02
 * (eNPS, KPIs, imóveis...). Ele só pode aparecer quando o banco não tem área de teste.
 */
describe('tenant sintético de teste', () => {
  it('não injeta o sintético quando já existe uma área de teste no banco', async () => {
    tenantsRows.current = [
      { id: 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', code: 'tenant-area-de-teste', name: 'Área de Teste', created_at: '2026-01-01' },
    ];
    const tenants = await fetchOwnerTenants();
    expect(tenants.map((t) => t.id)).not.toContain(TEST_TENANT_ID);
    expect(tenants).toHaveLength(1);
  });

  it('injeta o sintético quando o banco não tem nenhuma área de teste', async () => {
    tenantsRows.current = [{ id: '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f', code: 'JAPI', name: 'Imobiliaria Japi', created_at: '2026-01-01' }];
    const tenants = await fetchOwnerTenants();
    expect(tenants.map((t) => t.id)).toContain(TEST_TENANT_ID);
  });
});

describe('troca de tenant do owner', () => {
  it('enterTenant grava a impersonation, invalida o cache de auth e recarrega', () => {
    localStorage.setItem(AUTH_CACHE_KEY, '{"user":{"tenantId":"antigo"}}');

    enterTenant({ id: 'novo-id', code: 'NOVO', name: 'Nova Imobiliária' });

    expect(JSON.parse(localStorage.getItem(IMPERSONATION_KEY)!)).toEqual({
      tenantId: 'novo-id',
      tenantCode: 'NOVO',
      tenantName: 'Nova Imobiliária',
    });
    expect(localStorage.getItem(AUTH_CACHE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('exitTenant volta ao painel do owner', () => {
    localStorage.setItem(IMPERSONATION_KEY, '{"tenantId":"x"}');
    localStorage.setItem(AUTH_CACHE_KEY, '{}');

    exitTenant();

    expect(localStorage.getItem(IMPERSONATION_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_CACHE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clearImpersonatedTenant não recarrega', () => {
    localStorage.setItem(IMPERSONATION_KEY, '{"tenantId":"x"}');

    clearImpersonatedTenant();

    expect(localStorage.getItem(IMPERSONATION_KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('getImpersonatedTenantId devolve null sem impersonation e com JSON corrompido', () => {
    expect(getImpersonatedTenantId()).toBeNull();

    localStorage.setItem(IMPERSONATION_KEY, 'não é json');
    expect(getImpersonatedTenantId()).toBeNull();

    localStorage.setItem(IMPERSONATION_KEY, '{"tenantId":"abc"}');
    expect(getImpersonatedTenantId()).toBe('abc');
  });
});
