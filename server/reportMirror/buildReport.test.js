// PT-BR: testes de montarMatriz (pura); coletarVendas ganha 1 teste focado
// de paginação com stub mínimo (sem bater no Supabase de verdade).
import { describe, it, expect } from 'vitest';
import { montarMatriz, HEADER, coletarVendas } from './buildReport.js';

const venda = (extra = {}) => ({
  signedAt: '2026-08-10T12:00:00Z',
  empreendimento: 'Castanheira',
  unidade: 'N-6',
  cliente: 'Tayná & Bruno',
  corretorNome: 'David',
  corretorNivel: 'pleno',
  liderNome: 'André',
  liderNivel: 'coordenador',
  vgv: 635000.18,
  classification: ['lancamento'],
  commissionOverride: null,
  ...extra,
});

describe('montarMatriz', () => {
  it('agrupa por mês com seção, linhas e subtotal', () => {
    const m = montarMatriz([venda(), venda({ signedAt: '2026-07-01T12:00:00Z', unidade: 'H-1' })], '2026-08-28T15:00:00Z');
    expect(m[0][0]).toContain('ESPELHO AUTOMÁTICO');
    expect(m[1]).toEqual(HEADER);
    const secoes = m.filter((r) => /^\d{2}\/\d{4}$/.test(String(r[0])));
    expect(secoes.map((r) => r[0])).toEqual(['07/2026', '08/2026']); // cronológico
    expect(m.filter((r) => r[0] === 'SUBTOTAL')).toHaveLength(2);
  });

  it('calcula comissão derivada (3,5%) e splits pleno/coordenador', () => {
    const m = montarMatriz([venda()], '2026-08-28T15:00:00Z');
    const linha = m.find((r) => r[3] === 'N-6');
    const comissao = Math.round(635000.18 * 3.5) / 100; // 22225.01
    expect(linha[9]).toBeCloseTo(comissao, 2);           // Comissão Total
    expect(linha[10]).toBeCloseTo(comissao * 0.45, 2);   // Corretor (pleno 45%)
    expect(linha[12]).toBeCloseTo(comissao * 0.15, 2);   // Líder (60-45)
    expect(linha[13]).toBeCloseTo(comissao * 0.40, 2);   // Lotus (100-60)
    expect(linha[8]).toBe(3.5);                          // % aplicado
  });

  it('override de comissão vence a derivação e zera o %', () => {
    const m = montarMatriz([venda({ commissionOverride: 33421.06 })], '2026-08-28T15:00:00Z');
    const linha = m.find((r) => r[3] === 'N-6');
    expect(linha[9]).toBeCloseTo(33421.06, 2);
    expect(linha[8]).toBe('');
  });

  it('bloqueio L003 (júnior sem líder) sai com splits vazios e Obs', () => {
    const m = montarMatriz([venda({ corretorNivel: 'junior', liderNome: null, liderNivel: null })], '2026-08-28T15:00:00Z');
    const linha = m.find((r) => r[3] === 'N-6');
    expect(linha[10]).toBe('');
    expect(String(linha[14])).toContain('L003');
  });

  it('subtotal soma só as linhas do mês, ignorando bloqueadas', () => {
    const m = montarMatriz(
      [venda(), venda({ unidade: 'X-1', corretorNivel: 'junior', liderNome: null, liderNivel: null })],
      '2026-08-28T15:00:00Z',
    );
    const sub = m.find((r) => r[0] === 'SUBTOTAL');
    expect(sub[9]).toBeCloseTo(Math.round(635000.18 * 3.5) / 100, 2);
  });

  // Ruling: nível cadastrado mas inexistente no motor -> L003 (mesmo com corretor presente).
  it('bloqueio L003 (nível não cadastrado) sai com splits vazios e Obs', () => {
    const m = montarMatriz(
      [venda({ corretorNome: 'Fulano', corretorNivel: 'inexistente' })],
      '2026-08-28T15:00:00Z',
    );
    const linha = m.find((r) => r[3] === 'N-6');
    expect(linha[10]).toBe('');
    expect(String(linha[14])).toContain('L003');
  });

  // Ruling: sem corretor nenhum -> caso normal, 100% pra Lotus, sem bloqueio.
  it('sem corretor: 100% da comissão vai pra Lotus, sem bloqueio, entra no subtotal', () => {
    const m = montarMatriz(
      [venda({ corretorNome: '', corretorNivel: null, liderNome: null, liderNivel: null })],
      '2026-08-28T15:00:00Z',
    );
    const linha = m.find((r) => r[3] === 'N-6');
    const comissao = Math.round(635000.18 * 3.5) / 100;
    expect(linha[6]).toBe(''); // Nível vazio
    expect(linha[5]).toBe(''); // Corretor vazio
    expect(linha[13]).toBeCloseTo(comissao, 2); // Lotus R$ = comissão cheia
    expect(linha[14]).toBe(''); // sem Obs/bloqueio

    const sub = m.find((r) => r[0] === 'SUBTOTAL');
    expect(sub[9]).toBeCloseTo(comissao, 2); // subtotal inclui a linha (não bloqueada)
    expect(sub[13]).toBeCloseTo(comissao, 2);
  });

  // Finding do review: bucketing tinha que ser em America/Sao_Paulo, não UTC.
  it('agrupa e formata Assinatura em horário de São Paulo (não UTC)', () => {
    // 2026-08-01T01:30:00Z = 31/07/2026 22:30 BRT (UTC-3) — vira mês 07, não 08.
    const m = montarMatriz([venda({ signedAt: '2026-08-01T01:30:00Z' })], '2026-08-28T15:00:00Z');
    const secoes = m.filter((r) => /^\d{2}\/\d{4}$/.test(String(r[0])));
    expect(secoes.map((r) => r[0])).toEqual(['07/2026']);
    const linha = m.find((r) => r[3] === 'N-6');
    expect(linha[1]).toBe('2026-07-31'); // coluna Assinatura, também em SP
  });
});

