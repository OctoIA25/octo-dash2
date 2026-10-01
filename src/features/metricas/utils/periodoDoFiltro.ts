/**
 * O filtro de período da Visão Geral, em datas "AAAA-MM-DD" (dia de São Paulo).
 *
 * A safra (A.5) precisa de um período fechado: "todo o período" não tem safra
 * — é a base inteira, que é justamente o que ela veio separar. Por isso
 * `'all'` devolve null, e a tela pede para escolher.
 */
import { hojeSP } from '@/lib/dataSP';

export type FiltroDeData = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

const dois = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

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
    case 'week': {
      const d = new Date(`${hoje}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7);
      return { de: d.toISOString().slice(0, 10), ate: hoje };
    }
    case 'month':
      return { de: `${ano}-${dois(mes + 1)}-01`, ate: `${ano}-${dois(mes + 1)}-${dois(ultimoDia(ano, mes + 1))}` };
    case 'year':
      return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
    case 'custom':
      return customDe && customAte && customDe <= customAte ? { de: customDe, ate: customAte } : null;
    default:
      return null;
  }
}
