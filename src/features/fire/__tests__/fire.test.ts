import { describe, expect, it } from 'vitest';
import { comPosicao, porEquipe, textoDoRecorde, type Classificado } from '../fire';

const c = (nome: string, pontos: number, equipe = 'Lançamentos'): Classificado =>
  ({ user_id: nome, nome, equipe, atuacao: 'lancamentos', pontos });

describe('A.6 · classificação', () => {
  it('empate divide a posição e o próximo pula: 1º, 1º, 3º', () => {
    expect(comPosicao([c('Bia', 90), c('Ana', 120), c('Caio', 120)]).map((x) => [x.nome, x.posicao]))
      .toEqual([['Ana', 1], ['Caio', 1], ['Bia', 3]]);
  });
  it('por equipe soma a mesma lista da classificação individual', () => {
    const lista = [c('Ana', 120), c('Bia', 30), c('Caio', 50, 'Prontos')];
    const equipes = porEquipe(lista);
    expect(equipes).toEqual([
      { equipe: 'Lançamentos', corretores: 2, pontos: 150 },
      { equipe: 'Prontos', corretores: 1, pontos: 50 },
    ]);
    expect(equipes.reduce((s, e) => s + e.pontos, 0)).toBe(lista.reduce((s, x) => s + x.pontos, 0));
  });
});

describe('A.6 · recordes por extenso', () => {
  it('VGC do mês, maior venda e visitas da semana', () => {
    expect(textoDoRecorde({ tipo: 'vgc_mes', nome: 'Ana', valor: 52500, periodo: '2026-04-01', edicao: null }))
      .toEqual({ titulo: 'Melhor mês de VGC', valor: expect.stringMatching(/R\$\s?52\.500/), quando: 'abril de 2026' });
    expect(textoDoRecorde({ tipo: 'maior_venda', nome: 'Ana', valor: 1500000, periodo: '2026-09-12', edicao: null }).quando).toBe('12/09/2026');
    expect(textoDoRecorde({ tipo: 'visitas_semana', nome: 'Ana', valor: 1, periodo: '2026-09-14', edicao: null }))
      .toMatchObject({ valor: '1 visita', quando: 'semana de 14/09/2026' });
  });
});
