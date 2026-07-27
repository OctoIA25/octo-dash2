/**
 * Telemetria dos agentes de chat (front) — T3.
 * Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md
 *
 * Envia 1 evento `execution` por mensagem ao ingest do backend
 * (POST /api/v1/agent-telemetry/events), com a latência do roundtrip do
 * webhook n8n e o status REAL — inclusive `empty_response` para o 204/corpo
 * vazio que o texto de fallback da UX mascara.
 *
 * REGRA DE OURO: telemetria nunca degrada a UX do chat. `emitChatTelemetry`
 * nunca lança e não deve ser aguardada no fluxo de envio; falha (rede, sessão
 * ausente, backend fora) é silenciosa por contrato.
 *
 * Privacidade: o evento carrega métricas e ids — nunca o texto da mensagem.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

export type ChatTelemetryStatus = 'ok' | 'empty_response' | 'error';

export interface ChatTelemetryEvent {
  tenantId?: string | null;
  agentSlug: 'caio' | 'elaine';
  /** Correlação com agent_conversations (execution_id do evento). */
  conversationId?: string | null;
  status: ChatTelemetryStatus;
  durationMs?: number;
  errorMessage?: string | null;
}

/**
 * Deriva o status do evento a partir do retorno de
 * sendMessageToAgent/sendMessageToElaine: resposta vazia é `empty_response`
 * (a UI mostra texto de fallback, mas o agente NÃO respondeu).
 */
export function chatStatusFrom(result: {
  success: boolean;
  response?: string;
  error?: string;
}): ChatTelemetryStatus {
  if (!result.success) return 'error';
  return result.response?.trim() ? 'ok' : 'empty_response';
}

export async function emitChatTelemetry(evt: ChatTelemetryEvent): Promise<void> {
  try {
    if (!evt.tenantId) return; // ingest exige tenant uuid; sem ele não há evento válido

    await authedFetch('/api/v1/agent-telemetry/events', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: evt.tenantId,
        agent_slug: evt.agentSlug,
        source: 'crm_web',
        event_type: 'execution',
        status: evt.status,
        execution_id: evt.conversationId ?? null,
        duration_ms: evt.durationMs,
        error_message: evt.errorMessage ?? null,
      }),
      // Sobrevive à navegação: o envio segue mesmo se o usuário trocar de página.
      keepalive: true,
    });
  } catch {
    // silencioso por contrato: telemetria jamais quebra o chat
  }
}
