/**
 * Cliente das rotas de configuração do Meta Lead Ads.
 *
 * Os segredos são via de mão única: sobem no POST e nunca voltam no GET. O GET
 * devolve só `hasAppSecret`/`hasAccessToken` para a tela mostrar "configurado"
 * sem nunca ter o valor em memória no browser.
 */
import { supabase } from '@/lib/supabaseClient';

export interface MetaLeadgenConfig {
  pageId: string | null;
  status: 'active' | 'inactive' | 'error';
  verifyToken: string;
  webhookUrl: string;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
}

export interface MetaConfigInput {
  pageId?: string;
  appSecret?: string;
  accessToken?: string;
  status?: 'active' | 'inactive';
}

type Result = { ok: true; config: MetaLeadgenConfig | null } | { ok: false; error: string };

const BASE = '/api/v1/integrations/meta/config';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
  };
}

async function parse(resp: Response): Promise<Result> {
  let body: any = null;
  try { body = await resp.json(); } catch { body = null; }
  if (!resp.ok || !body?.ok) {
    return { ok: false, error: body?.message || body?.error || `Falha na requisição (${resp.status})` };
  }
  return { ok: true, config: body.config ?? null };
}

async function post(url: string, body: unknown): Promise<Result> {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    return parse(resp);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro de rede' };
  }
}

export async function getMetaConfig(tenantId: string): Promise<Result> {
  // POST, não GET: o tenantId precisa vir do CORPO, mesma fonte que o
  // middleware usa para autorizar. Com o tenant na query, o handler lia um
  // tenant e o middleware autorizava outro — vazamento entre tenants.
  return post(`${BASE}/get`, { tenantId });
}

export async function saveMetaConfig(tenantId: string, input: MetaConfigInput): Promise<Result> {
  // Campo em branco é "não mexi nisso", não "apague". Omitir a chave deixa
  // a intenção explícita: só o que veio preenchido é enviado.
  const body: Record<string, unknown> = { tenantId };
  if (input.pageId) body.pageId = input.pageId;
  if (input.appSecret) body.appSecret = input.appSecret;
  if (input.accessToken) body.accessToken = input.accessToken;
  if (input.status) body.status = input.status;
  return post(BASE, body);
}
