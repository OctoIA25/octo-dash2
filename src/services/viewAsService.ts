/**
 * Transporte do "visualizar como" — consome GET /api/v1/view-as/users.
 *
 * Só transporte: quem pode ver quem é decidido no servidor (server/viewAs).
 * Um 403 aqui é a resposta correta para usuário sem permissão, não um bug.
 */

import { authedFetch } from '@/features/comunicacao/services/authedFetch';
import type { ViewAsTarget } from '@/contexts/ViewAsContext';

interface FetchParams {
  tenantId?: string;
  term?: string;
}

/**
 * Usuários do tenant que o usuário autenticado pode assumir como contexto.
 * Devolve [] quando não autorizado — o seletor simplesmente fica vazio.
 */
export async function fetchViewableUsers({ tenantId, term }: FetchParams): Promise<ViewAsTarget[]> {
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  // Owner impersonando um tenant precisa enviá-lo (mesmo contrato do restKpisService).
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

  const response = await authedFetch(`/api/v1/view-as/users?${params.toString()}`);
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    users?: ViewAsTarget[];
  };

  if (!response.ok || !json.ok) return [];
  return json.users ?? [];
}
