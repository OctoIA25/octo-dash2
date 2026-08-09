import { describe, it, expect, vi } from 'vitest';
import { brokerMatchTerms, countLeadsPerBroker, fetchBrokerLeadStats } from './brokerLeadStats.js';

/**
 * Regressão do bug em que GET /api/v1/brokers e /brokers/:id devolviam estatística
 * zerada para todo corretor: liam `corretor_id`/`etapa_funil`/`temperatura`, que
 * não existem em kenlo_leads. O PostgREST respondia 400/42703 e o handler
 * descartava o erro.
 *
 * Os testes travam as três coisas que causaram isso:
 *  - as COLUNAS consultadas são as reais;
 *  - a contagem acontece NO BANCO (head+count), não no `.length` de uma página
 *    de 1000 linhas;
 *  - erro do banco NÃO vira zero silencioso.
 */

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Supabase fake: registra o que foi pedido e devolve o que o teste mandar.
function createFakeSupabase(handler, rpcHandler) {
  const calls = [];
  const rpcCalls = [];
  const rpc = (fn, args) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcHandler ? rpcHandler(fn, args) : { data: [], error: null });
  };
  const from = (table) => {
    const q = { table, filters: [], opts: null, columns: null, range: null, ordered: false };
    const chain = {
      select(columns, opts) { q.columns = columns; q.opts = opts || null; return chain; },
      eq(col, val) { q.filters.push({ op: 'eq', col, val }); return chain; },
      or(expr) { q.filters.push({ op: 'or', expr }); return chain; },
      order() { q.ordered = true; return chain; },
      range(from_, to) { q.range = [from_, to]; return chain; },
      then(resolve, reject) {
        calls.push(q);
        return Promise.resolve(handler(q)).then(resolve, reject);
      },
    };
    return chain;
  };
  return { supabase: { from, rpc }, calls, rpcCalls };
}

describe('brokerMatchTerms', () => {
  it('usa as colunas reais de kenlo_leads', () => {
    const terms = brokerMatchTerms({ auth_user_id: uuid(1), name: 'William Machado' }).join(',');
    expect(terms).toContain('attended_by_id');
    expect(terms).toContain('attended_by_name');
    expect(terms).not.toContain('corretor_id');
  });

  // attended_by_id guarda auth_user_id — nunca tenant_brokers.id (conferido nos dados).
  it('não usa o id do tenant_brokers como attended_by_id', () => {
    const terms = brokerMatchTerms({ id: uuid(9), broker_id: uuid(8), name: 'Ana' });
    expect(terms).toEqual(['attended_by_name.ilike."Ana"']);
  });

  it('protege vírgula e parênteses do nome com aspas (senão quebra o or() do PostgREST)', () => {
    const [term] = brokerMatchTerms({ name: 'Silva, Joao (Locacao)' });
    expect(term).toBe('attended_by_name.ilike."Silva, Joao (Locacao)"');
  });

  it('ignora id que não é uuid — a coluna é uuid e um valor inválido derruba a query', () => {
    expect(brokerMatchTerms({ auth_user_id: 'demo', name: 'Ana' })).toEqual(['attended_by_name.ilike."Ana"']);
  });

  it('sem id e sem nome não há como associar', () => {
    expect(brokerMatchTerms({})).toEqual([]);
  });
});

