/**
 * Leads que ainda não têm atividade agendada — a faixa "Agendar" da Central de
 * Leads.
 *
 * Por que só as últimas 24h viram card: em 22/09/2026 a Lotus tinha 1.619 leads
 * ativos sem nenhuma atividade agendada, e 19 dentro dessa janela. Um card por
 * lead antigo transformaria o painel num relatório e apagaria a pergunta que
 * ele responde ("o que eu preciso fazer agora"). O passivo antigo vira um
 * número ao lado, que é o que a reunião precisa ver.
 *
 * Aqui não há bloqueio nem aviso: a penalidade de 24h ficou para a reunião de
 * 28/09. Esta faixa é só visibilidade.
 */

export interface LeadSemAtividade {
  id: string;
  nome: string | null;
  telefone: string | null;
  corretor: string | null;
  /** Quando o corretor atual recebeu o lead. Sem isso, não dá para contar 24h. */
  assigned_at: string | null;
  status: string | null;
}

export interface LeadsSemAtividade {
  /** Atribuídos nas últimas 24h, do que espera há mais tempo para o mais novo. */
  recentes: LeadSemAtividade[];
  /** Quantos passaram das 24h (ou não têm data): viram contador, não card. */
  antigos: number;
  totalSemAtividade: number;
}

const JANELA_MS = 24 * 60 * 60 * 1000;

export function separarLeadsSemAtividade(
  leads: LeadSemAtividade[],
  idsComAtividade: Set<string>,
  agora: Date = new Date(),
): LeadsSemAtividade {
  const semAtividade = (leads || []).filter((l) => !idsComAtividade.has(l.id));

  const recentes = semAtividade
    .filter((l) => {
      if (!l.assigned_at) return false;
      const quando = Date.parse(l.assigned_at);
      return Number.isFinite(quando) && agora.getTime() - quando <= JANELA_MS;
    })
    .sort((a, b) => Date.parse(a.assigned_at as string) - Date.parse(b.assigned_at as string));

  return {
    recentes,
    antigos: semAtividade.length - recentes.length,
    totalSemAtividade: semAtividade.length,
  };
}
