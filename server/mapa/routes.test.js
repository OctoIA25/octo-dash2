/**
 * Mapa interligado (P2.6) — geocodificação pelo servidor.
 *
 * O caso que importa é o último: **pino arrastado não volta para a posição
 * automática**. É assim que o plano define o item pronto, e é a única coisa que
 * a geocodificação nunca pode desfazer.
 */

import { describe, it, expect, vi } from 'vitest';
import { linhaDoResultado, registerMapaRoutes, TABELA_DO_TIPO } from './index.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const GESTOR = '11111111-1111-1111-1111-111111111111';
const PONTO = 'aaaaaaa1-1111-4111-a111-111111111111';

describe('linhaDoResultado', () => {
  const agora = new Date('2026-09-21T12:00:00Z');

  it('coordenada achada entra como automática e exata', () => {
    expect(linhaDoResultado({ lat: -23.5, lng: -46.6 }, 'exata', agora)).toEqual({
      latitude: -23.5,
      longitude: -46.6,
      geo_origem: 'automatica',
      geo_precisao: 'exata',
      geo_em: '2026-09-21T12:00:00.000Z',
      geo_erro: null,
    });
  });

  /**
   * Endereço montado só com bairro e cidade dá pino aproximado — e ele precisa
   * chegar à tela marcado. Pino aproximado sem aviso leva o corretor ao lugar
   * errado, e ninguém desconfia de um mapa.
   */
  it('endereço sem rua produz pino marcado como aproximado', () => {
    expect(linhaDoResultado({ lat: -23.5, lng: -46.6 }, 'aproximada', agora).geo_precisao).toBe('aproximada');
  });

  /**
   * `geo_em` é gravado na falha também: sem ele não dá para distinguir "nunca
   * foi tentado" de "tentado e não achado", e o script repetiria para sempre os
   * mesmos endereços impossíveis.
   */
  it('falha grava o motivo e a hora, sem coordenada', () => {
    expect(linhaDoResultado({ erro: 'nao_encontrado' }, 'exata', agora)).toEqual({
      geo_em: '2026-09-21T12:00:00.000Z',
      geo_erro: 'nao_encontrado',
    });
  });

  it('o erro anterior é limpo quando a coordenada aparece', () => {
    expect(linhaDoResultado({ lat: 1, lng: -50 }, 'exata', agora).geo_erro).toBeNull();
  });
});

describe('TABELA_DO_TIPO', () => {
  it('só os três tipos do plano, e nada mais', () => {
    expect(Object.keys(TABELA_DO_TIPO).sort()).toEqual(['condominio', 'imovel', 'lancamento']);
    expect(TABELA_DO_TIPO.lancamento).toBe('lancamentos');
    expect(TABELA_DO_TIPO.imovel).toBe('imoveis_locais');
  });
});

/** Coleta os handlers registrados para invocá-los direto, sem Express. */
function appFalso() {
  const rotas = new Map();
  return {
    post: (caminho, ...fns) => rotas.set(`POST ${caminho}`, fns),
    get: (caminho, ...fns) => rotas.set(`GET ${caminho}`, fns),
    async chamar(chave, req) {
      const res = {
        statusCode: 200,
        corpo: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.corpo = b; return this; },
      };
      for (const fn of rotas.get(chave)) {
        let seguiu = false;
        await fn(req, res, () => { seguiu = true; });
        if (!seguiu) return res;
      }
      return res;
    },
  };
}

function supabaseFalso({ fila = [], geoOrigem = null, role = 'admin' } = {}) {
  const updates = [];
  return {
    updates,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: GESTOR, email: 'gestor@x.com' } } })) },
    rpc: vi.fn(async () => ({ data: fila, error: null })),
    from(tabela) {
      const chain = {
        tabela,
        select: () => chain,
        eq: () => chain,
        // `resolveTenant` AGUARDA a cadeia direto, sem `.maybeSingle()`: sem
        // este `then` ele lê lista vazia e responde 403 antes da rota rodar.
        then: (r) =>
          Promise.resolve({
            data: tabela === 'tenant_memberships' ? [{ tenant_id: TENANT }] : [],
            error: null,
          }).then(r),
        maybeSingle: async () => ({
          data: tabela === 'tenant_memberships' ? { role } : { geo_origem: geoOrigem },
          error: null,
        }),
        update: (linha) => {
          updates.push({ tabela, linha });
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
      return chain;
    },
  };
}

const req = (body = {}) => ({
  headers: { authorization: 'Bearer jwt' },
  query: { tenantId: TENANT },
  params: {},
  body,
});

describe('POST /api/v1/mapa/geocodificar', () => {
  it('corretor não geocodifica o cadastro da imobiliária inteira', async () => {
    const app = appFalso();
    const sb = supabaseFalso({ role: 'corretor' });
    registerMapaRoutes(app, sb, { verbose: false });
    const res = await app.chamar('POST /api/v1/mapa/geocodificar', req());
    expect(res.statusCode).toBe(403);
    expect(sb.updates).toHaveLength(0);
  });

  /**
   * O CASO DO PLANO. A fila é montada antes; entre montá-la e chegar a este
   * registro podem ter passado minutos, e alguém pode ter arrastado o pino.
   * Por isso a checagem é feita na hora de gravar, e não ao montar a fila.
   */
  it('pino arrastado à mão nunca é sobrescrito', async () => {
    const app = appFalso();
    const sb = supabaseFalso({
      geoOrigem: 'manual',
      fila: [{ tipo: 'lancamento', id: PONTO, endereco: 'Avenida Paulista, São Paulo', precisao: 'exata' }],
    });
    registerMapaRoutes(app, sb, { verbose: false });
    const res = await app.chamar('POST /api/v1/mapa/geocodificar', req());
    expect(res.statusCode).toBe(200);
    expect(res.corpo.tentados).toBe(0);
    expect(sb.updates).toHaveLength(0);
  });

  it('tipo fora dos três é recusado antes de qualquer consulta', async () => {
    const app = appFalso();
    const sb = supabaseFalso();
    registerMapaRoutes(app, sb, { verbose: false });
    const res = await app.chamar('POST /api/v1/mapa/geocodificar', req({ tipo: 'fazenda', id: PONTO }));
    expect(res.statusCode).toBe(400);
    expect(res.corpo.error).toBe('tipo_invalido');
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('id que não é uuid é recusado', async () => {
    const app = appFalso();
    registerMapaRoutes(app, supabaseFalso(), { verbose: false });
    const res = await app.chamar('POST /api/v1/mapa/geocodificar', req({ tipo: 'lancamento', id: 'abc' }));
    expect(res.statusCode).toBe(400);
    expect(res.corpo.error).toBe('id_invalido');
  });

  it('fila vazia devolve relatório vazio, não erro', async () => {
    const app = appFalso();
    registerMapaRoutes(app, supabaseFalso({ fila: [] }), { verbose: false });
    const res = await app.chamar('POST /api/v1/mapa/geocodificar', req());
    expect(res.corpo).toMatchObject({ ok: true, tentados: 0, achados: 0, na_fila: 0, falhas: [] });
  });
});
