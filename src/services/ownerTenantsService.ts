/**
 * Tenants do owner: listagem e troca de tenant (impersonation).
 *
 * `owner-impersonation` é lido DIRETO do localStorage por dezenas de arquivos
 * (hooks de leads, sidebar, supabaseService, consoleHelpers...), sempre no
 * momento da query. Por isso entrar/sair de um tenant recarrega a página: é a
 * forma barata de garantir que nada siga em memória com o tenant anterior.
 *
 * `auth-state-cache` (src/hooks/useAuth.ts) guarda o AuthState inteiro,
 * incluindo o tenant — sem limpá-lo, os ~29 componentes que usam `useAuth()`
 * direto renderizam o tenant antigo até a sessão recarregar.
 */

import { supabase } from '@/lib/supabaseClient';
import { SidebarPermission } from '@/types/permissions';

const OWNER_IMPERSONATION_KEY = 'owner-impersonation';
const AUTH_CACHE_KEY = 'auth-state-cache';

export type OwnerTenant = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  allowedFeatures?: SidebarPermission[];
};

/** Features padrão para tenants sem `allowed_features` no banco. */
export const DEFAULT_TENANT_FEATURES: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'imoveis', 'octo-chat'
];

/** Tenant sintético (não existe no banco), injetado quando não há um de teste. */
export const TEST_TENANT_ID = 'tenant-area-de-teste';
const TEST_TENANT_CODE = 'TESTE';

type TenantRow = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  allowed_features?: SidebarPermission[];
};

const isTestTenant = (t: OwnerTenant) => /teste/i.test(t.name || '') || t.code === TEST_TENANT_CODE;

export async function fetchOwnerTenants(): Promise<OwnerTenant[]> {
  const preferred = await supabase
    .from('tenants')
    .select('id, code, name, created_at, allowed_features')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  let data = preferred.data as TenantRow[] | null;
  let error = preferred.error as { message: string } | null;

  if (
    error?.message?.includes('allowed_features does not exist') ||
    error?.message?.includes('deleted_at does not exist')
  ) {
    // Migration pendente: busca na forma antiga para não quebrar a tela.
    // Degrada sem filtro de soft-delete e sem features até a migration rodar.
    const fallback = await supabase
      .from('tenants')
      .select('id, code, name, created_at')
      .order('created_at', { ascending: false });

    data = fallback.data as TenantRow[] | null;
    error = fallback.error as { message: string } | null;
  }

  if (error) throw new Error(error.message);

  const mapped: OwnerTenant[] = (data || []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    createdAt: t.created_at,
    allowedFeatures: t.allowed_features || DEFAULT_TENANT_FEATURES
  }));

  // O sintético só entra quando NÃO existe área de teste no banco. A checagem é
  // por "teste" no nome (a do banco chama-se "Área de Teste") porque o id sintético
  // não é uuid: entrar nele faz toda chamada ao servidor estourar 22P02.
  if (mapped.some(isTestTenant)) return mapped;

  return [
    {
      id: TEST_TENANT_ID,
      name: 'Imobiliária de teste',
      code: TEST_TENANT_CODE,
      createdAt: new Date().toISOString(),
      allowedFeatures: DEFAULT_TENANT_FEATURES,
    },
    ...mapped,
  ];
}

/** Entra num tenant como owner. Recarrega a página. */
export function enterTenant(tenant: Pick<OwnerTenant, 'id' | 'code' | 'name'>): void {
  localStorage.setItem(OWNER_IMPERSONATION_KEY, JSON.stringify({
    tenantId: tenant.id,
    tenantCode: tenant.code,
    tenantName: tenant.name
  }));
  localStorage.removeItem(AUTH_CACHE_KEY);
  window.location.reload();
}

/** Descarta a impersonation sem recarregar (para quem já está no painel). */
export function clearImpersonatedTenant(): void {
  localStorage.removeItem(OWNER_IMPERSONATION_KEY);
  localStorage.removeItem(AUTH_CACHE_KEY);
}

/** Volta ao painel do owner (sem tenant ativo). Recarrega a página. */
export function exitTenant(): void {
  clearImpersonatedTenant();
  window.location.reload();
}

/** Tenant impersonado no momento, ou null quando o owner está no painel. */
export function getImpersonatedTenantId(): string | null {
  try {
    const raw = localStorage.getItem(OWNER_IMPERSONATION_KEY);
    return raw ? (JSON.parse(raw)?.tenantId ?? null) : null;
  } catch {
    return null;
  }
}
