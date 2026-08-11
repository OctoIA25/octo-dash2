import { describe, it, expect } from 'vitest';
import {
  resolverCaptador,
  matchCaptadorFilter,
  CAPTADOR_FILTRO_TODOS,
  CAPTADOR_FILTRO_SEM,
} from './captador';

describe('resolverCaptador', () => {
  const captadoresPorId = { 'user-1': 'Gabriele Fávaro' };
  const corretorPorCodigo = { AP001: 'Fernanda Souza' };

  it('prioriza o captador_id explícito sobre o mapa do XML', () => {
    expect(
      resolverCaptador({
        captadorId: 'user-1',
        captadoresPorId,
        corretorPorCodigo,
        codigo: 'AP001',
        corretorNomeXml: 'Alguém do XML',
      }),
    ).toBe('Gabriele Fávaro');
  });

  it('cai no mapa de imoveis_corretores quando não há captador_id', () => {
    expect(
      resolverCaptador({
        captadorId: null,
        captadoresPorId,
        corretorPorCodigo,
        codigo: 'AP001',
        corretorNomeXml: 'Alguém do XML',
      }),
    ).toBe('Fernanda Souza');
  });

  // Este é o bug atual: hoje ImoveisPage sobrescreve corretor_nome
  // incondicionalmente e apaga o nome que veio do XML.
  it('cai no corretor_nome do XML quando não há captador_id nem mapa', () => {
    expect(
      resolverCaptador({
        captadorId: null,
        captadoresPorId,
        corretorPorCodigo: {},
        codigo: 'AP001',
        corretorNomeXml: 'Ana e Karla',
      }),
    ).toBe('Ana e Karla');
  });

  it('retorna null quando não há nenhuma fonte', () => {
    expect(
      resolverCaptador({
        captadorId: null,
        captadoresPorId: {},
        corretorPorCodigo: {},
        codigo: null,
        corretorNomeXml: null,
      }),
    ).toBeNull();
  });

  it('ignora captador_id que não corresponde a nenhum membro conhecido', () => {
    expect(
      resolverCaptador({
        captadorId: 'user-removido',
        captadoresPorId,
        corretorPorCodigo,
        codigo: 'AP001',
        corretorNomeXml: null,
      }),
    ).toBe('Fernanda Souza');
  });

  it('normaliza o código para maiúsculas ao consultar o mapa', () => {
    expect(
      resolverCaptador({
        captadorId: null,
        captadoresPorId,
        corretorPorCodigo,
        codigo: ' ap001 ',
        corretorNomeXml: null,
      }),
    ).toBe('Fernanda Souza');
  });
});

describe('matchCaptadorFilter', () => {
  it('aceita tudo no filtro "todos"', () => {
    expect(matchCaptadorFilter(null, CAPTADOR_FILTRO_TODOS)).toBe(true);
    expect(matchCaptadorFilter('Fernanda Souza', CAPTADOR_FILTRO_TODOS)).toBe(true);
  });

  it('isola os sem captador', () => {
    expect(matchCaptadorFilter(null, CAPTADOR_FILTRO_SEM)).toBe(true);
    expect(matchCaptadorFilter('Fernanda Souza', CAPTADOR_FILTRO_SEM)).toBe(false);
  });

  it('casa por nome exato', () => {
    expect(matchCaptadorFilter('Fernanda Souza', 'Fernanda Souza')).toBe(true);
    expect(matchCaptadorFilter('Gabriele Fávaro', 'Fernanda Souza')).toBe(false);
    expect(matchCaptadorFilter(null, 'Fernanda Souza')).toBe(false);
  });
});
