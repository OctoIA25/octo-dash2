import { describe, it, expect } from 'vitest';
import { createLeadAssignment } from './leadAssignment.js';

/**
 * Testes de regressão da otimização do pipeline de criação de leads.
 *
 * Garantem que, após a extração de proxy-production.js + cache por requisição
 * + batch (.in) + Promise.all:
 * - a DISTRIBUIÇÃO continua igual (prioridade attendedBy > XML > Meus Imóveis
 *   > roleta; round-robin na mesma ordem);
 * - os LIMITES continuam funcionando (carteira/pendência, overrides, pausado,
 *   isento, fail-open);
 * - a EXCLUSIVIDADE continua funcionando (imoveis_locais vence imoveis_corretores);
 * - as queries repetidas realmente sumiram (contagem de round-trips por tabela).
 */

const TENANT = 'tenant-1';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---------------------------------------------------------------------------
// Supabase fake: chainable, registra cada query executada (para contagem)
// ---------------------------------------------------------------------------

function createFakeSupabase(db) {
  const queries = [];

  const eqOf = (q, col) => q.filters.find((f) => f.op === 'eq' && f.col === col)?.val;
  const inOf = (q, col) => q.filters.find((f) => f.op === 'in' && f.col === col)?.val;

  const route = (q) => {
    switch (q.table) {
      case 'roleta_participantes':
        return { data: db.participantes || [], error: null };
      case 'tenant_brokers':
        return { data: db.tenantBrokers || [], error: null };
      case 'tenant_memberships': {
        if (eqOf(q, 'role') === 'corretor') return { data: db.members || [], error: null };
        const batchIds = inOf(q, 'user_id');
        if (batchIds) {
          return { data: (db.memberships || []).filter((m) => batchIds.includes(m.user_id)), error: null };
        }
        const uid = eqOf(q, 'user_id');
        const row = (db.memberships || []).find((m) => m.user_id === uid) || null;
        return { data: row ? { permissions: row.permissions } : null, error: null };
      }
      case 'user_profiles':
        return { data: (db.profiles || []).filter((p) => (inOf(q, 'id') || []).includes(p.id)), error: null };
      case 'tenant_lead_limit_config':
        return { data: db.limitConfig || null, error: null };
      case 'leads': {
        if (q.opts?.count === 'exact') {
          const brokerId = eqOf(q, 'assigned_agent_id');
          const c = (db.leadCounts || {})[brokerId] || { active: 0, pending: 0 };
          const isPending = q.filters.some((f) => f.op === 'in' && f.col === 'status');
          return { count: isPending ? c.pending : c.active, data: null, error: null };
        }
        return { data: [], error: null };
      }
      case 'properties_cache':
        return { data: db.propertyCache ?? null, error: null };
      case 'imoveis_corretores':
        if (q.mode === 'many') return { data: db.imoveisCorretoresList || [], error: null };
        return { data: db.imovelCorretor ?? null, error: null };
      case 'imoveis_locais':
        return { data: db.imovelLocal ?? null, error: null };
      default:
        return { data: null, error: null };
    }
  };

  const client = {
    from(table) {
      const q = { table, filters: [], select: null, opts: null, mode: 'many' };
      const builder = {
        select(cols, opts) { q.select = cols; q.opts = opts || null; return builder; },
        eq(col, val) { q.filters.push({ op: 'eq', col, val }); return builder; },
        neq(col, val) { q.filters.push({ op: 'neq', col, val }); return builder; },
        in(col, val) { q.filters.push({ op: 'in', col, val }); return builder; },
        not(col, operator, val) { q.filters.push({ op: 'not', col, val: `${operator} ${val}` }); return builder; },
        ilike(col, val) { q.filters.push({ op: 'ilike', col, val }); return builder; },
        limit(n) { q.filters.push({ op: 'limit', val: n }); return builder; },
        order() { return builder; },
        maybeSingle() { q.mode = 'maybeSingle'; return builder; },
        single() { q.mode = 'single'; return builder; },
        then(onFulfilled, onRejected) {
          queries.push(q);
          return Promise.resolve().then(() => route(q)).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };

  return { client, queries };
}

const setup = (db) => {
  const { client, queries } = createFakeSupabase(db);
  const la = createLeadAssignment({ supabase: client });
  const countQueries = (table, extra = () => true) =>
    queries.filter((q) => q.table === table && extra(q)).length;
  return { la, queries, countQueries };
};

const participante = (n, name) => ({
  broker_id: uuid(n), broker_name: name, broker_email: `${name.toLowerCase()}@x.com`, broker_phone: null,
});

const limitConfigOn = (overrides = {}) => ({
  lead_limit_enabled: true,
  max_active_leads_per_broker: 10,
  max_pending_response_leads_per_broker: 5,
  pending_statuses: ['Novos Leads'],
  blocking_mode: 'both',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Distribuição — roleta round-robin e fallbacks
// ---------------------------------------------------------------------------

describe('distribuição — roleta', () => {
  it('percorre os participantes em round-robin na mesma ordem e cicla', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia'), participante(3, 'Caio')],
    });

    const picks = [];
    for (let i = 0; i < 4; i++) {
      picks.push((await la.getNextBrokerFromRoleta(TENANT)).name);
    }
    expect(picks).toEqual(['Ana', 'Bia', 'Caio', 'Ana']);
  });

  it('sem participantes, cai para o ACL (tenant_brokers + memberships)', async () => {
    const { la, countQueries } = setup({
      participantes: [],
      tenantBrokers: [
        { id: uuid(11), name: 'Duda', email: 'duda@x.com', phone: null, photo_url: null, auth_user_id: uuid(1), status: 'active' },
      ],
      members: [],
    });

    const broker = await la.getNextBrokerFromRoleta(TENANT);
    expect(broker.name).toBe('Duda');
    expect(countQueries('tenant_brokers')).toBe(1);
  });

  it('sem participantes e sem ACL, cai para imoveis_corretores deduplicado por nome', async () => {
    const { la } = setup({
      participantes: [],
      tenantBrokers: [],
      members: [],
      imoveisCorretoresList: [
        { corretor_nome: 'Edu', corretor_id: 'k-1', corretor_telefone: null, corretor_email: null },
        { corretor_nome: 'Edu', corretor_id: 'k-1', corretor_telefone: null, corretor_email: null },
        { corretor_nome: 'Fabi', corretor_id: 'k-2', corretor_telefone: null, corretor_email: null },
      ],
    });

    const first = await la.getNextBrokerFromRoleta(TENANT);
    const second = await la.getNextBrokerFromRoleta(TENANT);
    expect([first.name, second.name]).toEqual(['Edu', 'Fabi']);
  });

  it('sem nenhum corretor disponível, retorna null', async () => {
    const { la } = setup({ participantes: [], tenantBrokers: [], members: [], imoveisCorretoresList: [] });
    expect(await la.getNextBrokerFromRoleta(TENANT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Distribuição — prioridade do pipeline de atribuição
// ---------------------------------------------------------------------------

describe('distribuição — prioridade de resolveBrokerForLead', () => {
  const aclDb = {
    tenantBrokers: [
      { id: uuid(21), name: 'Gil', email: 'gil@x.com', phone: '11999990000', photo_url: null, auth_user_id: uuid(2), status: 'active' },
    ],
    members: [],
    participantes: [participante(3, 'Roleta Rita')],
  };

  it('1º: attendedBy do Kenlo validado no ACL', async () => {
    const { la, countQueries } = setup(aclDb);
    const { broker, method } = await la.resolveBrokerForLead(null, TENANT, {
      attendedBy: [{ name: 'Gil', email: 'gil@x.com' }],
    });
    expect(method).toBe('kenlo_attended_by');
    expect(broker.name).toBe('Gil');
    expect(countQueries('roleta_participantes')).toBe(0); // não chegou na roleta
  });

  it('attendedBy fora do ACL é usado mesmo assim (não validado)', async () => {
    const { la } = setup(aclDb);
    const { broker, method } = await la.resolveBrokerForLead(null, TENANT, {
      attendedBy: [{ name: 'Externo', id: 42 }],
    });
    expect(method).toBe('kenlo_attended_by');
    expect(broker).toMatchObject({ name: 'Externo', id: '42' });
  });

  it('2º: corretor responsável do XML (properties_cache)', async () => {
    const { la } = setup({ ...aclDb, propertyCache: { agent_name: 'Gil', agent_email: null, agent_phone: null, main_photo: null } });
    const { broker, method } = await la.resolveBrokerForLead('ca0001', TENANT);
    expect(method).toBe('xml_property_cache');
    expect(broker.name).toBe('Gil');
  });

  it('3º: corretor manual de imoveis_corretores (Meus Imóveis)', async () => {
    const { la } = setup({ ...aclDb, imovelCorretor: { corretor_nome: 'Hugo', corretor_id: 'h-1', corretor_telefone: null, corretor_email: null, exclusivo: null } });
    const { broker, method } = await la.resolveBrokerForLead('CA0001', TENANT);
    expect(method).toBe('meus_imoveis');
    expect(broker.name).toBe('Hugo');
  });

  it('4º: fallback para roleta quando nada identifica o corretor', async () => {
    const { la } = setup(aclDb);
    const { broker, method } = await la.resolveBrokerForLead('CA0001', TENANT);
    expect(method).toBe('roleta');
    expect(broker.name).toBe('Roleta Rita');
  });
});

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

describe('limites de leads por corretor', () => {
  it('corretor com carteira no limite é pulado na roleta', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      limitConfig: limitConfigOn(),
      leadCounts: { [uuid(1)]: { active: 10, pending: 0 }, [uuid(2)]: { active: 1, pending: 0 } },
    });
    const broker = await la.getNextBrokerFromRoleta(TENANT);
    expect(broker.name).toBe('Bia');
  });

  it('blocking_mode=carteira ignora pendências', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana')],
      limitConfig: limitConfigOn({ blocking_mode: 'carteira' }),
      leadCounts: { [uuid(1)]: { active: 1, pending: 99 } },
    });
    expect((await la.getNextBrokerFromRoleta(TENANT)).name).toBe('Ana');
  });

  it('override limit_exempt isenta o corretor do limite', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana')],
      limitConfig: limitConfigOn(),
      memberships: [{ user_id: uuid(1), permissions: { lead_limit: { limit_exempt: true } } }],
      leadCounts: { [uuid(1)]: { active: 99, pending: 99 } },
    });
    expect((await la.getNextBrokerFromRoleta(TENANT)).name).toBe('Ana');
  });

  it('override receives_auto_leads=false pausa o corretor', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      limitConfig: limitConfigOn(),
      memberships: [{ user_id: uuid(1), permissions: { lead_limit: { receives_auto_leads: false } } }],
    });
    expect((await la.getNextBrokerFromRoleta(TENANT)).name).toBe('Bia');
  });

  it('todos no limite → roleta retorna null', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      limitConfig: limitConfigOn(),
      leadCounts: {
        [uuid(1)]: { active: 10, pending: 0 },
        [uuid(2)]: { active: 0, pending: 5 },
      },
    });
    expect(await la.getNextBrokerFromRoleta(TENANT)).toBeNull();
  });

  it('config desativada → nenhuma query de contagem/membership', async () => {
    const { la, countQueries } = setup({
      participantes: [participante(1, 'Ana')],
      limitConfig: { lead_limit_enabled: false },
    });
    expect((await la.getNextBrokerFromRoleta(TENANT)).name).toBe('Ana');
    expect(countQueries('leads')).toBe(0);
    expect(countQueries('tenant_memberships')).toBe(0);
  });

  it('sem config → fail-open (elegível)', async () => {
    const { la } = setup({ participantes: [participante(1, 'Ana')] });
    expect((await la.getNextBrokerFromRoleta(TENANT)).name).toBe('Ana');
  });

  it('comportamento preservado: attendedBy COM nome bloqueado por limite ainda recebe o lead (não validado)', async () => {
    // Regra herdada do código original: quando o corretor do attendedBy é
    // achado no ACL mas está no limite, o fluxo NÃO vai para a roleta — cai no
    // ramo "não encontrou no ACL" e atribui com os dados crus do Kenlo.
    const { la } = setup({
      tenantBrokers: [
        { id: uuid(31), name: 'Gil', email: 'gil@x.com', phone: null, photo_url: null, auth_user_id: uuid(1), status: 'active' },
      ],
      members: [],
      participantes: [participante(2, 'Bia')],
      limitConfig: limitConfigOn(),
      leadCounts: { [uuid(1)]: { active: 10, pending: 0 } },
    });

    const { broker, method } = await la.resolveBrokerForLead(null, TENANT, {
      attendedBy: [{ name: 'Gil', email: 'gil@x.com' }],
    });

    expect(method).toBe('kenlo_attended_by');
    expect(broker.name).toBe('Gil');
    expect(broker.auth_user_id).toBeUndefined(); // dados crus do Kenlo, não do ACL
  });

  it('attendedBy SEM nome no limite cai para a roleta, sem repetir a checagem do mesmo corretor', async () => {
    const { la, countQueries } = setup({
      tenantBrokers: [
        { id: uuid(31), name: 'Gil', email: 'gil@x.com', phone: null, photo_url: null, auth_user_id: uuid(1), status: 'active' },
      ],
      members: [],
      participantes: [participante(1, 'Gil'), participante(2, 'Bia')],
      limitConfig: limitConfigOn(),
      leadCounts: { [uuid(1)]: { active: 10, pending: 0 }, [uuid(2)]: { active: 0, pending: 0 } },
    });

    // Só email → acha Gil no ACL → bloqueado → sem nome no payload não há
    // fallback "não validado" → segue até a roleta.
    const { broker, method } = await la.resolveBrokerForLead(null, TENANT, {
      attendedBy: [{ email: 'gil@x.com' }],
    });

    expect(method).toBe('roleta');
    expect(broker.name).toBe('Bia');
    // Gil foi checado no attendedBy E filtrado na roleta, mas as contagens dele
    // só foram ao banco 1 vez (2 queries: carteira + pendência) — memoizado.
    const gilCountQueries = (q) => q.filters.some((f) => f.op === 'eq' && f.col === 'assigned_agent_id' && f.val === uuid(1));
    expect(countQueries('leads', gilCountQueries)).toBe(2);
    // Config de limite: 1 única query na requisição inteira.
    expect(countQueries('tenant_lead_limit_config')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Exclusividade
// ---------------------------------------------------------------------------

describe('exclusividade do imóvel', () => {
  it('imoveis_locais tem precedência (true)', async () => {
    const { la } = setup({ imovelLocal: { exclusivo: true }, imovelCorretor: { exclusivo: false } });
    expect(await la.resolvePropertyExclusivity(TENANT, 'ca0001')).toBe(true);
  });

  it('imoveis_locais false vence imoveis_corretores true', async () => {
    const { la } = setup({ imovelLocal: { exclusivo: false }, imovelCorretor: { exclusivo: true } });
    expect(await la.resolvePropertyExclusivity(TENANT, 'CA0001')).toBe(false);
  });

  it('sem linha em imoveis_locais, usa imoveis_corretores', async () => {
    const { la } = setup({ imovelCorretor: { exclusivo: true } });
    expect(await la.resolvePropertyExclusivity(TENANT, 'CA0001')).toBe(true);
  });

  it('sem dado em nenhuma fonte → false', async () => {
    const { la } = setup({});
    expect(await la.resolvePropertyExclusivity(TENANT, 'CA0001')).toBe(false);
  });

  it('sem propertyCode → false sem query', async () => {
    const { la, queries } = setup({});
    expect(await la.resolvePropertyExclusivity(TENANT, null)).toBe(false);
    expect(queries.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trips — a otimização em si (dedupe + batch)
// ---------------------------------------------------------------------------

describe('round-trips do pipeline (regressão de queries)', () => {
  it('webhook típico: cada tabela de apoio é consultada 1 única vez; memberships em batch', async () => {
    const N = 5;
    const { la, queries, countQueries } = setup({
      participantes: Array.from({ length: N }, (_, i) => participante(i + 1, `Corretor ${i + 1}`)),
      limitConfig: limitConfigOn(),
      imovelLocal: { exclusivo: true },
      imovelCorretor: { corretor_nome: null, exclusivo: null },
      propertyCache: { agent_name: null, agent_email: null, agent_phone: null, main_photo: 'foto.jpg' },
    });

    // Mesma orquestração do createIncomingLead: exclusividade, atribuição e
    // foto em paralelo, compartilhando o cache da requisição.
    const cache = la.createLeadLookupCache();
    const [isExclusive, assignment, photoRow] = await Promise.all([
      la.resolvePropertyExclusivity(TENANT, 'CA0001', cache),
      la.resolveBrokerForLead('CA0001', TENANT, null, cache),
      la.getPropertyCacheRow(TENANT, 'CA0001', cache),
    ]);

    expect(isExclusive).toBe(true);
    expect(assignment.method).toBe('roleta');
    expect(assignment.broker.name).toBe('Corretor 1');
    expect(photoRow.main_photo).toBe('foto.jpg');

    // Dedupe: 1 query por tabela de apoio, mesmo com 3 consumidores em paralelo.
    expect(countQueries('properties_cache')).toBe(1);
    expect(countQueries('imoveis_corretores')).toBe(1);
    expect(countQueries('imoveis_locais')).toBe(1);
    expect(countQueries('tenant_lead_limit_config')).toBe(1);
    expect(countQueries('roleta_participantes')).toBe(1);

    // Memberships: 1 query batch (.in) — zero queries individuais por corretor.
    const batch = (q) => q.filters.some((f) => f.op === 'in' && f.col === 'user_id');
    const individual = (q) => q.filters.some((f) => f.op === 'eq' && f.col === 'user_id');
    expect(countQueries('tenant_memberships', batch)).toBe(1);
    expect(countQueries('tenant_memberships', individual)).toBe(0);

    // Contagens de limite: 2 por corretor (carteira + pendência), em paralelo.
    expect(countQueries('leads')).toBe(2 * N);

    // Total: 6 + 2N (antes da otimização: ~8 + 4N, todas sequenciais).
    expect(queries.length).toBe(6 + 2 * N);
  });

  it('ACL é carregado 1 única vez mesmo com múltiplas buscas por identificador', async () => {
    const { la, countQueries } = setup({
      tenantBrokers: [
        { id: uuid(41), name: 'Gil', email: 'gil@x.com', phone: null, photo_url: null, auth_user_id: uuid(4), status: 'active' },
      ],
      members: [{ user_id: uuid(5), role: 'corretor' }],
      profiles: [{ id: uuid(5), email: 'ivo@x.com', full_name: 'Ivo', phone: null, avatar_url: null }],
    });

    const cache = la.createLeadLookupCache();
    await la.findBrokerByIdentifier(TENANT, { name: 'Gil' }, cache);
    await la.findBrokerByIdentifier(TENANT, { email: 'ivo@x.com' }, cache);
    await la.findBrokerByIdentifier(TENANT, { name: 'Ninguém' }, cache);

    expect(countQueries('tenant_brokers')).toBe(1);
    expect(countQueries('tenant_memberships')).toBe(1);
    expect(countQueries('user_profiles')).toBe(1);
  });

  it('ACL: tenant_brokers tem prioridade e membros viram fallback via user_profiles', async () => {
    const { la } = setup({
      tenantBrokers: [
        { id: uuid(41), name: 'Gil', email: 'gil@x.com', phone: null, photo_url: null, auth_user_id: uuid(4), status: 'active' },
      ],
      members: [{ user_id: uuid(4), role: 'corretor' }, { user_id: uuid(5), role: 'corretor' }],
      profiles: [{ id: uuid(5), email: 'ivo@x.com', full_name: 'Ivo', phone: null, avatar_url: null }],
    });

    const brokers = await la.getAllBrokersFromACL(TENANT);
    expect(brokers.map((b) => b.name)).toEqual(['Gil', 'Ivo']);
    expect(brokers[0].id).toBe(uuid(4)); // dedupe por auth_user_id
  });
});

// ---------------------------------------------------------------------------
// Atuação — lançamentos vs imóveis prontos
// ---------------------------------------------------------------------------

const membership = (n, atuacao) => ({
  user_id: uuid(n),
  permissions: atuacao ? { atuacao } : {},
});

describe('atuação do corretor na roleta', () => {
  it('atuacao=lancamentos sorteia só entre lancamentos e ambos', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia'), participante(3, 'Caio')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'prontos'), membership(3, 'ambos')],
    });

    const picks = [];
    for (let i = 0; i < 3; i++) {
      picks.push((await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' })).name);
    }
    expect(picks).toEqual(['Ana', 'Caio', 'Ana']);
  });

  it('atuacao=prontos sorteia só entre prontos e ambos', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia'), participante(3, 'Caio')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'prontos'), membership(3, 'ambos')],
    });

    const picks = [];
    for (let i = 0; i < 3; i++) {
      picks.push((await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'prontos' })).name);
    }
    expect(picks).toEqual(['Bia', 'Caio', 'Bia']);
  });

  it('sem atuacao, sorteia entre todos (comportamento de hoje)', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia'), participante(3, 'Caio')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'prontos'), membership(3, 'ambos')],
    });

    const picks = [];
    for (let i = 0; i < 3; i++) {
      picks.push((await la.getNextBrokerFromRoleta(TENANT)).name);
    }
    expect(picks).toEqual(['Ana', 'Bia', 'Caio']);
  });

  it('nenhum corretor do tipo pedido → cai no pool inteiro, não retorna null', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      memberships: [membership(1, 'prontos'), membership(2, 'prontos')],
    });

    const pick = await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' });
    expect(pick.name).toBe('Ana');
  });

  it('participante sem linha em tenant_memberships continua elegível', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      memberships: [membership(1, 'prontos')],
    });

    const pick = await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' });
    expect(pick.name).toBe('Bia');
  });

  it('atuacao desconhecida conta como ambos', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      memberships: [membership(1, 'lancamento'), membership(2, 'prontos')],
    });

    const pick = await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' });
    expect(pick.name).toBe('Ana');
  });

  it('round-robin é independente por pool', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia'), participante(3, 'Caio')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'prontos'), membership(3, 'prontos')],
    });

    expect((await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'prontos' })).name).toBe('Bia');
    expect((await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' })).name).toBe('Ana');
    expect((await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'prontos' })).name).toBe('Caio');
  });

  it('atuacao + limite ligado → memberships em 1 única query batch', async () => {
    const { la, countQueries } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'ambos')],
      limitConfig: limitConfigOn(),
    });

    await la.getNextBrokerFromRoleta(TENANT, undefined, { atuacao: 'lancamentos' });

    const batch = (q) => q.filters.some((f) => f.op === 'in' && f.col === 'user_id');
    const individual = (q) => q.filters.some((f) => f.op === 'eq' && f.col === 'user_id');
    expect(countQueries('tenant_memberships', batch)).toBe(1);
    expect(countQueries('tenant_memberships', individual)).toBe(0);
  });

  it('resolveBrokerForLead repassa a atuacao para a roleta', async () => {
    const { la } = setup({
      participantes: [participante(1, 'Ana'), participante(2, 'Bia')],
      memberships: [membership(1, 'lancamentos'), membership(2, 'prontos')],
      propertyCache: null,
      imovelCorretor: null,
    });

    const { broker, method } = await la.resolveBrokerForLead(
      'CA0001', TENANT, null, undefined, { atuacao: 'prontos' },
    );
    expect(method).toBe('roleta');
    expect(broker.name).toBe('Bia');
  });
});
