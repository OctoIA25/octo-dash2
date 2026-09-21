/**
 * Formulários da Meta (P2.7) — sincronizar e baixar.
 *
 * Dois casos carregam o item: a sincronização NÃO pode religar o que o gestor
 * desligou, e o histórico NÃO pode entrar acionando a LIA. O primeiro
 * devolveria dinheiro ao ralo em silêncio; o segundo manda "oi, vi que você se
 * interessou" para quem preencheu o formulário há dois meses.
 */

import { describe, it, expect, vi } from 'vitest';
import { decidirImportacao, registerMetaFormRoutes } from './formRoutes.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const GESTOR = '11111111-1111-1111-1111-111111111111';

describe('decidirImportacao', () => {
  it('lead que não existe é para criar', () => {
    expect(decidirImportacao({ id: '1', campaign_id: 'c' }, null)).toEqual({ acao: 'criar' });
  });

  /**
   * O caso que o chefe pediu: 56 dos 125 leads em produção entraram antes de
   * 12/09, quando campanha e conjunto passaram a ser pedidos à Meta.
   */
  it('lead que existe sem campanha é para completar', () => {
    expect(
      decidirImportacao(
        { id: '1', campaign_id: 'camp', adset_id: 'conj', ad_id: 'anuncio' },
        { id: 'lead-1', meta_campaign_id: null, meta_adset_id: null, meta_ad_id: 'anuncio' },
      ),
    ).toEqual({ acao: 'completar', campos: { meta_campaign_id: 'camp', meta_adset_id: 'conj' } });
  });

  it('lead completo não é tocado', () => {
    expect(
      decidirImportacao(
        { id: '1', campaign_id: 'camp', adset_id: 'conj', ad_id: 'anuncio' },
        { id: 'lead-1', meta_campaign_id: 'camp', meta_adset_id: 'conj', meta_ad_id: 'anuncio' },
      ),
    ).toEqual({ acao: 'nada' });
  });

  /** A Meta também não sabe: nada a completar, e nada a inventar. */
  it('sem campanha na Meta, não há o que completar', () => {
    expect(decidirImportacao({ id: '1' }, { id: 'lead-1', meta_campaign_id: null })).toEqual({ acao: 'nada' });
  });
});

function appFalso() {
  const rotas = new Map();
  return {
    post: (caminho, ...fns) => rotas.set(caminho, fns),
    get: () => {},
    async chamar(caminho, req) {
      const res = {
        statusCode: 200, corpo: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.corpo = b; return this; },
      };
      for (const fn of rotas.get(caminho)) {
        let seguiu = false;
        await fn(req, res, () => { seguiu = true; });
        if (!seguiu) return res;
      }
      return res;
    },
  };
}

function supabaseFalso({ role = 'admin', form = null, leadExistente = null } = {}) {
  const escritas = [];
  return {
    escritas,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: GESTOR, email: 'gestor@x.com' } } })) },
    from(tabela) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: tabela === 'tenant_memberships' ? { role } : tabela === 'meta_formularios' ? form : leadExistente,
          error: null,
        }),
        upsert: async (linhas, opts) => { escritas.push({ tabela, upsert: linhas, opts }); return { error: null }; },
        update: (linha) => { escritas.push({ tabela, update: linha }); return chain; },
      };
      return chain;
    },
  };
}

const req = (body) => ({ headers: { authorization: 'Bearer jwt' }, body, params: {}, query: {} });

