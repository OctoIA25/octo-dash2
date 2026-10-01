/**
 * A.6 · Fire — o que a tela faz com o que o banco devolve (20261011_fire.sql).
 * Pontuar, congelar e estornar são do banco; aqui só se ordena, agrupa e escreve.
 */
export type EventoFire = 'captacao' | 'visita' | 'proposta' | 'venda';
export type Atuacao = 'lancamentos' | 'prontos';
export type StatusEdicao = 'rascunho' | 'ativa' | 'encerrada';

export const EVENTOS: readonly EventoFire[] = ['captacao', 'visita', 'proposta', 'venda'];
export const ROTULO_DO_EVENTO: Record<EventoFire | 'desafio', string> = {
  captacao: 'Captação', visita: 'Visita', proposta: 'Proposta', venda: 'Venda', desafio: 'Desafio',
};
export const ROTULO_DA_ATUACAO: Record<Atuacao, string> = { lancamentos: 'Lançamentos', prontos: 'Prontos' };
export const ROTULO_DO_STATUS: Record<StatusEdicao, string> = { rascunho: 'Rascunho', ativa: 'Ativa', encerrada: 'Encerrada' };

/** A sugestão do plano, no mesmo espírito do score do lead. */
export const PONTUACAO_PADRAO: Record<EventoFire, number> = { captacao: 5, visita: 10, proposta: 20, venda: 50 };
export type Pontuacao = Record<Atuacao, Record<EventoFire, number>>;
export const pontuacaoPadrao = (): Pontuacao => ({ lancamentos: { ...PONTUACAO_PADRAO }, prontos: { ...PONTUACAO_PADRAO } });

export interface Classificado { user_id: string; nome: string; equipe: string; atuacao: Atuacao | null; pontos: number }
export interface Posicionado extends Classificado { posicao: number }

/** Empate divide a posição: 120, 120, 90 → 1º, 1º, 3º. */
export function comPosicao(lista: Classificado[]): Posicionado[] {
  const ordenada = [...lista].sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome));
  let posicao = 0;
  return ordenada.map((c, i) => {
    if (i === 0 || ordenada[i - 1].pontos !== c.pontos) posicao = i + 1;
    return { ...c, posicao };
  });
}

export interface LinhaDaEquipe { equipe: string; corretores: number; pontos: number }

/** Soma da mesma lista que a classificação individual mostra. */
export function porEquipe(lista: Classificado[]): LinhaDaEquipe[] {
  const mapa = new Map<string, LinhaDaEquipe>();
  for (const c of lista) {
    const l = mapa.get(c.equipe) ?? { equipe: c.equipe, corretores: 0, pontos: 0 };
    l.corretores++;
    l.pontos += c.pontos;
    mapa.set(c.equipe, l);
  }
  return [...mapa.values()].sort((a, b) => b.pontos - a.pontos || a.equipe.localeCompare(b.equipe));
}

export interface Recorde { tipo: 'vgc_mes' | 'maior_venda' | 'visitas_semana'; nome: string | null; valor: number; periodo: string; edicao: string | null }

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataBR = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const mesBR = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

export function textoDoRecorde(r: Recorde): { titulo: string; valor: string; quando: string } {
  switch (r.tipo) {
    case 'vgc_mes': return { titulo: 'Melhor mês de VGC', valor: reais(r.valor), quando: mesBR(r.periodo) };
    case 'maior_venda': return { titulo: 'Maior venda', valor: reais(r.valor), quando: dataBR(r.periodo) };
    default: return { titulo: 'Mais visitas numa semana', valor: `${r.valor} visita${r.valor === 1 ? '' : 's'}`, quando: `semana de ${dataBR(r.periodo)}` };
  }
}
