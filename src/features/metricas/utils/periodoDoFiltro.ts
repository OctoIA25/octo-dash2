/**
 * O filtro de período da Visão Geral, em datas "AAAA-MM-DD" (dia de São Paulo).
 *
 * A safra (A.5) precisa de um período fechado: "todo o período" não tem safra
 * — é a base inteira, que é justamente o que ela veio separar. Por isso
 * `'all'` vira os últimos 30 dias (pedido de 01/10: a safra abria vazia).
 * Null só sai de datas livres incompletas ou invertidas.
 */
import { hojeSP } from '@/lib/dataSP';

export type FiltroDeData = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

const dois = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
const diasAntes = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export function periodoDoFiltro(
  filtro: FiltroDeData,
  /** 0–11, como o seletor da tela. */
  mes: number,
  ano: number,
  customDe: string,
  customAte: string,
  agora: Date = new Date(),
): { de: string; ate: string } | null {
  const hoje = hojeSP(agora);
  switch (filtro) {
    case 'today':
      return { de: hoje, ate: hoje };
    case 'week':
      return { de: diasAntes(hoje, 7), ate: hoje };
    case 'month':
      return { de: `${ano}-${dois(mes + 1)}-01`, ate: `${ano}-${dois(mes + 1)}-${dois(ultimoDia(ano, mes + 1))}` };
    case 'year':
      return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
    case 'custom':
      return customDe && customAte && customDe <= customAte ? { de: customDe, ate: customAte } : null;
    case 'all':
      return { de: diasAntes(hoje, 30), ate: hoje };
    default:
      return null;
  }
}
