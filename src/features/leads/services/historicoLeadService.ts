/**
 * Histórico do lead — contrato de leitura consumido pelo card do lead.
 *
 * A fonte é `lead_events`, escrita pelos triggers do banco (criação,
 * atribuição, etapa, arquivamento, classificação) e pela rota que a LIA usa.
 * Ela NÃO é lida direto do PostgREST: está com RLS sem policy e devolveria
 * lista vazia. Quem recorta quem pode ver é o servidor — ver
 * server/leadEvents/index.js.
 *
 * Espelha cadenciaService: interface aqui, timeout explícito, erro do backend
 * traduzido para mensagem que a tela pode mostrar.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

const TIMEOUT_MS = 15_000;

export interface EventoAtor {
  /** sistema (sync/job/endpoint) | usuario (alguém na dash) | lia */
  tipo: 'sistema' | 'usuario' | 'lia';
  nome: string | null;
  user_id: string | null;
}

/** Um acontecimento na vida do lead. */
export interface EventoLead {
  id: string;
  /** Enum ABERTO: a LIA cria tipo novo sem avisar. Nunca esconder o que não conhece. */
  tipo: string;
  descricao: string | null;
  de: string | null;
  para: string | null;
  ator: EventoAtor;
  metadata: Record<string, unknown>;
  quando: string;
  /**
   * Reconstruído das colunas do lead, não gravado como evento. Só conhece o
   * estado ATUAL — se o lead passou por três corretores, o derivado mostra um.
   * A tela sinaliza isso.
   */
  derivado: boolean;
}

export interface HistoricoResumo {
  total: number;
  reais: number;
  derivados: number;
  /** A consulta bateu no teto de linhas: a lista é um recorte. */
  truncated: boolean;
}

export interface Historico {
  eventos: EventoLead[];
  resumo: HistoricoResumo;
}

/** 403 e 404 não são falha do sistema — a tela diz o que aconteceu. */
const MENSAGEM_POR_ERRO: Record<string, string> = {
  forbidden: 'Você não tem acesso ao histórico deste lead.',
  lead_not_found: 'Lead não encontrado neste tenant.',
  invalid_lead_id: 'Lead inválido.',
};

export async function fetchHistoricoDoLead(
  leadId: string,
  tenantId?: string | null,
): Promise<Historico> {
  const params = new URLSearchParams();
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(
      `/api/v1/leads/${encodeURIComponent(leadId)}/eventos?${params}`,
      { signal: controller.signal },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const codigo = String(json?.error ?? `HTTP ${res.status}`);
      throw new Error(MENSAGEM_POR_ERRO[codigo] ?? 'Não foi possível carregar o histórico.');
    }
    return { eventos: json.eventos ?? [], resumo: json.resumo };
  } finally {
    clearTimeout(timeout);
  }
}
