/**
 * Pina a porta JS do server (reportMirror/motor.js) ao motor TS oficial.
 * Se as regras Lotus mudarem aqui e a porta não acompanhar, este teste quebra.
 */
import { describe, it, expect } from 'vitest';
import { calcularComissao, NIVEIS, type Nivel } from './commissionRules';
import { calcularLinhaEspelho, derivarComissaoTotal } from '../../../server/reportMirror/motor.js';
import { calcularComissaoForecast } from '../forecast/utils/comissao';

const niveis = Object.keys(NIVEIS) as Nivel[];
const valores = [100_000, 350_000, 635_000.18, 2_650_000];

describe('paridade motor espelho × commissionRules (lançamento sem parceria)', () => {
  for (const nivelCorretor of niveis) {
    for (const nivelLider of [...niveis, null]) {
      for (const vgv of valores) {
        it(`corretor=${nivelCorretor} lider=${nivelLider ?? 'nenhum'} vgv=${vgv}`, () => {
          const comissao = vgv * 0.035;
          const oficial = calcularComissao({
            tipo: 'lancamento',
            comissaoTotal: comissao,
            intermediacao: {
              nome: 'Corretor',
              nivel: nivelCorretor,
              liderDireto: nivelLider ? { nome: 'Lider', nivel: nivelLider } : null,
            },
          });
          const porta = calcularLinhaEspelho({
            comissao,
            corretor: { nome: 'Corretor', nivel: nivelCorretor },
            lider: nivelLider ? { nome: 'Lider', nivel: nivelLider } : null,
          });

          if (oficial.bloqueio) {
            expect(porta.bloqueio).toBe(oficial.bloqueio.codigo);
            return;
          }
          expect(porta.bloqueio).toBeNull();
          const por = (papel: string) =>
            oficial.linhas.filter((l) => l.papel === papel).reduce((a, l) => a + l.valor, 0);
          expect(porta.corretorValor).toBeCloseTo(por('corretor'), 6);
          expect(porta.liderValor).toBeCloseTo(por('lider'), 6);
          expect(porta.lotusValor).toBeCloseTo(por('lotus'), 6);
        });
      }
    }
  }
});

describe('paridade motor espelho × commissionRules (sem corretor)', () => {
  it('sem corretor: ponta inteira vai pra Lotus, sem bloqueio', () => {
    const comissao = 350_000 * 0.035;
    const oficial = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: comissao,
      intermediacao: null,
    });
    const porta = calcularLinhaEspelho({ comissao, corretor: null, lider: null });

    expect(oficial.bloqueio).toBeNull();
    expect(porta.bloqueio).toBeNull();
    const lotusOficial = oficial.linhas.filter((l) => l.papel === 'lotus').reduce((a, l) => a + l.valor, 0);
    expect(porta.corretorValor).toBe(0);
    expect(porta.liderValor).toBe(0);
    expect(porta.lotusValor).toBeCloseTo(lotusOficial, 6);
  });
});

describe('paridade derivarComissaoTotal × calcularComissaoForecast', () => {
  it('lançamento 3,5%, terceiros 6%, override vence', () => {
    expect(derivarComissaoTotal(800_000, ['lancamento'], null)).toEqual(
      calcularComissaoForecast(800_000, ['lancamento']),
    );
    expect(derivarComissaoTotal(800_000, 'Lançamento', null)).toEqual(
      calcularComissaoForecast(800_000, 'Lançamento'),
    );
    expect(derivarComissaoTotal(800_000, null, null)).toEqual(
      calcularComissaoForecast(800_000, null),
    );
    expect(derivarComissaoTotal(800_000, ['lancamento'], 42_000)).toEqual({ percentual: null, valor: 42_000 });
  });
});
