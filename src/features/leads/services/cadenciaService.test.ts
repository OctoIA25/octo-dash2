/**
 * Marcar e desmarcar retorno — os dois defeitos do primeiro uso real.
 *
 * O botão subiu e deu "Não foi possível marcar o retorno." na primeira
 * tentativa. Duas coisas, e a segunda escondeu a primeira:
 *
 *  1. o POST não mandava `?tenantId=`. Para o dono da plataforma,
 *     `resolveTenant` devolve `tenant_required_for_owner` (400) sem ele — e o
 *     GET irmão, que funciona, sempre mandou.
 *  2. a mensagem de erro desconhecido engolia o código, então o print da tela
 *     não dizia nada e custou uma ida e volta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: Array<{ url: string; init?: RequestInit }> = [];
let resposta: { ok: boolean; status: number; body: unknown } = {
  ok: true, status: 201,
  body: { ok: true, id: 'f1', created: true, agendado_para: '2026-09-28T13:00:00.000Z', ajustado: false },
};

vi.mock('@/features/comunicacao/services/authedFetch', () => ({
  authedFetch: (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    return Promise.resolve({
      ok: resposta.ok,
      status: resposta.status,
      json: () => Promise.resolve(resposta.body),
    } as Response);
  },
}));

const { marcarRetorno, desmarcarRetorno } = await import('./cadenciaService');

beforeEach(() => {
  chamadas.length = 0;
  resposta = {
    ok: true, status: 201,
    body: { ok: true, id: 'f1', created: true, agendado_para: '2026-09-28T13:00:00.000Z', ajustado: false },
  };
});

describe('o tenant vai na query, como no GET irmão', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. Sem isto o botão só funciona para quem tem
   * uma imobiliária só — e quebra justamente para o dono da plataforma, que
   * foi quem testou primeiro.
   */
  it('marcar manda ?tenantId= quando há tenant', async () => {
    await marcarRetorno('lead-1', '2026-09-28T13:00:00.000Z', 'teste', null, 'casa-1');
    expect(chamadas[0].url).toContain('tenantId=casa-1');
  });

  it('desmarcar manda também — o cancelamento passa pela mesma rota', async () => {
    resposta = { ok: true, status: 200, body: { ok: true, cancelado: 'f1' } };
    await desmarcarRetorno('lead-1', 'f1', 'casa-1');
    expect(chamadas[0].url).toContain('tenantId=casa-1');
  });

  /* 'owner' é a visão de dono sem casa escolhida: não é um tenant de verdade. */
  it('não manda tenant nenhum quando é a visão de dono', async () => {
    await marcarRetorno('lead-1', '2026-09-28T13:00:00.000Z', 'teste', null, 'owner');
    expect(chamadas[0].url).not.toContain('tenantId');
  });
});

describe('erro desconhecido diz o código', () => {
  it('o código aparece na mensagem, para o print da tela bastar', async () => {
    resposta = { ok: false, status: 400, body: { ok: false, error: 'tenant_required_for_owner' } };
    await expect(marcarRetorno('lead-1', '2026-09-28T13:00:00.000Z', 'x')).rejects.toThrow(
      /Escolha a imobiliária/,
    );

    resposta = { ok: false, status: 500, body: { ok: false, error: 'algo_novo' } };
    await expect(marcarRetorno('lead-1', '2026-09-28T13:00:00.000Z', 'x')).rejects.toThrow(
      /algo_novo/,
    );
  });

  it('erro conhecido continua com texto humano, sem código', async () => {
    resposta = { ok: false, status: 422, body: { ok: false, error: 'quando_no_passado' } };
    await expect(marcarRetorno('lead-1', '2026-01-01T00:00:00.000Z', 'x')).rejects.toThrow(
      'Esse horário já passou.',
    );
  });
});
