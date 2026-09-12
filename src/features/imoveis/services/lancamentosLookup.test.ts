import { describe, it, expect } from 'vitest';
import { acharLancamentoPorCodigo } from './lancamentosLookup';

const LANCAMENTOS = [
  { id: '1', nome: 'Reserva Castanheira', codigos: ['L012', 'L023'] },
  { id: '2', nome: 'Vigóre', codigos: ['L014'] },
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

  it('casa o código da planilha que o ZAP manda', () => {
    expect(acharLancamentoPorCodigo('L014', LANCAMENTOS)?.id).toBe('2');
    expect(acharLancamentoPorCodigo('l014 ', LANCAMENTOS)?.id).toBe('2');
  });

  it('o mesmo empreendimento responde por todos os anúncios dele', () => {
    expect(acharLancamentoPorCodigo('L012', LANCAMENTOS)?.id).toBe('1');
    expect(acharLancamentoPorCodigo('L023', LANCAMENTOS)?.id).toBe('1');
  });

  it('código em dois cadastros não linka ninguém', () => {
    const duplicado = [...LANCAMENTOS, { id: '5', nome: 'Outro', codigos: ['L014'] }];
    expect(acharLancamentoPorCodigo('L014', duplicado)).toBeUndefined();
  });

  it('código casa inteiro, nunca por pedaço', () => {
    expect(acharLancamentoPorCodigo('L01', LANCAMENTOS)).toBeUndefined();
    expect(acharLancamentoPorCodigo('L0140', LANCAMENTOS)).toBeUndefined();
  });

  it('código de catálogo não vira lançamento', () => {
    expect(acharLancamentoPorCodigo('AP001', LANCAMENTOS)).toBeUndefined();
    expect(acharLancamentoPorCodigo('', LANCAMENTOS)).toBeUndefined();
  });
});