describe('countLeadsPerBroker', () => {
  const brokers = [
    { id: uuid(1), name: 'William Machado' },
    { id: uuid(2), name: 'Chalimar Salvino' },
  ];
  const grupos = (linhas) => (_fn, _args) => ({ data: linhas, error: null });

  it('resolve todos os corretores com UMA chamada, escopada por tenant', async () => {
    const { supabase, calls, rpcCalls } = createFakeSupabase(
      null,
      grupos([
        { attended_by_id: null, attended_by_name: 'William Machado', total: 6552 },
        { attended_by_id: null, attended_by_name: 'Chalimar Salvino', total: 14 },
      ])
    );

    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', brokers);

    expect(counts.get(uuid(1))).toBe(6552);
    expect(counts.get(uuid(2))).toBe(14);
    expect(rpcCalls).toEqual([{ fn: 'kenlo_leads_count_by_broker', args: { p_tenant_id: 'tenant-1' } }]);
    expect(calls).toHaveLength(0); // nada de baixar linhas de kenlo_leads
  });

  it('casa pelo nome sem depender de caixa', async () => {
    const { supabase } = createFakeSupabase(
      null,
      grupos([{ attended_by_id: null, attended_by_name: '  WILLIAM MACHADO ', total: 42 }])
    );
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', brokers);
    expect(counts.get(uuid(1))).toBe(42);
  });

  it('attended_by_id vence o nome, sem somar os dois (é a mesma linha)', async () => {
    const comLogin = [{ id: uuid(1), auth_user_id: uuid(1), name: 'William Machado' }];
    const { supabase } = createFakeSupabase(
      null,
      grupos([{ attended_by_id: uuid(1), attended_by_name: 'William Machado', total: 6552 }])
    );
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', comLogin);
    expect(counts.get(uuid(1))).toBe(6552); // não 13104
  });

  it('soma os grupos do mesmo nome com attended_by_id diferente', async () => {
    const { supabase } = createFakeSupabase(
      null,
      grupos([
        { attended_by_id: null, attended_by_name: 'William Machado', total: 6000 },
        { attended_by_id: uuid(7), attended_by_name: 'William Machado', total: 552 },
      ])
    );
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', brokers);
    expect(counts.get(uuid(1))).toBe(6552);
  });

  // O ponto do `ok`: sem ele a rota respondia 200 com leads_count 0 para todo mundo
  // quando a contagem falhava — sucesso para uma operação que não aconteceu.
  it('erro do banco devolve ok:false, Map vazio e loga', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = createFakeSupabase(null, () => ({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    }));

    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', brokers);

    expect(ok).toBe(false);
    expect(counts.size).toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  // Contrato: ok:true → todo corretor tem entrada (0 se não atende nada);
  // ok:false → não dá para afirmar nada. Sem isso não se distingue "zero" de "não deu".
  it('corretor sem lead recebe 0 quando a RPC respondeu', async () => {
    const { supabase } = createFakeSupabase(
      null,
      grupos([{ attended_by_id: null, attended_by_name: 'William Machado', total: 6552 }])
    );
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', brokers);
    expect(ok).toBe(true);
    expect(counts.get(uuid(2))).toBe(0);
    expect(counts.size).toBe(2);
  });

  it('registros duplicados do mesmo corretor recebem o mesmo total', async () => {
    const gemeos = [
      { id: uuid(1), name: 'Andrea Abrao' },
      { id: uuid(2), name: 'Andrea Abrao' },
    ];
    const { supabase } = createFakeSupabase(
      null,
      grupos([{ attended_by_id: null, attended_by_name: 'Andrea Abrao', total: 7989 }])
    );
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', gemeos);
    expect(counts.get(uuid(1))).toBe(7989);
    expect(counts.get(uuid(2))).toBe(7989);
  });

  it('sem corretores não chama o banco', async () => {
    const { supabase, rpcCalls } = createFakeSupabase(null, grupos([]));
    const { ok, counts } = await countLeadsPerBroker(supabase, 'tenant-1', []);
    expect(rpcCalls).toHaveLength(0);
    expect(counts.size).toBe(0);
  });
});

describe('fetchBrokerLeadStats', () => {
  const broker = { id: uuid(1), name: 'William Machado' };

  it('agrega por stage e temperature usando os valores reais', async () => {
    const linhas = [
      { stage: 'new', temperature: 'cold' },
      { stage: 'new', temperature: 'cold' },
      { stage: 'closed_won', temperature: 'hot' },
      { stage: 'contacted', temperature: 'warm' },
    ];
    const { supabase, calls } = createFakeSupabase(() => ({ data: linhas, error: null }));

    const stats = await fetchBrokerLeadStats(supabase, 'tenant-1', broker);

    expect(stats.total_leads).toBe(4);
    expect(stats.by_stage).toEqual({ new: 2, closed_won: 1, contacted: 1 });
    expect(stats.by_temperature).toEqual({ cold: 2, warm: 1, hot: 1 });
    expect(stats.conversions).toBe(1); // closed_won — o código antigo comparava com 9
    expect(calls[0].columns).toBe('stage, temperature');
  });

  it('pagina até acabar em vez de parar nas primeiras 1000 linhas', async () => {
    const cheia = Array.from({ length: 1000 }, () => ({ stage: 'new', temperature: 'cold' }));
    const resto = Array.from({ length: 7 }, () => ({ stage: 'closed_won', temperature: 'hot' }));
    let pagina = 0;
    const { supabase } = createFakeSupabase(() => ({ data: pagina++ === 0 ? cheia : resto, error: null }));

    const stats = await fetchBrokerLeadStats(supabase, 'tenant-1', broker);

    expect(stats.total_leads).toBe(1007);
    expect(stats.conversions).toBe(7);
    expect(stats.truncated).toBe(false);
  });

  it('ordena antes de paginar — sem ordem estável o range repete ou pula linhas', async () => {
    const { supabase, calls } = createFakeSupabase(() => ({ data: [], error: null }));
    await fetchBrokerLeadStats(supabase, 'tenant-1', broker);
    expect(calls[0].ordered).toBe(true);
    expect(calls[0].range).toEqual([0, 999]);
  });

  it('erro do banco marca truncated em vez de devolver zero como se fosse o total', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = createFakeSupabase(() => ({ data: null, error: { code: '42703' } }));

    const stats = await fetchBrokerLeadStats(supabase, 'tenant-1', broker);

    expect(stats.truncated).toBe(true);
    expect(stats.total_leads).toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('corretor sem id nem nome não consulta o banco', async () => {
    const { supabase, calls } = createFakeSupabase(() => ({ data: [], error: null }));
    const stats = await fetchBrokerLeadStats(supabase, 'tenant-1', {});
    expect(calls).toHaveLength(0);
    expect(stats.total_leads).toBe(0);
  });
});
