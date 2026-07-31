/**
 * P2 — Status do Tenant: cliente do endpoint agregado.
 *
 * Reusa o authedFetch central (refresh+retry em 401) em vez de reimplementar
 * auth. Só tipa e chama GET /api/v1/health/tenant/:tenantId — o backend monta os
 * cards; o front apenas pinta (baixo acoplamento: não conhece nenhuma tabela).
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

export type CardStatus = 'ok' | 'degraded' | 'error' | 'inactive' | 'unknown';
export type FailureOrigin = 'internal' | 'external' | 'config' | null;

export interface SyncCard {
  available: boolean;
  status: CardStatus;
  failure_origin: FailureOrigin;
  last_sync_at: string | null;
  last_error: string | null;
  details: { fetched: number | null; new: number | null; updated: number | null; errors: number | null } | null;
  error?: string; // presente quando available=false
}

export interface OutboxCard {
  available: boolean;
  status: CardStatus;
  failure_origin: FailureOrigin;
  queue_pending: number;
  queue_failed: number;
  last_error: string | null;
  error?: string;
}

export interface WebhooksCard {
  available: boolean;
  status: CardStatus;
  failure_origin: FailureOrigin;
  recent_failures: number;
  last_error: string | null;
  error?: string;
}

export interface WhatsappCard {
  available: boolean;
  status: CardStatus;
  failure_origin: FailureOrigin;
  active: boolean;
  queued: number;
  failed: number;
  last_error: string | null;
  error?: string;
}

export interface LiaBlock {
  available: boolean;
  ativa: boolean;
  minutos_desde_ultima_msg?: number | null;
  mensagens?: { total: number; ia: number; corretor: number; proporcao_ia_corretor: number | null };
  followups?: { pending: number; sent: number; cancelled: number; expired: number; taxa_envio: number };
  perguntas?: { pendente: number; respondida: number; taxa_resposta: number; tempo_mediano_min: number | null };
  visitas?: { total: number; confirmadas: number; taxa_confirmacao: number };
  engajamento?: { interacao_media: number | null; lead_mais_ativo: number | null };
  qualificacao?: { fatos: number; leads_qualificados: number };
}

export interface IaCard {
  available: boolean;
  provider: string | null;
  model: string | null;
  lia?: LiaBlock;
  error?: string;
}

export interface JobStatus { ok: boolean; age_s: number | null }

export interface TenantStatus {
  tenantId: string;
  exists: boolean | null;
  deleted_at: string | null;
  tenant: {
    contact2sale: SyncCard;
    kenlo: SyncCard;
    outbox: OutboxCard;
    webhooks: WebhooksCard;
    whatsapp: WhatsappCard;
    ia: IaCard;
    anthropic: {
      available: boolean;
      status: 'normal' | 'warning' | 'not_configured' | 'insufficient_data' | 'error';
      percentage: number | null;
      usage_usd: number | null;
      limit_usd: number | null;
      window_start: string | null;
      window_end: string | null;
      last_error: string | null;
      last_synced_at: string | null;
      mode: 'api' | 'max';
    };
  };
  platform: {
    jobs: Record<string, JobStatus> & { available?: boolean };
  };
}

export async function fetchTenantStatus(tenantId: string): Promise<TenantStatus> {
  const res = await authedFetch(`/api/v1/health/tenant/${tenantId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json();
}
