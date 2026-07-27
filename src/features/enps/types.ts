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
 * Serviço do módulo eNPS. `restEnpsService` é a implementação real (fetch);
 * testes injetam um fake via `setEnpsService`. `getOverview` é adicionado
 * pela Task 11 (dashboard de visão geral) — não faz parte do responder.
 */
export interface EnpsService {
  getResponderContext(cycleId: string): Promise<EnpsResponderContext>;
  submitResponse(input: EnpsSubmitInput): Promise<{ ok: true }>;
}
