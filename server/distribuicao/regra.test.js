/**
 * De quem é este lead — a regra como consulta.
 *
 * Decidido em 19/09/2026: a Lia continua distribuindo e o Octo responde. Estes
 * testes travam as quatro decisões daquele dia, e a mais importante delas é a
 * que DIVERGE do plano: captador que não atende em 1h manda o lead para a
 * ROLETA, não para o bolsão.
 */
import { describe, it, expect } from 'vitest';
import { decidirDestino, proximoDaRoleta, podeReceber, tipoDoLead, foiAtendido, expirou, MOTIVOS } from './regra.js';

const c = (id, extra = {}) => ({ id, ...extra });
const FILA = [c('ana'), c('bruno'), c('carla')];

describe('tipoDoLead', () => {
  it('reconhece lançamento e terceiros, com ou sem acento', () => {
    expect(tipoDoLead({ tipoImovel: 'lançamento' })).toBe('lancamento');
    expect(tipoDoLead({ tipo_imovel: 'LANCAMENTO' })).toBe('lancamento');
    expect(tipoDoLead({ tipoImovel: 'Catálogo' })).toBe('terceiros');
  });

  it('sem tipo declarado, o código do imóvel decide', () => {
    expect(tipoDoLead({ codigoImovel: 'AP0961' })).toBe('terceiros');
    expect(tipoDoLead({})).toBe('indefinido');
  });
});

describe('podeReceber', () => {
  it('pausado, no limite ou sem permissão não recebe', () => {
    expect(podeReceber(c('x'))).toBe(true);
    expect(podeReceber(c('x', { pausado: true }))).toBe(false);
    expect(podeReceber(c('x', { noLimite: true }))).toBe(false);
    expect(podeReceber(c('x', { semPermissao: true }))).toBe(false);
    expect(podeReceber(null)).toBe(false);
  });
});

describe('a roleta é rodízio em ordem, não sorteio', () => {
  it('cada um recebe na sua vez, e a fila dá a volta', () => {
    expect(proximoDaRoleta(FILA, -1).corretor.id).toBe('ana');
    expect(proximoDaRoleta(FILA, 0).corretor.id).toBe('bruno');
    expect(proximoDaRoleta(FILA, 1).corretor.id).toBe('carla');
    expect(proximoDaRoleta(FILA, 2).corretor.id).toBe('ana');
  });

  it('quem está pausado é PULADO e MANTÉM a vez', () => {
    const fila = [c('ana'), c('bruno', { pausado: true }), c('carla')];
    // Depois da Ana viria o Bruno; ele está pausado, então vai para a Carla.
    const r = proximoDaRoleta(fila, 0);
    expect(r.corretor.id).toBe('carla');
    // E o ponteiro passa a ser o da Carla — o Bruno não "gastou" a vez dele.
    expect(r.posicao).toBe(2);
  });

  it('quem está no limite de leads também é pulado', () => {
    const fila = [c('ana'), c('bruno', { noLimite: true }), c('carla')];
    expect(proximoDaRoleta(fila, 0).corretor.id).toBe('carla');
  });

  it('quem não tem permissão sai da fila, não só pula a vez', () => {
    const fila = [c('ana'), c('bruno', { semPermissao: true }), c('carla')];
    // Com o Bruno fora, a fila tem dois: depois da Ana (0) vem a Carla (1).
    expect(proximoDaRoleta(fila, 0).corretor.id).toBe('carla');
    expect(proximoDaRoleta(fila, 1).corretor.id).toBe('ana');
  });

  it('ninguém disponível devolve null, em vez de escolher quem não podia', () => {
    expect(proximoDaRoleta([c('a', { pausado: true }), c('b', { noLimite: true })], -1)).toBeNull();
    expect(proximoDaRoleta([], 0)).toBeNull();
    expect(proximoDaRoleta(null, 0)).toBeNull();
  });
});

