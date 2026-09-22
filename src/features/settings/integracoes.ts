/**
 * Integrações honestas (P4.10) — a parte que decide o que a tela diz.
 *
 * Sem tela e sem banco: é aqui que mora a diferença entre "conectada" e
 * "conectada mas com erro guardado", que é justamente a que a tela antiga
 * apagava.
 */

export interface EstadoDaIntegracao {
  codigo: string;
  nome: string;
  configurada: boolean;
  status: string;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
  /** A tabela daquela integração não guarda erro: a tela diz isso. */
  erro_nao_registrado?: boolean;
  /** Nulo quando aquilo não traz lead nenhum. Nulo é diferente de zero. */
  leads: number | null;
  leads_de_onde: string;
}

export interface Prevista {
  codigo: string;
  nome: string;
  estado: 'em_breve' | 'por_outra' | 'outra_tela';
  explicacao: string;
}

/**
 * Como o status é chamado na tela.
 *
 * As seis integrações usam palavras diferentes para a mesma coisa — 'ativo',
 * 'active', 'not_configured'. Traduzir aqui é o que faz a faixa ser legível.
 * Status desconhecido aparece como veio: inventar "Conectada" para o que não
 * se reconhece é o erro mais caro que esta função poderia cometer.
 */
export function rotuloDoStatus(e: Pick<EstadoDaIntegracao, 'status' | 'configurada'>): string {
  if (!e.configurada) return 'Não configurada';
  switch (e.status) {
    case 'ativo': case 'active': return 'Conectada';
    case 'error': return 'Com erro';
    case 'inactive': case 'inativo': return 'Desligada';
    case 'not_configured': case 'nao_configurada': return 'Não configurada';
    default: return e.status;
  }
}

/** Status 'active' COM erro guardado é problema, não conexão saudável. */
export const comProblema = (e: EstadoDaIntegracao): boolean =>
  e.configurada && (e.status === 'error' || !!e.ultimo_erro);

export const conectada = (e: EstadoDaIntegracao): boolean =>
  e.configurada && (e.status === 'ativo' || e.status === 'active') && !e.ultimo_erro;

/**
 * "há 2 horas", "há 3 dias".
 *
 * Data absoluta obriga a pessoa a fazer a conta para saber se está parado. O
 * que interessa é há quanto tempo. Data no futuro (relógio adiantado) cala,
 * em vez de dizer "há -5 min".
 */
export function faz(quando: string | null | undefined): string | null {
  if (!quando) return null;
  const ms = Date.now() - new Date(quando).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 2) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? '' : 's'}`;
}
