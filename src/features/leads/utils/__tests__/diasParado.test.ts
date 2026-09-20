/**
 * O selo "dias parado".
 *
 * O caso que estes testes existem para travar é o primeiro: lead SEM
 * movimentação registrada não é lead parado há zero dias. São 1.249 dos 1.681
 * leads ativos da Lotus hoje, e afirmar "0 d parado" neles seria uma mentira
 * sobre 74% do quadro — a mesma família de defeito que fez "Visitas" mostrar
 * zero para todo corretor desde sempre.
 */
import { describe, it, expect } from 'vitest';
import { seloDeParado, diasDesde, LIMITES } from '../diasParado';

const AGORA = Date.parse('2026-09-20T12:00:00-03:00');
const haDias = (d: number) => new Date(AGORA - d * 86_400_000).toISOString();

describe('sem registro não é zero', () => {
  it('lead sem movimentação nenhuma não ganha selo', () => {
    expect(seloDeParado(null, null, AGORA)).toBeNull();
    expect(seloDeParado(undefined, undefined, AGORA)).toBeNull();
  });

  it('data inválida não vira "NaN d parado"', () => {
    expect(seloDeParado('nao-e-data', 'evento', AGORA)).toBeNull();
    expect(diasDesde('nao-e-data', AGORA)).toBeNull();
  });
});

describe('as faixas combinadas: 3 / 7 / 15', () => {
  it('abaixo de 3 dias NÃO ganha selo — senão vira paisagem em todo card', () => {
    expect(seloDeParado(haDias(0), 'evento', AGORA)).toBeNull();
    expect(seloDeParado(haDias(2), 'evento', AGORA)).toBeNull();
  });

  it('exatamente 3 dias já acende, em atenção', () => {
    const s = seloDeParado(haDias(LIMITES.atencao), 'evento', AGORA);
    expect(s?.faixa).toBe('atencao');
    expect(s?.texto).toBe('3 d parado');
  });

  it('6 dias ainda é atenção; 7 vira alerta', () => {
    expect(seloDeParado(haDias(6), 'evento', AGORA)?.faixa).toBe('atencao');
    expect(seloDeParado(haDias(7), 'evento', AGORA)?.faixa).toBe('alerta');
  });

  it('14 dias ainda é alerta; 15 vira crítico', () => {
    expect(seloDeParado(haDias(14), 'evento', AGORA)?.faixa).toBe('alerta');
    expect(seloDeParado(haDias(15), 'evento', AGORA)?.faixa).toBe('critico');
  });

  it('cada faixa tem cor própria — o selo precisa ser lido de relance', () => {
    const cores = [3, 7, 15].map((d) => seloDeParado(haDias(d), 'evento', AGORA)?.classe);
    expect(new Set(cores).size).toBe(3);
  });
});

describe('o selo se explica', () => {
  it('diz de onde contou, porque são três fontes diferentes', () => {
    expect(seloDeParado(haDias(5), 'toque', AGORA)?.explicacao).toMatch(/último toque do corretor/);
    expect(seloDeParado(haDias(5), 'conversa', AGORA)?.explicacao).toMatch(/última mensagem trocada/);
    expect(seloDeParado(haDias(5), 'evento', AGORA)?.explicacao).toMatch(/última movimentação registrada/);
  });

  it('fonte desconhecida não deixa a explicação sem sentido', () => {
    // Se o banco ganhar uma quarta fonte e a tela não souber o nome, o pior
    // seria o selo explicar-se com "undefined".
    const s = seloDeParado(haDias(5), 'fonte_nova', AGORA);
    expect(s?.explicacao).not.toMatch(/undefined/);
    expect(s?.explicacao).toMatch(/Sem movimentação há 5 dias/);
  });
});

describe('data no futuro', () => {
  it('não vira número negativo', () => {
    // Já apareceu nesta base: um tempo de resposta de −5.871 minutos.
    expect(diasDesde(new Date(AGORA + 3 * 86_400_000).toISOString(), AGORA)).toBe(0);
    expect(seloDeParado(new Date(AGORA + 3 * 86_400_000).toISOString(), 'evento', AGORA)).toBeNull();
  });
});