describe('POST /api/v1/meta/formularios/sincronizar', () => {
  const registrar = (sb, graph) =>
    registerMetaFormRoutes(appFalso(), sb, {
      verbose: false,
      configResolver: { resolve: async () => ({ accessToken: 'tok', pageId: '999' }) },
      graphClient: graph,
    });

  it('corretor não sincroniza formulário', async () => {
    const app = appFalso();
    const sb = supabaseFalso({ role: 'corretor' });
    registerMetaFormRoutes(app, sb, {
      verbose: false,
      configResolver: { resolve: async () => ({ accessToken: 'tok', pageId: '999' }) },
      graphClient: { fetchForms: vi.fn() },
    });
    const res = await app.chamar('/api/v1/meta/formularios/sincronizar', req({ tenantId: TENANT }));
    expect(res.statusCode).toBe(403);
    expect(sb.escritas).toHaveLength(0);
  });

  /**
   * O CASO. Se `captacao_ativa` entrasse no upsert, toda sincronização
   * devolveria os formulários ao padrão "ligado" — e o gestor descobriria no
   * fim do mês, pela fatura.
   */
  it('não devolve ao padrão o que o gestor desligou', async () => {
    const app = appFalso();
    const sb = supabaseFalso();
    registerMetaFormRoutes(app, sb, {
      verbose: false,
      configResolver: { resolve: async () => ({ accessToken: 'tok', pageId: '999' }) },
      graphClient: { fetchForms: async () => ({ ok: true, forms: [{ id: '1', name: 'Reserva Castanheira' }] }) },
    });
    const res = await app.chamar('/api/v1/meta/formularios/sincronizar', req({ tenantId: TENANT }));
    expect(res.corpo).toEqual({ ok: true, formularios: 1 });
    const linha = sb.escritas.find((e) => e.tabela === 'meta_formularios').upsert[0];
    expect(linha).not.toHaveProperty('captacao_ativa');
    expect(linha).not.toHaveProperty('lia_atende');
    expect(linha.nome).toBe('Reserva Castanheira');
  });

  it('integração não configurada responde 409, não 500', async () => {
    const app = appFalso();
    registerMetaFormRoutes(app, supabaseFalso(), {
      verbose: false,
      configResolver: { resolve: async () => ({}) },
      graphClient: { fetchForms: vi.fn() },
    });
    const res = await app.chamar('/api/v1/meta/formularios/sincronizar', req({ tenantId: TENANT }));
    expect(res.statusCode).toBe(409);
  });

  it('erro da Meta vira 502 com o motivo', async () => {
    const app = appFalso();
    registerMetaFormRoutes(app, supabaseFalso(), {
      verbose: false,
      configResolver: { resolve: async () => ({ accessToken: 'tok', pageId: '999' }) },
      graphClient: { fetchForms: async () => ({ ok: false, error: 'token expirado' }) },
    });
    const res = await app.chamar('/api/v1/meta/formularios/sincronizar', req({ tenantId: TENANT }));
    expect(res.statusCode).toBe(502);
    expect(res.corpo.error).toContain('token expirado');
  });
});

describe('POST /api/v1/meta/formularios/baixar', () => {
  const comLeads = (leads, extras = {}) => ({
    verbose: false,
    configResolver: { resolve: async () => ({ accessToken: 'tok', pageId: '999' }) },
    graphClient: { fetchFormLeads: async () => ({ ok: true, leads }) },
    fetchImpl: extras.fetchImpl ?? (async () => ({ ok: true, status: 200 })),
    selfBaseUrl: 'http://local',
  });

  /** Lead de dois meses atrás não pode receber mensagem como se fosse de hoje. */
  it('o histórico entra SEM a LIA', async () => {
    const app = appFalso();
    const enviados = [];
    const fetchImpl = async (_url, opts) => { enviados.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };
    registerMetaFormRoutes(
      app,
      supabaseFalso({ leadExistente: null }),
      comLeads([{ id: 'lg1', field_data: [{ name: 'full_name', values: ['Fulano'] }], platform: 'fb' }], { fetchImpl }),
    );
    const res = await app.chamar('/api/v1/meta/formularios/baixar', req({ tenantId: TENANT, formId: '1' }));
    expect(res.corpo).toMatchObject({ ok: true, criados: 1 });
    expect(enviados[0].raw_data.meta.lia_atende).toBe(false);
    expect(enviados[0].raw_data.meta.importado_em).toBeTruthy();
  });

  it('lead que já existe sem campanha é completado, não duplicado', async () => {
    const app = appFalso();
    const sb = supabaseFalso({ leadExistente: { id: 'lead-1', meta_campaign_id: null } });
    const fetchImpl = vi.fn();
    registerMetaFormRoutes(app, sb, comLeads([{ id: 'lg1', campaign_id: 'camp' }], { fetchImpl }));
    const res = await app.chamar('/api/v1/meta/formularios/baixar', req({ tenantId: TENANT, formId: '1' }));
    expect(res.corpo).toMatchObject({ completados: 1, criados: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sb.escritas.find((e) => e.tabela === 'leads').update).toEqual({ meta_campaign_id: 'camp' });
  });

  /**
   * Avançar `baixado_ate` com falha pularia para sempre o lead que não entrou,
   * e ninguém saberia qual foi.
   */
  it('não avança o marcador quando algum lead falhou', async () => {
    const app = appFalso();
    const sb = supabaseFalso({ leadExistente: null });
    registerMetaFormRoutes(
      app, sb,
      comLeads([{ id: 'lg1' }], { fetchImpl: async () => ({ ok: false, status: 400 }) }),
    );
    const res = await app.chamar('/api/v1/meta/formularios/baixar', req({ tenantId: TENANT, formId: '1' }));
    expect(res.corpo.falhas).toHaveLength(1);
    expect(sb.escritas.some((e) => e.tabela === 'meta_formularios' && e.update?.baixado_ate)).toBe(false);
  });

  it('sem formId devolve 400', async () => {
    const app = appFalso();
    registerMetaFormRoutes(app, supabaseFalso(), comLeads([]));
    const res = await app.chamar('/api/v1/meta/formularios/baixar', req({ tenantId: TENANT }));
    expect(res.statusCode).toBe(400);
  });
});
