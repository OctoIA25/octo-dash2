/**
 * A.4 · "Dá para resgatar hoje" — os leads do corretor que ainda têm chance.
 *
 * Três motivos, do Manual: lead marcado como frio com score alto, lead que
 * respondeu e sumiu, lead que pediu simulação e não voltou. Ordenado por
 * score: o primeiro da lista é o que mais vale o telefonema.
 *
 * O score é o do P1.7, com os pesos da casa e o bônus da origem — a mesma
 * conta do kanban. Lead SEM sinal nenhum fica de fora: o score dele seria 50
 * por omissão, e pôr na fila um número inventado é pior que não pôr.
 */
import { avaliarLead, type SinaisDoLead } from '@/features/leads/utils/score';
import type { ConfiguracaoDoScore } from '@/features/leads/services/scoreService';

export interface LeadDoCorretor {
  id: string;
  nome: string;
  etapa: string | null;
  /** A temperatura marcada à mão no card (a antiga coluna), não a do score. */
  temperatura: string | null;
  origem: string | null;
}

export interface ItemDeResgate {
  id: string;
  nome: string;
  etapa: string | null;
  score: number;
  motivo: string;
}

/** Dias sem resposta a partir dos quais "respondeu e sumiu" e "pediu simulação e não voltou" contam. */
export const DIAS = { sumiu: 3, simulacao: 2 } as const;

export function filaDeResgate(
  leads: LeadDoCorretor[],
  sinais: Record<string, SinaisDoLead>,
  config: ConfiguracaoDoScore,
  limite = 10,
): ItemDeResgate[] {
  const itens: ItemDeResgate[] = [];
  for (const lead of leads) {
    const s = sinais[lead.id];
    const r = avaliarLead(s, config.porOrigem[String(lead.origem ?? '').trim().toLowerCase()] ?? 0, config.pesos);
    if (!s || !r) continue;
    const parado = s.sem_resposta_ha_dias ?? 0;

    const motivos: string[] = [];
    if (String(lead.temperatura ?? '').toLowerCase() === 'frio' && r.score >= config.pesos.limite_morno) {
      motivos.push(`marcado como frio, mas o score é ${r.score}`);
    }
    if (s.pediu_simulacao && parado >= DIAS.simulacao) {
      motivos.push(`pediu simulação e não voltou há ${parado} dias`);
    } else if (s.respondeu && parado >= DIAS.sumiu) {
      motivos.push(`respondeu e sumiu há ${parado} dias`);
    }
    if (motivos.length === 0) continue;
    itens.push({ id: lead.id, nome: lead.nome, etapa: lead.etapa, score: r.score, motivo: motivos.join(' · ') });
  }
  return itens.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome)).slice(0, limite);
}
