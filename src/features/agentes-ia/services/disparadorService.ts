/**
 * Serviço do Agente Disparador (frontend).
 *
 * Conversa com os endpoints server-side /api/v1/agent-actions/*, que fazem toda
 * a interpretação, segmentação, permissão e envio. Aqui só montamos as
 * requisições autenticadas (JWT Supabase) e tipamos as respostas.
 *
 * O fluxo é deliberadamente em duas etapas (proteção contra disparo acidental):
 *   preview()  → mostra contagens; NÃO envia.
 *   confirm()  → só após confirmação explícita do usuário, enfileira e dispara.
 */

import { supabase } from '@/lib/supabaseClient';

export interface DisparoPreview {
  action: string;
  segment: { type: string; [k: string]: unknown };
  foundCount: number;
  eligibleCount: number;
  noWhatsappCount: number;
  excludedCount: number;
  message: string;
  sampleNames: string[];
}

export interface PreviewResponse {
  ok: boolean;
  error?: string;
  clarification?: string | null;
  previewToken?: string;
  needsMessage?: boolean;
  preview?: DisparoPreview;
}

export interface ConfirmResponse {
  ok: boolean;
  error?: string;
  enqueued?: number;
  runId?: string;
}

export interface RunReport {
  ok: boolean;
  error?: string;
  run?: {
    id: string;
    status: string;
    found_count: number;
    eligible_count: number;
    no_whatsapp_count: number;
    excluded_count: number;
    sent_count: number;
    failed_count: number;
  };
  failures?: Array<{ lead_name: string | null; lead_phone: string | null; status: string; error: string | null }>;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
}

/** Etapa 1: interpreta o comando e devolve a prévia (sem enviar). */
export async function previewDisparo(tenantId: string, command: string): Promise<PreviewResponse> {
  const res = await authedFetch('/api/v1/agent-actions/preview', {
    method: 'POST',
    body: JSON.stringify({ tenantId, command }),
  });
  return res.json();
}

/** Etapa 2: confirma o previewToken (e a mensagem) e dispara. */
export async function confirmDisparo(
  tenantId: string,
  previewToken: string,
  message: string,
): Promise<ConfirmResponse> {
  const res = await authedFetch('/api/v1/agent-actions/confirm', {
    method: 'POST',
    body: JSON.stringify({ tenantId, previewToken, message }),
  });
  return res.json();
}

/** Relatório final de um run (contagens + falhas por destinatário). */
export async function getRunReport(tenantId: string, runId: string): Promise<RunReport> {
  const res = await authedFetch(
    `/api/v1/agent-actions/runs/${encodeURIComponent(runId)}?tenantId=${encodeURIComponent(tenantId)}`,
    { method: 'GET' },
  );
  return res.json();
}
