/**
 * Toques do corretor — contrato das rotas /api/v1/leads/:leadId/toques.
 *
 * `lead_toques` tem RLS sem policy: não é lida pelo PostgREST. Quem decide quem
 * pode ler e registrar é o servidor (server/leadToques/index.js). Mesmo molde
 * de cadenciaService: timeout explícito e erro traduzido para a tela.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

const TIMEOUT_MS = 15_000;

export type CanalToque = 'whatsapp' | 'ligacao' | 'email' | 'presencial';
export type ResultadoToque = 'respondeu' | 'nao_respondeu' | 'numero_errado' | 'nao_contatar';

export interface ToqueCorretor {
  id: string;
  canal: CanalToque;
  resultado: ResultadoToque;
  observacao: string | null;
  proximo_toque_em: string | null;
  executado_em: string;
  executado_por: string;
  executado_por_nome: string | null;
}

export interface NovoToque {
  canal: CanalToque;
  resultado: ResultadoToque;
  observacao?: string;
  proximo_toque_em: string | null;
}

const MENSAGEM_POR_ERRO: Record<string, string> = {
  forbidden: 'Você não tem acesso à cadência deste lead.',
  lead_not_found: 'Lead não encontrado neste tenant.',
  invalid_lead_id: 'Lead inválido.',
  invalid_body: 'Confira canal, resultado e próximo toque.',
  not_latest: 'Só o último toque pode ser desfeito.',
  not_own: 'Só quem registrou pode desfazer este toque.',
  toque_not_found: 'Este toque já não existe.',
};

async function chamar<T>(caminho: string, tenantId: string | null | undefined, init?: RequestInit): Promise<T> {
  const params = new URLSearchParams();
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(`${caminho}?${params}`, { ...init, signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const codigo = String(json?.error ?? `HTTP ${res.status}`);
      throw new Error(MENSAGEM_POR_ERRO[codigo] ?? 'Não foi possível concluir. Tente de novo.');
    }
    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}

const base = (leadId: string) => `/api/v1/leads/${encodeURIComponent(leadId)}/toques`;

export async function fetchToques(leadId: string, tenantId?: string | null): Promise<ToqueCorretor[]> {
  const json = await chamar<{ toques?: ToqueCorretor[] }>(base(leadId), tenantId);
  return json.toques ?? [];
}

export async function registrarToque(
  leadId: string,
  tenantId: string | null | undefined,
  toque: NovoToque,
): Promise<ToqueCorretor> {
  const json = await chamar<{ toque: ToqueCorretor }>(base(leadId), tenantId, {
    method: 'POST',
    body: JSON.stringify(toque),
  });
  return json.toque;
}

export async function desfazerToque(leadId: string, tenantId: string | null | undefined, toqueId: string) {
  await chamar(`${base(leadId)}/${encodeURIComponent(toqueId)}`, tenantId, { method: 'DELETE' });
}
