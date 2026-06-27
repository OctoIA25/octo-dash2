/**
 * Cliente das rotas server-side da integração Santa Ângela. A config é cifrada
 * no servidor, por isso o frontend chama nossa API (não o Supabase direto).
 */
import { supabase } from '@/lib/supabaseClient';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export async function saveSantaAngelaConfig(
  tenantId: string, baseUrl: string, apiKey: string, status: 'active' | 'inactive' = 'active',
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/v1/santa-angela/config', {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ tenantId, baseUrl, apiKey, status }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok, error: json.error };
}

export async function testSantaAngelaConfig(
  tenantId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const res = await fetch('/api/v1/santa-angela/config/test', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, status: json.status, error: json.error };
}

/**
 * Dispara um ciclo de sync no servidor (todos os tenants active, em background).
 * A rota é reentrância-guarded: se já houver um ciclo rodando, responde
 * started=false sem duplicar. Não recebe tenantId — o ciclo é completo.
 */
export async function runSantaAngelaSync(): Promise<{ ok: boolean; started?: boolean; error?: string }> {
  const res = await fetch('/api/v1/santa-angela/sync/run', {
    method: 'POST', headers: await authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, started: json.started, error: json.error };
}

// Debounce entre montagens: abrir/fechar a tela de leads repetidamente não deve
// disparar N ciclos. Só refaz o trigger se passou mais que DEBOUNCE_MS desde o
// último. O cron de 60s cobre o baseline; este trigger é só frescor sob demanda.
const VIEW_DEBOUNCE_MS = 30_000;
let lastViewTriggerAt = 0;

/**
 * Chamado ao abrir a tela de leads: força um sync para quem está olhando a tela
 * ver leads novos na hora, sem esperar o próximo tick do cron. No-op se um
 * trigger ocorreu há menos de VIEW_DEBOUNCE_MS. Falha silenciosa (best-effort).
 */
export function triggerSantaAngelaSyncOnView(): void {
  const now = Date.now();
  if (now - lastViewTriggerAt < VIEW_DEBOUNCE_MS) return;
  lastViewTriggerAt = now;
  void runSantaAngelaSync().catch(() => { /* best-effort: o cron cobre o baseline */ });
}

export async function fetchSantaAngelaStatus(): Promise<{ integrations: any[]; error?: string }> {
  const res = await fetch('/api/v1/santa-angela/sync/status', { headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  return { integrations: json.integrations || [], error: json.error };
}
