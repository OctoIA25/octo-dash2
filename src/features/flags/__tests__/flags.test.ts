/**
 * A.3 · o que a tela escreve e soma. A classificação é do banco
 * (supabase/tests/flags_do_corretor.test.sql).
 */
import { describe, expect, it } from 'vitest';
import { caminhoInvalido, limparCaminhos, mixDaCasa, porEquipe, textoDaFalta, type PessoaComFlag } from '../flags';

const pessoa = (o: Partial<PessoaComFlag> = {}): PessoaComFlag => ({
  user_id: Math.random().toString(36), nome: 'X', equipe: 'Lançamentos', atuacao: 'lancamentos',
  metricas: { vendas: 0, visitas: 0, captacoes: 0 }, flag: 'vermelho', proximo: 'amarelo', falta: { vendas: 1 }, antes: null, ...o,
});

describe('"falta para subir" em português', () => {
  it('uma unidade de uma métrica: singular', () => {
    expect(textoDaFalta({ flag: 'vermelho', proximo: 'amarelo', falta: { vendas: 1 } })).toBe('falta 1 venda para o amarelo');
  });
  it('várias unidades ou várias métricas: plural, na ordem da tabela', () => {
    expect(textoDaFalta({ flag: 'vermelho', proximo: 'amarelo', falta: { visitas: 2 } })).toBe('faltam 2 visitas para o amarelo');
    expect(textoDaFalta({ flag: 'amarelo', proximo: 'verde', falta: { captacoes: 1, vendas: 1, visitas: 3 } }))
      .toBe('faltam 1 venda, 3 visitas e 1 captação para o verde');
  });
  it('verde, topo sem régua acima ou sem régua: "—"', () => {
    expect(textoDaFalta({ flag: 'verde', proximo: null, falta: null })).toBe('—');
    expect(textoDaFalta({ flag: 'amarelo', proximo: null, falta: null })).toBe('—');
    expect(textoDaFalta({ flag: null, proximo: null, falta: null })).toBe('—');
  });
});

describe('o mix da casa', () => {
  it('soma 100% mesmo quando cada fatia é dízima', () => {
    const mix = mixDaCasa([pessoa({ flag: 'verde' }), pessoa({ flag: 'amarelo' }), pessoa({ flag: 'vermelho' })]);
    expect(mix.percentual.verde + mix.percentual.amarelo + mix.percentual.vermelho).toBe(100);
    expect(mix.contagem).toEqual({ verde: 1, amarelo: 1, vermelho: 1 });
  });
  it('7 pessoas (1/2/4): 14 + 29 + 57 = 100', () => {
    const ps = [pessoa({ flag: 'verde' }), ...[1, 2].map(() => pessoa({ flag: 'amarelo' })), ...[1, 2, 3, 4].map(() => pessoa())];
    expect(mixDaCasa(ps).percentual).toEqual({ verde: 14, amarelo: 29, vermelho: 57 });
  });
  it('sem atuação e sem régua ficam fora do percentual, contados à parte', () => {
    const mix = mixDaCasa([pessoa({ flag: 'verde' }), pessoa({ atuacao: null, flag: null }), pessoa({ flag: null })]);
    expect(mix).toMatchObject({ classificados: 1, semAtuacao: 1, semRegua: 1, percentual: { verde: 100, amarelo: 0, vermelho: 0 } });
  });
  it('ninguém classificado: zeros, não NaN', () => {
    expect(mixDaCasa([pessoa({ flag: null })]).percentual).toEqual({ verde: 0, amarelo: 0, vermelho: 0 });
  });
});

describe('por equipe', () => {
  it('soma igual à lista por corretor', () => {
    const ps = [
      pessoa({ flag: 'verde', metricas: { vendas: 2, visitas: 1, captacoes: 0 } }),
      pessoa({ metricas: { vendas: 0, visitas: 3, captacoes: 0 } }),
      pessoa({ equipe: 'Prontos', atuacao: null, flag: null, metricas: { vendas: 0, visitas: 0, captacoes: 4 } }),
    ];
    const linhas = porEquipe(ps);
    expect(linhas.map((l) => l.equipe)).toEqual(['Lançamentos', 'Prontos']);
    expect(linhas[0]).toMatchObject({ corretores: 2, contagem: { verde: 1, amarelo: 0, vermelho: 1 }, naoClassificados: 0, metricas: { vendas: 2, visitas: 4, captacoes: 0 } });
    expect(linhas[1]).toMatchObject({ corretores: 1, naoClassificados: 1, metricas: { captacoes: 4 } });
    expect(linhas.reduce((s, l) => s + l.corretores, 0)).toBe(ps.length);
  });
});

describe('a régua no editor', () => {
  it('campo vazio sai do caminho; caminho vazio sai da lista', () => {
    expect(limparCaminhos([{ vendas: 2, visitas: undefined }, {}, { visitas: 8, vendas: 1 }])).toEqual([{ vendas: 2 }, { vendas: 1, visitas: 8 }]);
  });
  it('a mesma regra do CHECK do banco: inteiro de 1 a 999', () => {
    expect(caminhoInvalido({ vendas: 2 })).toBeNull();
    expect(caminhoInvalido({ vendas: 2.5 })).not.toBeNull();
    expect(caminhoInvalido({ visitas: 1000 })).not.toBeNull();
  });
});
