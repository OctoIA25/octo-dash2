/**
 * Lista de possíveis captadores do tenant: os membros reais (RPC
 * get_tenant_members), não as linhas de tenant_brokers — na Japi Lançamentos
 * são 14 membros contra 70 brokers herdados da Japi principal.
 *
 * TenantMember não expõe `name`, só `email`. O nome vem de um select paralelo
 * em tenant_brokers mergeado por user_id — mesmo padrão que tenantMembersService
 * já usa para creci e leader_user_id. Sem nome, cai no e-mail.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';

export interface Captador {
  user_id: string;
  nome: string;
}

/** Vira o mapa user_id → nome que resolverCaptador consome. */
export const mapCaptadoresPorId = (lista: Captador[]): Record<string, string> =>
  Object.fromEntries(lista.map((c) => [c.user_id, c.nome]));

export const useCaptadores = (tenantId?: string) =>
  useQuery({
    queryKey: ['captadores', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<Captador[]> => {
      const membros = await fetchTenantMembers(tenantId as string);
      if (membros.length === 0) return [];

      const ids = membros.map((m) => m.user_id).filter(Boolean);
      const nomePorUserId: Record<string, string> = {};

      if (ids.length > 0) {
        const { data, error } = await supabase
          .from('tenant_brokers')
          .select('auth_user_id, name')
          .eq('tenant_id', tenantId as string)
          .in('auth_user_id', ids);

        if (error) {
          // Sem nomes o select ainda funciona (cai no e-mail); logar e seguir.
          console.error('Erro ao buscar nomes de captadores:', error.message);
        }

        (data || []).forEach((row: { auth_user_id: string | null; name: string | null }) => {
          if (row.auth_user_id && row.name) nomePorUserId[row.auth_user_id] = row.name;
        });
      }

      return membros
        .map((m) => ({ user_id: m.user_id, nome: nomePorUserId[m.user_id] || m.email }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
