/**
 * Quantos leads passaram por cada etapa do funil — contrato de leitura.
 *
 * NÃO lê `lead_events` direto: a tabela está com RLS sem policy e o PostgREST
 * devolveria lista vazia, sem erro. Quem recorta é o servidor, como já faz o
 * histórico do card — ver `server/leadEvents/index.js`.
 *
 * Espelha `historicoLeadService`: timeout explícito e falha que a tela pode
 * mostrar. E falha SILENCIOSA é proibida aqui por um motivo específico: se a
 * contagem vier vazia por erro, o funil mostraria "0 passaram" em todas as
 * etapas — indistinguível de "ninguém passou", que é uma frase muito diferente.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

const TIMEOUT_MS = 20_000;

export interface PassaramPorEtapa {
  etapas: string[];
  /** Mesma ordem de `etapas`. */
  passaram: number[];
  /**
   * Quando o registro de eventos começa, em ISO. `null` = não há evento
   * nenhum, e aí a tela mostra só o "parados agora".
   */
  inicioDoHistorico: string | null;
  /** A consulta bateu no teto e o número está incompleto. */
  truncado: boolean;
}

export async function carregarPassaramPorEtapa(
  etapas: string[],
  periodo?: { de?: string | null; ate?: string | null },
): Promise<PassaramPorEtapa> {
  if (!etapas?.length) return { etapas: [], passaram: [], inicioDoHistorico: null, truncado: false };

  const params = new URLSearchParams({ etapas: etapas.join('|') });
  if (periodo?.de) params.set('de', periodo.de);
  if (periodo?.ate) params.set('ate', periodo.ate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(`/api/v1/funil/passaram-por-etapa?${params}`, {
      signal: controller.signal,
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok || !corpo?.ok) {
      throw new Error(corpo?.error || `Não deu para contar quem passou por cada etapa (${res.status})`);
    }
    return {
      etapas: corpo.etapas ?? etapas,
      passaram: corpo.passaram ?? [],
      inicioDoHistorico: corpo.inicio_do_historico ?? null,
      truncado: corpo.truncated === true,
    };
  } finally {
    clearTimeout(timer);
  }
}