describe('imóvel de TERCEIROS', () => {
  it('vai para o captador do imóvel', () => {
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961' }, captador: c('ana'), participantes: FILA });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'ana', motivo: MOTIVOS.CAPTADOR });
  });

  it('SEM captador cadastrado vai para a roleta geral — decisão de 19/09', () => {
    // São 7 dos 29 imóveis da Lotus, medido no mesmo dia.
    const r = decidirDestino({ lead: { codigoImovel: 'AP0961' }, captador: null, participantes: FILA, ultimaPosicao: 0 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'bruno', motivo: MOTIVOS.SEM_CAPTADOR });
  });

  it('captador pausado NÃO segura o lead: ele vai para a roleta', () => {
    const r = decidirDestino({
      lead: { codigoImovel: 'AP0961' },
      captador: c('ana', { pausado: true }),
      participantes: FILA,
      ultimaPosicao: 0,
    });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'bruno', motivo: MOTIVOS.CAPTADOR_INDISPONIVEL });
  });

  it('o motivo distingue "sem captador" de "captador indisponível"', () => {
    const sem = decidirDestino({ lead: { codigoImovel: 'X' }, captador: null, participantes: FILA });
    const ind = decidirDestino({ lead: { codigoImovel: 'X' }, captador: c('ana', { noLimite: true }), participantes: FILA });
    expect(sem.motivo).not.toBe(ind.motivo);
  });
});

describe('LANÇAMENTO', () => {
  it('a Lia atende primeiro — não vai para corretor nenhum', () => {
    const r = decidirDestino({ lead: { tipoImovel: 'lancamento' }, participantes: FILA });
    expect(r).toMatchObject({ destino: 'lia', corretorId: null, motivo: MOTIVOS.LIA_PRIMEIRO });
  });

  it('quando a Lia passa, entra a roleta em ordem', () => {
    const r = decidirDestino({ lead: { tipoImovel: 'lancamento', liaPassou: true }, participantes: FILA, ultimaPosicao: 1 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'carla', motivo: MOTIVOS.ROLETA });
  });

  it('o captador do imóvel NÃO tem preferência em lançamento', () => {
    const r = decidirDestino({
      lead: { tipoImovel: 'lancamento', liaPassou: true },
      captador: c('ana'),
      participantes: FILA,
      ultimaPosicao: 0,
    });
    expect(r.corretorId).toBe('bruno');
  });
});

describe('lead que não bate em nenhuma regra', () => {
  it('cai na roleta geral', () => {
    const r = decidirDestino({ lead: {}, participantes: FILA, ultimaPosicao: -1 });
    expect(r).toMatchObject({ destino: 'corretor', corretorId: 'ana', tipo: 'indefinido' });
  });

  it('sem ninguém disponível, a resposta é "ninguém" — e não um chute', () => {
    const r = decidirDestino({ lead: {}, participantes: [c('a', { pausado: true })] });
    expect(r).toMatchObject({ destino: 'ninguem', corretorId: null, motivo: MOTIVOS.SEM_CORRETOR });
  });
});

describe('"atendido" é mensagem ou atividade — não abrir a ficha', () => {
  it('mensagem enviada conta', () => {
    expect(foiAtendido({ mensagemEnviadaEm: '2026-09-19T12:00:00Z' })).toBe(true);
  });

  it('atividade agendada conta', () => {
    expect(foiAtendido({ atividadeAgendadaEm: '2026-09-19T12:00:00Z' })).toBe(true);
  });

  it('arrastar o card no kanban NÃO conta', () => {
    // Foi exatamente essa confusão que fez o tempo de resposta medir o
    // arrastar de um card em vez da conversa.
    expect(foiAtendido({ first_response_at: '2026-09-19T12:00:00Z' })).toBe(false);
    expect(foiAtendido({})).toBe(false);
    expect(foiAtendido(null)).toBe(false);
  });
});

describe('expirou', () => {
  it('compara o agora com o prazo já calculado pela janela', () => {
    const prazo = new Date('2026-09-19T13:00:00Z');
    expect(expirou({ prazo, agora: new Date('2026-09-19T12:59:00Z') })).toBe(false);
    expect(expirou({ prazo, agora: new Date('2026-09-19T13:01:00Z') })).toBe(true);
  });

  it('sem prazo válido, NÃO expira — não tira lead de ninguém por dado ruim', () => {
    expect(expirou({ prazo: null, agora: new Date() })).toBe(false);
    expect(expirou({ prazo: new Date('nada'), agora: new Date() })).toBe(false);
  });
});
