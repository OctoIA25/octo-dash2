/**
 * Geocodificação pelo Nominatim (P2.6).
 *
 * Nenhum teste toca a internet: o `fetch` é injetado. O que se prende aqui é o
 * que a função faz com resposta ruim — e resposta ruim é a regra, não a
 * exceção, quando o endereço vem de cadastro feito à mão.
 */

import { describe, it, expect, vi } from 'vitest';
import { buscarCandidatos, esperarAVez, geocodificar, lerResposta, montarUrl, USER_AGENT } from './nominatim.js';

describe('montarUrl', () => {
  it('pede uma resposta só, e só do Brasil', () => {
    const u = new URL(montarUrl('Avenida Paulista, 1578, São Paulo'));
    expect(u.searchParams.get('countrycodes')).toBe('br');
    expect(u.searchParams.get('limit')).toBe('1');
    expect(u.searchParams.get('q')).toBe('Avenida Paulista, 1578, São Paulo');
  });

  it('endereço vazio não vira consulta', () => {
    expect(montarUrl('')).toBeNull();
    expect(montarUrl('   ')).toBeNull();
    expect(montarUrl(null)).toBeNull();
  });
});

describe('lerResposta', () => {
  it('lê a primeira resposta', () => {
    expect(lerResposta([{ lat: '-23.5614', lon: '-46.6559', place_rank: 30 }])).toEqual({
      lat: -23.5614,
      lng: -46.6559,
      aproximado: false,
    });
  });

  /**
   * Medido em 02/10: os 21 imóveis da Lotus "achados" voltaram com place_rank
   * 26 — a rua, não a porta. Gravados como exatos, o 1220 e o 1400 da mesma
   * rua dividiam o mesmo pino e ninguém sabia que precisava corrigir.
   */
  it('achou só a rua: o pino é aproximado', () => {
    expect(lerResposta([{ lat: '-23.18967', lon: '-46.90559', place_rank: 26 }]).aproximado).toBe(true);
    expect(lerResposta([{ lat: '-23.18967', lon: '-46.90559', place_rank: 30 }]).aproximado).toBe(false);
  });

  it('vazio é "não achei", não é zero', () => {
    expect(lerResposta([])).toBeNull();
    expect(lerResposta(null)).toBeNull();
  });

  /**
   * Coordenada fora do Brasil é resposta errada, não resposta ruim: "Rua
   * Augusta" sem país acha Portugal. Um pino no lugar errado é pior que pino
   * nenhum — ninguém desconfia de um mapa.
   */
  it('recusa coordenada fora do Brasil', () => {
    expect(lerResposta([{ lat: '38.7223', lon: '-9.1393' }])).toBeNull(); // Lisboa
    expect(lerResposta([{ lat: '0', lon: '0' }])).toBeNull(); // golfo da Guiné
  });

  it('recusa número ilegível', () => {
    expect(lerResposta([{ lat: 'x', lon: '-46.6' }])).toBeNull();
    expect(lerResposta([{}])).toBeNull();
  });
});

describe('geocodificar', () => {
  const resposta = (json, ok = true, status = 200) =>
    vi.fn(async () => ({ ok, status, json: async () => json }));

  it('devolve a coordenada e se identifica ao OSM', async () => {
    const fetchImpl = resposta([{ lat: '-23.5', lon: '-46.6', place_rank: 30 }]);
    const r = await geocodificar('Avenida Paulista, São Paulo', { fetchImpl });
    expect(r).toEqual({ lat: -23.5, lng: -46.6, aproximado: false });
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe(USER_AGENT);
  });

  it('endereço não encontrado é erro nomeado, não exceção', async () => {
    expect(await geocodificar('Rua Que Não Existe', { fetchImpl: resposta([]) })).toEqual({
      erro: 'nao_encontrado',
    });
  });

  it('erro do serviço vira o código, para o relatório dizer o que houve', async () => {
    expect(await geocodificar('x', { fetchImpl: resposta(null, false, 429) })).toEqual({
      erro: 'nominatim_429',
    });
  });

  /** O script em massa precisa registrar a falha e seguir para o próximo. */
  it('queda de rede não interrompe a fila', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const r = await geocodificar('x', { fetchImpl });
    expect(r.erro).toContain('falha_de_rede');
    expect(r.lat).toBeUndefined();
  });

  it('endereço vazio nem chega a consultar', async () => {
    const fetchImpl = vi.fn();
    expect(await geocodificar('', { fetchImpl })).toEqual({ erro: 'endereco_vazio' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('buscarCandidatos', () => {
  const resposta = (json) => vi.fn(async () => ({ ok: true, status: 200, json: async () => json }));

  /** Há três trechos de "Rua Tiradentes" em Jundiaí: o corretor escolhe o dele. */
  it('devolve vários candidatos, com o nome que o corretor reconhece', async () => {
    const fetchImpl = resposta([
      { lat: '-23.1746', lon: '-46.8873', place_rank: 26, display_name: 'Rua Tiradentes, Vila Liberdade, Jundiaí, Região Sudeste, Brasil' },
      { lat: '38.72', lon: '-9.13', display_name: 'Lisboa' },
      { lat: '-23.1716', lon: '-46.8917', place_rank: 26, display_name: 'Rua Tiradentes, Vila Margarida, Jundiaí' },
    ]);
    const r = await buscarCandidatos('Rua Tiradentes, Jundiaí', { fetchImpl });
    expect(r.candidatos.map((c) => c.nome)).toEqual([
      'Rua Tiradentes, Vila Liberdade, Jundiaí',
      'Rua Tiradentes, Vila Margarida, Jundiaí',
    ]);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('limit')).toBe('5');
  });

  it('nada achado é lista vazia; serviço fora do ar é erro nomeado', async () => {
    expect(await buscarCandidatos('Rua X', { fetchImpl: resposta([]) })).toEqual({ candidatos: [] });
    const fora = vi.fn(async () => ({ ok: false, status: 503 }));
    expect(await buscarCandidatos('Rua X', { fetchImpl: fora })).toEqual({ erro: 'nominatim_503' });
  });
});

describe('esperarAVez', () => {
  /** Dez corretores buscando ao mesmo tempo viram uma fila, não dez req/s ao OSM. */
  it('quem chega junto espera a vaga seguinte', async () => {
    vi.useFakeTimers();
    try {
      const agora = Date.now() + 60_000; // longe de qualquer vaga já reservada
      let segundoPassou = false;
      await esperarAVez(agora);
      const segundo = esperarAVez(agora).then(() => { segundoPassou = true; });
      await vi.advanceTimersByTimeAsync(1000);
      expect(segundoPassou).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await segundo;
      expect(segundoPassou).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
