/**
 * Os filtros da tela de recrutamento como função pura. Era um par de useMemo
 * dentro de useRecruitment; saiu de lá porque o Kanban precisa aplicar os
 * MESMOS filtros sobre a carga completa (todos os candidatos do tenant), e o
 * hook antigo só tem a página de 10.
 *
 * Dois recortes, de propósito:
 *  - recorteCanalPeriodo: vale para o FUNIL. Filtrar o funil por estágio
 *    faria cada barra mostrar só quem está nela — o bug que ele corrige.
 *  - filtrarCandidatos: recorte + status, busca, cargo, experiência e
 *    condições. Vale para a lista e para o quadro.
 */

export interface FiltrosCandidato {
  searchTerm: string;
  filtroStatus: string;       // 'todos' | label do estágio
  filtroCargo: string;        // 'todos' | cargo
  filtroExperiencia: string;  // 'todos' | faixa
  filtroCanal: string;        // 'todos' | label da fonte
  filtroCondicao: string;     // 'todas' | 'aprovadas' | 'pendentes' | 'reprovada'
  periodoDe: string;          // 'AAAA-MM-DD' ou ''
  periodoAte: string;         // 'AAAA-MM-DD' ou ''
}

export const FILTROS_VAZIOS: FiltrosCandidato = {
  searchTerm: '',
  filtroStatus: 'todos',
  filtroCargo: 'todos',
  filtroExperiencia: 'todos',
  filtroCanal: 'todos',
  filtroCondicao: 'todas',
  periodoDe: '',
  periodoAte: '',
};

/** O mínimo que os filtros leem de um candidato. */
export interface CandidatoFiltravel {
  nome: string;
  email?: string | null;
  cargo?: string | null;
  experiencia?: string | null;
  status: string;
  fonte?: string | null;
  data_inscricao?: string | null;
  cond_regiao?: string | null;
  cond_tempo?: string | null;
  cond_verba?: string | null;
}

export function recorteCanalPeriodo<T extends CandidatoFiltravel>(candidatos: readonly T[], f: FiltrosCandidato): T[] {
  return candidatos.filter((c) => {
    const matchCanal = f.filtroCanal === 'todos' || c.fonte === f.filtroCanal;
    const dia = String(c.data_inscricao || '').slice(0, 10);
    const matchDe = f.periodoDe === '' || dia >= f.periodoDe;
    const matchAte = f.periodoAte === '' || dia <= f.periodoAte;
    return matchCanal && matchDe && matchAte;
  });
}

export function filtrarCandidatos<T extends CandidatoFiltravel>(candidatos: readonly T[], f: FiltrosCandidato): T[] {
  const termo = f.searchTerm.toLowerCase();
  return recorteCanalPeriodo(candidatos, f).filter((c) => {
    const tres = [c.cond_regiao, c.cond_tempo, c.cond_verba];
    const matchCondicao =
      f.filtroCondicao === 'todas' ? true
      : f.filtroCondicao === 'aprovadas' ? tres.every((v) => v === 'aprovado')
      : f.filtroCondicao === 'reprovada' ? tres.some((v) => v === 'reprovado')
      : tres.some((v) => v === 'pendente' || v == null);
    if (!matchCondicao) return false;

    const matchSearch = termo === ''
      || (c.nome ?? '').toLowerCase().includes(termo)
      || (c.email ?? '').toLowerCase().includes(termo)
      || (c.cargo ?? '').toLowerCase().includes(termo);
    const matchStatus = f.filtroStatus === 'todos' || c.status === f.filtroStatus;
    const matchCargo = f.filtroCargo === 'todos' || c.cargo === f.filtroCargo;
    const matchExperiencia = f.filtroExperiencia === 'todos' || c.experiencia === f.filtroExperiencia;
    return matchSearch && matchStatus && matchCargo && matchExperiencia;
  });
}

/** Algum filtro fora do padrão? (o botão "Filtros" acende com isto) */
export function temFiltroAtivo(f: FiltrosCandidato): boolean {
  return (Object.keys(FILTROS_VAZIOS) as (keyof FiltrosCandidato)[]).some((k) => f[k] !== FILTROS_VAZIOS[k]);
}
