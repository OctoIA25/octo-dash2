/**
 * Fetch autenticado do módulo Comunicação.
 *
 * Por que existe: as abas do Communication (Templates, Campanhas, Públicos,
 * Mensagens, Histórico) chamam a API REST diretamente, sem React Query. Os
 * módulos que usam React Query (KPIs, Recomendações) sobrevivem a um token
 * momentaneamente expirado porque o retry automático refaz a chamada DEPOIS que
 * o Supabase rotacionou o token. Sem retry, o Communication batia 401 de forma
 * intermitente em TODAS as abas (token expirado entre o mount e o refresh).
 *
 * Este helper centraliza o padrão e replica essa resiliência: anexa o Bearer da
 * sessão e, em 401, faz UM refresh + UMA re-tentativa com o token novo. Uma única
 * fonte de verdade para auth nas 5 abas — sem duplicar token()/headers().
 *
 * Observação: o `fetchWithTokenRefresh` global (supabaseClient.ts) só cobre as
 * chamadas internas do client Supabase (PostgREST) e só dispara no corpo literal
 * "jwt expired" — não cobre /api/v1/*, que retorna invalid_token. Daí este helper.
 */
import { supabase } from '@/lib/supabaseClient';

async function accessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

function withAuth(init: RequestInit | undefined, token: string | undefined): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

/**
 * Faz a chamada com o JWT atual. Se receber 401 (token expirado/ausente),
 * força um refresh da sessão e re-tenta UMA vez com o token novo. Não re-tenta
 * mais que isso — um 401 persistente é falha real de autorização, não corrida.
 */
export async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, withAuth(init, await accessToken()));
  if (res.status !== 401) return res;

  const { error } = await supabase.auth.refreshSession();
  if (error) return res; // refresh falhou → devolve o 401 original (sessão realmente inválida)

  return fetch(input, withAuth(init, await accessToken()));
}
