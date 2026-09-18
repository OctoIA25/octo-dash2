/**
 * A camada de I/O do teste diário. O que importa aqui não é a regra (essa está
 * em checks.test.js): é o job não parar de vigiar justamente quando há erro.
 */
import { describe, it, expect, vi } from 'vitest';
import { apuraConsistencia, rodaEGrava, rodaParaTodosOsTenants } from './index.js';

const NUMEROS_OK = {
  totalLeads: 24, porEtapa: { 'Novos Leads': 14, 'Interação': 5, 'Visita Agendada': 3, 'Proposta Assinada': 2 },
  comCorretor: 4, contatados: 3, naView: 2, naOrigem: 2,
};

/** Fake mínimo: rpc, counts por tabela e insert. */
function fakeSupabase({ numeros = NUMEROS_OK, tenants = [{ id: 't1', name: 'Uma' }], counts = {}, rpcErro = null, inserts = [] } = {}) {
  return {
    inserts,
    rpc: async () => (rpcErro ? { data: null, error: { message: rpcErro } } : { data: numeros, error: null }),
    from(tabela) {
      const chain = {
        _not: false,
        select() { return chain; },
        eq() { return chain; },
        not() { chain._not = true; return chain; },
        insert(linha) { inserts.push(linha); return Promise.resolve({ error: null }); },
        then(resolve) {
          if (tabela === 'tenants') return Promise.resolve({ data: tenants, error: null }).then(resolve);
          const c = counts[tabela] || { total: 10, preenchidas: 10 };
          return Promise.resolve({ count: chain._not ? c.preenchidas : c.total, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

describe('apuraConsistencia', () => {
  it('junta os números do banco com o preenchimento das colunas', async () => {
    const r = await apuraConsistencia(fakeSupabase(), 't1');
    expect(r.ok).toBe(true);
    expect(r.checagens).toHaveLength(5);
  });

  // A causa raiz de quase todos os defeitos de 17 e 18/09.
  it('acusa quando uma coluna que vira número está 100% vazia', async () => {
    const supa = fakeSupabase({ counts: { proposals: { total: 36, preenchidas: 0 } } });
    const r = await apuraConsistencia(supa, 't1');
    expect(r.ok).toBe(false);
    expect(r.checagens.find((c) => /100% vazia/.test(c.nome)).detalhe).toContain('proposals');
  });

  it('erro na função do banco sobe — nao vira relatorio "ok" silencioso', async () => {
    await expect(apuraConsistencia(fakeSupabase({ rpcErro: 'boom' }), 't1')).rejects.toThrow(/boom/);
  });
});

describe('rodaEGrava', () => {
  it('grava uma linha com o veredito e as checagens', async () => {
    const inserts = [];
    await rodaEGrava(fakeSupabase({ inserts }), 't1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tenant_id: 't1', ok: true });
    expect(Array.isArray(inserts[0].checagens)).toBe(true);
  });
});

describe('rodaParaTodosOsTenants', () => {
  it('conta quantas passaram e quantas tem problema', async () => {
    const supa = fakeSupabase({ tenants: [{ id: 't1', name: 'Uma' }, { id: 't2', name: 'Outra' }] });
    const r = await rodaParaTodosOsTenants(supa);
    expect(r).toMatchObject({ total: 2, ok: 2, comProblema: 0, falharam: 0 });
  });

  /**
   * O ponto deste teste: um job de saúde que para no primeiro erro deixa de
   * vigiar exatamente quando há erro. Uma imobiliária quebrada não pode
   * silenciar as outras.
   */
  it('uma imobiliaria que falha nao interrompe as demais', async () => {
    const supa = fakeSupabase({ tenants: [{ id: 'ruim', name: 'Ruim' }, { id: 'boa', name: 'Boa' }] });
    const rpcOriginal = supa.rpc;
    supa.rpc = async (_fn, args) =>
      args.p_tenant === 'ruim' ? { data: null, error: { message: 'explodiu' } } : rpcOriginal();

    const erros = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await rodaParaTodosOsTenants(supa);
    erros.mockRestore();

    expect(r).toMatchObject({ total: 2, ok: 1, falharam: 1 });
  });

  it('avisa no log qual checagem falhou, com o detalhe', async () => {
    const supa = fakeSupabase({ counts: { proposals: { total: 36, preenchidas: 0 } } });
    const avisos = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m) => avisos.push(String(m)));
    await rodaParaTodosOsTenants(supa);
    spy.mockRestore();
    expect(avisos.join(' ')).toContain('proposals');
  });
});
