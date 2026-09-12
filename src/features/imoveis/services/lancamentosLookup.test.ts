import { describe, it, expect } from 'vitest';
import { acharLancamentoPorCodigo } from './lancamentosLookup';

const LANCAMENTOS = [
  { id: '1', nome: 'Reserva Castanheira' },
  { id: '2', nome: 'Vigóre' },
  { id: '3', nome: 'Epic' },
  { id: '4', nome: 'Vila Itália' },
];

describe('acharLancamentoPorCodigo', () => {
  it('casa o nome que o Meta manda como código', () => {
    expect(acharLancamentoPorCodigo('RESERVA CASTANHEIRA', LANCAMENTOS)?.id).toBe('1');
  });

  it('ignora acento e o prefixo do anúncio', () => {
    expect(acharLancamentoPorCodigo('RESIDENCIAL VIGORE', LANCAMENTOS)?.id).toBe('2');
  });

  it('não casa nome curto dentro de outra palavra', () => {
    expect(acharLancamentoPorCodigo('EPICENTRO 12', LANCAMENTOS)).toBeUndefined();
  });

  it('código de catálogo não vira lançamento', () => {
    expect(acharLancamentoPorCodigo('AP001', LANCAMENTOS)).toBeUndefined();
    expect(acharLancamentoPorCodigo('', LANCAMENTOS)).toBeUndefined();
  });
});
