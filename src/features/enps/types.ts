/**
 * Contrato (DTOs) do módulo eNPS.
 *
 * Estes tipos são a FRONTEIRA entre a UI e a fonte de dados. A página do
 * responder e o hook `useEnps` só conhecem estes tipos — nunca o formato
 * bruto das rotas do servidor. Isso permite trocar a implementação de
 * `EnpsService` (ex.: mocks em teste) sem tocar na UI.
 */

/** Uma pergunta do survey, como devolvida por `GET /api/v1/enps/cycle/:cycleId`. */
export interface EnpsQuestion {
  key: 'q_empresa' | 'q_gestor' | 'q_comentario';
  type: 'nps_0_10' | 'open_text';
  label: string;
  /** Default true (implícito) para as escalas NPS; `q_comentario` é opcional. */
  required?: boolean;
}

/** Ciclo (survey_cycles) mínimo necessário para a página do responder. */
export interface EnpsCycleSummary {
  id: string;
  status: 'open' | 'closed';
}

/** Bootstrap de `GET /api/v1/enps/cycle/:cycleId` consumido por `EnpsResponderPage`. */
export interface EnpsResponderContext {
  cycle: EnpsCycleSummary;
  questions: EnpsQuestion[];
  /** Controla a exibição da Q2 (gestor) — corretor sem líder não a responde. */
  hasLeader: boolean;
  /** Curto-circuito: corretor já respondeu este ciclo. */
  alreadyResponded: boolean;
}

/** Respostas do corretor, mapeadas por chave de pergunta. */
export interface EnpsAnswers {
  q_empresa: number;
  q_gestor?: number;
  q_comentario?: string;
}

/** Payload de `POST /api/v1/enps/responses`. */
export interface EnpsSubmitInput {
  cycle_id: string;
  answers: EnpsAnswers;
  /**
   * Opt-in SELF-ONLY: permite que o próprio corretor acompanhe sua evolução
   * ao longo do tempo. As respostas continuam não identificadas para a
   * gestão independentemente deste valor (ver copy em EnpsResponderPage).
   */
  allow_individual: boolean;
}

/**
 * DTOs do dashboard de visão geral (Task 11). `GET /api/v1/enps` devolve um
 * envelope pré-agregado no servidor; cada bloco derivado de resposta pode vir
 * `{ insufficient: true }` quando o N-mínimo (gate no servidor, spec §5) não
 * é atingido — a UI mostra "respostas insuficientes" nesse caso.
 */
export interface EnpsPeriod { startDate: string; endDate: string; label: string }

export interface EnpsScoreBlock { score: number; promoters: number; passives: number; detractors: number; count: number; enps: number }
export interface Insufficient { insufficient: true }
export function isInsufficient<T>(b: T | Insufficient): b is Insufficient {
  return !!b && typeof b === 'object' && (b as Insufficient).insufficient === true;
}

export interface EnpsEvolucaoPoint { label: string; empresa: number | null; gestor: number | null }
export interface EnpsDistBucket { label: string; count: number }
export interface EnpsRankingRow { leaderUserId: string; leaderName: string; enps: number; count: number }
export interface EnpsComentario { text: string; leaderUserId?: string }
export interface EnpsParticipacao { sent: number; responded: number; pending: number; rate: number }
export interface EnpsIndividual { evolucao: EnpsEvolucaoPoint[]; comentarios: EnpsComentario[] }

export interface EnpsOverview {
  period: EnpsPeriod;
  geral: { empresa: EnpsScoreBlock | Insufficient; gestor: EnpsScoreBlock | Insufficient };
  evolucao: EnpsEvolucaoPoint[];
  participacao: EnpsParticipacao;
  ranking: EnpsRankingRow[];
  distribuicao: { empresa: EnpsDistBucket[]; gestor: EnpsDistBucket[] } | Insufficient;
  comentarios: EnpsComentario[] | Insufficient;
  individual?: EnpsIndividual;
}

/**
 * Pendência do próprio corretor (banner da dash). `pending:false` quando não há
 * nada a responder; senão traz o cycleId (p/ o link) e o period_start cru (o
 * front formata o rótulo). Self-scoped no servidor — nunca expõe pendência alheia.
 */
export type EnpsPending =
  | { pending: false }
  | { pending: true; cycleId: string; periodStart: string };

/**
 * Serviço do módulo eNPS. `restEnpsService` é a implementação real (fetch);
 * testes injetam um fake via `setEnpsService`. `getOverview` foi adicionado
 * pela Task 11 (dashboard de visão geral) — não faz parte do responder.
 */
export interface EnpsService {
  getOverview(params: { tenantId: string; period: EnpsPeriod; leader?: string | null; corretor?: string | null }): Promise<EnpsOverview>;
  getResponderContext(cycleId: string): Promise<EnpsResponderContext>;
  submitResponse(input: EnpsSubmitInput): Promise<{ ok: true }>;
  getPending(): Promise<EnpsPending>;
}