describe('coletarVendas — paginação', () => {
  it('pagina proposals e tenant_memberships além de 1000 linhas, concatenando', async () => {
    const proposalsPag1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `p${i}`, value: 100, signed_at: '2026-08-01T00:00:00Z', commission_total: null,
      forecast_empreendimento: 'E', forecast_unidade: `U${i}`, agent_user_id: null, agent_name: 'X', lead_id: null,
    }));
    const proposalsPag2 = [{
      id: 'p1000', value: 100, signed_at: '2026-08-02T00:00:00Z', commission_total: null,
      forecast_empreendimento: 'E', forecast_unidade: 'ULTIMA', agent_user_id: null, agent_name: 'X', lead_id: null,
    }];
    let proposalsRangeCalls = 0;

    // Stub mínimo: builder encadeável (select/eq/not/order/in retornam this),
    // .range() resolve por página conforme a tabela.
    const stub = {
      from(table) {
        const builder = {
          select: () => builder,
          eq: () => builder,
          not: () => builder,
          order: () => builder,
          in: () => builder,
          range: () => {
            if (table === 'proposals') {
              const pagina = proposalsRangeCalls === 0 ? proposalsPag1 : proposalsPag2;
              proposalsRangeCalls += 1;
              return Promise.resolve({ data: pagina, error: null });
            }
            if (table === 'tenant_memberships') {
              return Promise.resolve({ data: [], error: null }); // 1 página curta, sem líderes
            }
            return Promise.resolve({ data: [], error: null });
          },
          then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return builder;
      },
    };

    const vendas = await coletarVendas(stub, 'tenant-x');
    expect(proposalsRangeCalls).toBe(2); // pediu as duas páginas
    expect(vendas).toHaveLength(1001);   // concatenou as duas
    expect(vendas.some((v) => v.unidade === 'ULTIMA')).toBe(true); // linha da 2ª página presente
  });

  // F2: leadIds > 200 tem que virar múltiplas chamadas .in() (teto silencioso do
  // PostgREST em 1000 linhas por resposta), com os resultados de todas mescladas.
  it('quebra leadIds em lotes de 200 no .in() e mescla os resultados de todos os lotes', async () => {
    const N = 250;
    const proposals = Array.from({ length: N }, (_, i) => ({
      id: `p${i}`, value: 100, signed_at: '2026-08-01T00:00:00Z', commission_total: null,
      forecast_empreendimento: 'E', forecast_unidade: `U${i}`, agent_user_id: null, agent_name: 'X', lead_id: `lead${i}`,
    }));
    let leadsInCalls = 0;

    const stub = {
      from(table) {
        const builder = {
          select: () => builder,
          eq: () => builder,
          not: () => builder,
          order: () => builder,
          in: (_coluna, ids) => {
            if (table === 'leads') {
              leadsInCalls += 1;
              // devolve só as linhas que casam com ESTE lote (como o PostgREST faria)
              return Promise.resolve({ data: ids.map((id) => ({ id, classification: 'lancamento' })), error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
          range: () => Promise.resolve({ data: table === 'proposals' ? proposals : [], error: null }),
        };
        return builder;
      },
    };

    const vendas = await coletarVendas(stub, 'tenant-x');
    expect(leadsInCalls).toBe(2); // 250 ids / 200 por lote = 2 chamadas
    expect(vendas).toHaveLength(N);
    // se a mescla dos lotes estivesse quebrada (ex.: só o último lote sobrevivendo),
    // parte das vendas ficaria sem classification e cairia pra 6% em vez de 3,5%.
    expect(vendas.every((v) => v.classification === 'lancamento')).toBe(true);
  });
});
