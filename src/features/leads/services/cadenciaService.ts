/**
 * Cadência da LIA — contrato de leitura consumido pelo card do lead.
 *
 * A fonte é `lia_followups`, tabela escrita pelo app da LIA. Ela NÃO é lida
 * direto do PostgREST: está com RLS sem policy (devolveria lista vazia) e
 * carrega texto de conversa com o cliente. Quem recorta quem pode ver é o
 * servidor — ver server/liaCadencia/index.js.
 *
 * Espelha o padrão de restKpisService: interface do serviço aqui, timeout
 * explícito, erro do backend traduzido para mensagem que a tela pode mostrar.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

const TIMEOUT_MS = 15_000;

/** Uma tentativa de contato da LIA com o lead. */
export interface CadenciaEvento {
  id: string;
  tag: string | null;
  attempt_number: number | null;
  channel: string | null;
  status: string | null;
  /** respondido | sem_resposta | aguardando | expirado | cancelado | visita_agendada | escalado | opt_out */
  resultado: string;
  respondeu: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  respondido_em: string | null;
  tempo_ate_resposta_min: number | null;
  motivo: string | null;
  cancelled_reason: string | null;
  template_name: string | null;
}

export interface CadenciaResumo {
  total: number;
  enviadas: number;
  pendentes: number;
  canceladas: number;
  expiradas: number;
  respondidas: number;
  /** O lead voltou a falar ANTES de a cadência sair — ela foi cancelada por isso. */
  retornos_espontaneos: number;
  /** Percentual inteiro, ou null quando nada foi enviado (0% mentiria). */
  taxa_resposta: number | null;
  tempo_resposta_min: { mediana: number | null; amostra: number };
  por_tentativa: { attempt_number: number; enviadas: number; respondidas: number }[];
  por_tag: { tag: string; enviadas: number; respondidas: number }[];
  proxima: {
    scheduled_at: string;
    tag: string | null;
    attempt_number: number | null;
    atrasada: boolean;
  } | null;
  ultima_interacao_lead: string | null;
  dias_em_silencio: number | null;
  interaction_count: number | null;
  /** A consulta bateu no teto de linhas: a timeline é um recorte. */
  truncated: boolean;
}

export interface Cadencia {
  resumo: CadenciaResumo;
  timeline: CadenciaEvento[];
}

/** 403 e 404 não são falha do sistema — a tela diz o que aconteceu. */
const MENSAGEM_POR_ERRO: Record<string, string> = {
  forbidden: 'Você não tem acesso à cadência deste lead.',
  lead_not_found: 'Lead não encontrado neste tenant.',
  invalid_lead_id: 'Lead inválido.',
};

export async function fetchCadenciaDoLead(
  leadId: string,
  tenantId?: string | null,
): Promise<Cadencia> {
  const params = new URLSearchParams();
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(
      `/api/v1/leads/${encodeURIComponent(leadId)}/cadencia?${params}`,
      { signal: controller.signal },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const codigo = String(json?.error ?? `HTTP ${res.status}`);
      throw new Error(MENSAGEM_POR_ERRO[codigo] ?? 'Não foi possível carregar a cadência.');
    }
    return { resumo: json.resumo, timeline: json.timeline ?? [] };
  } finally {
    clearTimeout(timeout);
  }
}
