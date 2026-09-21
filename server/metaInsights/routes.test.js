/**
 * Rotas do gasto de anúncios (P3.5).
 *
 * O caso que mais importa é o da Meta fora do ar: a sincronização falha e o
 * que já está guardado NÃO é tocado. A tela continua mostrando o último número
 * bom, que é o contrário de buscar ao vivo e ficar sem nada.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerMetaInsightsRoutes } from './routes.js';

/** O mesmo app de mentira que o P2.7 usa: sem supertest, sem servidor de pé. */
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

const TENANT = '0ccc1111-0000-4000-a000-000000000001';
const GESTOR = { id: 'u1', email: 'gestor@teste.dev' };

function respostaDaMeta(linhas) {
  return { ok: true, corpo: { data: linhas } };
}

const LINHA = {
  campaign_id: 'c1', campaign_name: '[RESERVA CASTANHEIRA] Reserva Castanheira',
  adset_id: 's1', adset_name: 'Conjunto', ad_id: 'a1', ad_name: 'Anúncio',
  objective: 'OUTCOME_LEADS', spend: '1959.79', impressions: '88997', clicks: '2217',
  ctr: '2.49', cpc: '0.88', cpm: '22.02',
  actions: [{ action_type: 'lead', value: '124' }],
  date_start: '2026-09-01',
};

function montar({
  membershipRole = 'admin',
  cfg = { adAccountId: '1213977450907753', accessToken: 'tok' },
  graph,
  upsertErro = null,
} = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertErro });
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: GESTOR }, error: null }) },
    from: vi.fn((tabela) => {
      if (tabela === 'tenant_memberships') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: membershipRole ? { role: membershipRole } : null, error: null }) }) }),
          }),
        };
      }
      return { upsert };
    }),
  };
  const app = appFalso();
  registerMetaInsightsRoutes(app, supabase, {
    configResolver: { resolveByTenant: vi.fn().mockResolvedValue(cfg) },
    graphClient: graph || { fetchInsights: vi.fn().mockResolvedValue(respostaDaMeta([LINHA])) },
    hoje: () => '2026-09-21',
  });
  return { app, upsert, supabase };
}

const post = (app, body, comToken = true) =>
  app.chamar('/api/v1/meta/insights/sincronizar', {
    headers: comToken ? { authorization: 'Bearer t' } : {},
    body,
  });

beforeEach(() => vi.clearAllMocks());

describe('autorização', () => {
  it('sem token não passa', async () => {
    const { app } = montar();
    expect((await post(app, { tenantId: TENANT }, false)).statusCode).toBe(401);
  });

  /** Corretor não vê quanto a imobiliária gasta em anúncio. */
  it('corretor é barrado', async () => {
    const { app } = montar({ membershipRole: 'corretor' });
    expect((await post(app, { tenantId: TENANT })).statusCode).toBe(403);
  });

  it('quem não é membro é barrado', async () => {
    const { app } = montar({ membershipRole: null });
    expect((await post(app, { tenantId: TENANT })).statusCode).toBe(403);
  });

  /**
   * `tenantId` vem SÓ do corpo. Foi uma segunda fonte (query) que causou um
   * IDOR neste módulo no P2.7.
   */
  it('sem tenantId não passa', async () => {
    const { app } = montar();
    expect((await post(app, {})).statusCode).toBe(400);
  });
});

describe('sincronização', () => {
  it('grava o que veio e diz quanto', async () => {
    const { app, upsert } = montar();
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, gravadas: 1, campanhas: 1, gasto: 1959.79 });
    expect(upsert).toHaveBeenCalledOnce();
    const [linhas, opcoes] = upsert.mock.calls[0];
    expect(linhas[0]).toMatchObject({ tenant_id: TENANT, ad_id: 'a1', leads_meta: 124 });
    // A chave que impede a regravação da Meta de dobrar o mês.
    expect(opcoes).toMatchObject({ onConflict: 'tenant_id,data,ad_id' });
  });

  it('a janela padrão é de sete dias terminando hoje', async () => {
    const fetchInsights = vi.fn().mockResolvedValue(respostaDaMeta([LINHA]));
    const { app } = montar({ graph: { fetchInsights } });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(200);
    expect(r.corpo).toMatchObject({ de: '2026-09-15', ate: '2026-09-21' });
    expect(fetchInsights.mock.calls[0][0]).toContain('time_increment=1');
  });

  /**
   * O CASO QUE JUSTIFICA GUARDAR EM VEZ DE BUSCAR AO VIVO: a Meta fora do ar
   * devolve erro e NÃO escreve nada. O que já estava guardado continua lá, e a
   * tela segue mostrando o último número bom.
   */
  it('Meta fora do ar não apaga nem sobrescreve o que já existe', async () => {
    const { app, upsert } = montar({
      graph: { fetchInsights: vi.fn().mockResolvedValue({ ok: false, retriable: true, error: 'timeout' }) },
    });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(502);
    expect(r.corpo).toMatchObject({ ok: false, error: 'meta_indisponivel', retriable: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('período sem anúncio não é erro', async () => {
    const { app, upsert } = montar({ graph: { fetchInsights: vi.fn().mockResolvedValue(respostaDaMeta([])) } });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, gravadas: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('configuração incompleta', () => {
  /**
   * Erro específico de propósito: "não configurado" mandaria o gestor refazer
   * a integração inteira quando falta um campo só.
   */
  it('sem conta de anúncios, diz exatamente o que falta', async () => {
    const { app } = montar({ cfg: { adAccountId: null, accessToken: 'tok' } });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(400);
    expect(r.corpo.error).toBe('conta_de_anuncios_ausente');
    expect(r.corpo.detalhe).toContain('ad_account_id');
  });

  it('sem token, diz que é o token', async () => {
    const { app } = montar({ cfg: { adAccountId: '123', accessToken: null } });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(400);
    expect(r.corpo.error).toBe('token_ausente');
  });

  it('sem integração nenhuma, 404', async () => {
    const { app } = montar({ cfg: null });
    expect((await post(app, { tenantId: TENANT })).statusCode).toBe(404);
  });
});

describe('limites do período', () => {
  /** Um ano de uma vez é carga, não abertura de tela — e a Meta pagina. */
  it('recusa período longo demais', async () => {
    const { app } = montar();
    const r = await post(app, { tenantId: TENANT, de: '2026-01-01', ate: '2026-12-31' });
    expect(r.statusCode).toBe(400);
    expect(r.corpo.error).toBe('periodo_longo_demais');
  });

  it('recusa período invertido', async () => {
    const { app } = montar();
    expect((await post(app, { tenantId: TENANT, de: '2026-09-30', ate: '2026-09-01' })).statusCode).toBe(400);
  });

  it('aceita período explícito dentro do teto', async () => {
    const { app } = montar();
    const r = await post(app, { tenantId: TENANT, de: '2026-09-01', ate: '2026-09-30' });
    expect(r.statusCode).toBe(200);
    expect(r.corpo).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' });
  });
});

describe('falha ao gravar', () => {
  it('erro do banco não vira sucesso silencioso', async () => {
    const { app } = montar({ upsertErro: { message: 'permission denied' } });
    const r = await post(app, { tenantId: TENANT });
    expect(r.statusCode).toBe(500);
    expect(r.corpo).toMatchObject({ ok: false, error: 'gravacao_falhou' });
  });
});
