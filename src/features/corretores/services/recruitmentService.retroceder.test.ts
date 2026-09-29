/**
 * retrocederEtapa grava UM evento `estagio_retrocedido` com { de, para,
 * responsavel } — o trigger do banco (20260929_recrut_retroceder_etapa) é quem
 * zera os ts_* das etapas posteriores e escreve o estágio. Aqui só se cobra o
 * que sai daqui: o evento certo e a releitura da linha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chamadas, resultados } = vi.hoisted(() => ({
  chamadas: [] as { tabela: string; metodo: string; args: unknown[] }[],
  resultados: {} as Record<string, unknown>,
}));

/** Encadeamento PostgREST que registra cada chamada e resolve no resultado da tabela. */
const cadeia = (tabela: string): unknown =>
  new Proxy(Promise.resolve(resultados[tabela]), {
    get: (alvo, prop) =>
      prop === 'then'
        ? alvo.then.bind(alvo)
        : (...args: unknown[]) => { chamadas.push({ tabela, metodo: String(prop), args }); return cadeia(tabela); },
  });

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (tabela: string) => cadeia(tabela), auth: { getUser: vi.fn() } },
}));

import { recruitmentService } from './recruitmentService';

describe('retrocederEtapa', () => {
  beforeEach(() => {
    chamadas.length = 0;
    resultados.recrut_candidato = { data: { id: 'c1', estagio: 'onboard', canal: 'indicacao' }, error: null };
    resultados.recrut_evento = { data: null, error: null };
  });

  it('grava o evento com de/para/responsavel e devolve a linha relida (estagio traduzido)', async () => {
    resultados.recrut_candidato = { data: { id: 'c1', estagio: 'qualificado', canal: 'indicacao' }, error: null };
    const r = await recruitmentService.retrocederEtapa('c1', 'qualificado', 'erick@lotus.com');

    const insert = chamadas.find((c) => c.tabela === 'recrut_evento' && c.metodo === 'insert');
    expect(insert?.args[0]).toEqual({
      candidato_id: 'c1',
      tipo: 'estagio_retrocedido',
      autor: 'erick',
      payload: { de: 'qualificado', para: 'qualificado', responsavel: 'erick@lotus.com' },
    });
    expect(r.status).toBe('Qualificado');
    expect(r.fonte).toBe('Indicação');
  });

  it('o `de` do payload é o estágio atual lido antes do evento', async () => {
    await recruitmentService.retrocederEtapa('c1', 'lead');
    const insert = chamadas.find((c) => c.tabela === 'recrut_evento' && c.metodo === 'insert');
    expect((insert?.args[0] as { payload: { de: string; responsavel: string } }).payload.de).toBe('onboard');
    expect((insert?.args[0] as { payload: { responsavel: string } }).payload.responsavel).toBe('Sistema');
  });

  it('recusa `para` fora do funil sem tocar o banco', async () => {
    await expect(recruitmentService.retrocederEtapa('c1', 'perdido')).rejects.toThrow(/perdido/i);
    expect(chamadas.filter((c) => c.metodo === 'insert')).toHaveLength(0);
  });

  it('constraint de coordenador ao reabrir direto em Onboard vira a mensagem da regra D062', async () => {
    resultados.recrut_evento = { data: null, error: { code: '23514', message: 'onboard_exige_coordenador' } };
    await expect(recruitmentService.retrocederEtapa('c1', 'onboard')).rejects.toThrow(/Coordenador/);
  });
});
