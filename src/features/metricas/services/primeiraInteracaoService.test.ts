/**
 * O número que esta fatia trocou de fonte.
 *
 * O fake honra os filtros, como o PostgREST: se a consulta esquecer o tenant,
 * o período ou o `archived_at`, ele devolve as linhas erradas — que é
 * exatamente o defeito que o teste precisa enxergar.
 */
import { describe, it, expect, vi } from 'vitest';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const CORRETOR = '3f7a1c2e-9b4d-4a6f-8c1e-2d5b7a9f0c34';

// minutos: 10, 20, 30 no tenant A dentro do período (mediana 20).
//
// As grafias de `assigned_agent_name` são de propósito diferentes entre si:
// é assim que a base está — a origem grava "FERNANDA SOUZA" e o cadastro diz
// "Fernanda Souza".
const BASE = [
  { tenant_id: TENANT_A, assigned_agent_id: CORRETOR, assigned_agent_name: 'FERNANDA SOUZA',  archived_at: null, lead_criado_em: '2026-09-02T10:00:00Z', minutos_ate_primeiro_contato: 10 },
  { tenant_id: TENANT_A, assigned_agent_id: 'outro',  assigned_agent_name: 'Outro Corretor',  archived_at: null, lead_criado_em: '2026-09-03T10:00:00Z', minutos_ate_primeiro_contato: 20 },
  { tenant_id: TENANT_A, assigned_agent_id: CORRETOR, assigned_agent_name: 'Fernanda  Souza', archived_at: null, lead_criado_em: '2026-09-04T10:00:00Z', minutos_ate_primeiro_contato: 30 },
  // fora por tenant, por arquivamento e por período, nessa ordem:
  { tenant_id: TENANT_B, assigned_agent_id: CORRETOR, assigned_agent_name: 'FERNANDA SOUZA',  archived_at: null, lead_criado_em: '2026-09-02T10:00:00Z', minutos_ate_primeiro_contato: 9999 },
  { tenant_id: TENANT_A, assigned_agent_id: CORRETOR, assigned_agent_name: 'FERNANDA SOUZA',  archived_at: '2026-09-05T10:00:00Z', lead_criado_em: '2026-09-02T10:00:00Z', minutos_ate_primeiro_contato: 8888 },
  { tenant_id: TENANT_A, assigned_agent_id: CORRETOR, assigned_agent_name: 'FERNANDA SOUZA',  archived_at: null, lead_criado_em: '2026-08-15T10:00:00Z', minutos_ate_primeiro_contato: 7777 },
];

let falhar = false;
const tabelasLidas: string[] = [];
const filtrosVistos: Array<[string, unknown]> = [];

function builder(tabela: string) {
  tabelasLidas.push(tabela);
  const eqs: Array<[string, unknown]> = [];
  let soAtivos = false;
  let de = '';
  let ate = '';
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'limit']) chain[m] = () => chain;
  chain.eq = (col: string, val: unknown) => { eqs.push([col, val]); filtrosVistos.push([col, val]); return chain; };
  chain.is = (col: string, val: unknown) => { if (col === 'archived_at' && val === null) soAtivos = true; return chain; };
  chain.gte = (_c: string, v: string) => { de = v; return chain; };
  chain.lte = (_c: string, v: string) => { ate = v; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    if (falhar) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
    const data = BASE.filter((l) => {
      if (soAtivos && l.archived_at !== null) return false;
      if (de && l.lead_criado_em < de) return false;
      if (ate && l.lead_criado_em > ate) return false;
      return eqs.every(([col, val]) => (l as Record<string, unknown>)[col] === val);
    });
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

const { buscarPrimeiraInteracao, medianaMinutos } = await import('./primeiraInteracaoService');

describe('medianaMinutos', () => {
  it('mediana ímpar e par', () => {
    expect(medianaMinutos([30, 10, 20])).toBe(20);
    expect(medianaMinutos([10, 20, 30, 40])).toBe(25);
  });

  // A razão de não ser média: um lead recontatado semanas depois move a média
  // em horas e não toca a mediana. Foi essa cauda que fazia o card da Lotus
  // anunciar 12,9 dias de "tempo de resposta".
  it('cauda longa não desloca a mediana', () => {
    expect(medianaMinutos([1, 2, 3, 4, 100000])).toBe(3);
  });

  // `Number(null)` é 0: sem descartar antes do cast, um nulo entrava como
  // "respondeu em zero minuto" e puxava a mediana para baixo.
  it('nulo não vira zero', () => {
    expect(medianaMinutos([null, undefined, '', 10, 20, 30] as unknown as number[])).toBe(20);
  });

  it('sem amostra devolve null, não 0', () => {
    expect(medianaMinutos([])).toBeNull();
    expect(medianaMinutos([-5, -10])).toBeNull();
  });

  it('zero minuto é medição válida, não ausência', () => {
    expect(medianaMinutos([0, 0, 0])).toBe(0);
  });

  it('aceita número em string, que é como o PostgREST devolve numeric', () => {
    expect(medianaMinutos(['1.4', '0.3', '2.5'] as unknown as number[])).toBe(1.4);
  });
});

describe('buscarPrimeiraInteracao', () => {
  it('lê a view da LIA, não a tabela leads', async () => {
    tabelasLidas.length = 0;
    await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30');
    expect(tabelasLidas).toContain('primeira_interacao');
    expect(tabelasLidas).not.toContain('leads');
  });

  // A view do corretor nasce de `lead_toques`, que tem RLS sem policy: lida do
  // browser devolve 42501. Se alguém apontar este serviço para ela, quebra aqui.
  it('NÃO lê a view do corretor (essa é server-only)', async () => {
    tabelasLidas.length = 0;
    await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30');
    expect(tabelasLidas).not.toContain('primeira_interacao_corretor');
  });

  it('recorta por tenant, período e não-arquivado', async () => {
    const a = await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30');
    expect(a.minutos.sort((x, y) => x - y)).toEqual([10, 20, 30]);
    expect(a.leadsContatados).toBe(3);
    expect(medianaMinutos(a.minutos)).toBe(20);
  });

  it('por UUID, o corretor vê só os leads dele', async () => {
    const a = await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30', { corretorId: CORRETOR });
    expect(a.minutos.sort((x, y) => x - y)).toEqual([10, 30]);
  });

  /**
   * Metade das telas identifica o corretor por NOME, não por UUID. Mandar o
   * nome no `eq('assigned_agent_id', ...)` não casa com nada — e o painel de
   * todo corretor sem UUID diria "Sem dados" sem erro nenhum, que é o mesmo
   * jeito silencioso como os KPIs de Relatórios ficaram zerados por meses.
   */
  it('por NOME, casa com grafia diferente (maiúscula, acento, espaço duplo)', async () => {
    const a = await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30', { corretorId: 'Fernanda Souza' });
    expect(a.minutos.sort((x, y) => x - y)).toEqual([10, 30]);
    expect(a.leadsContatados).toBe(2);
  });

  it('por NOME, nao manda o nome no filtro de assigned_agent_id do banco', async () => {
    filtrosVistos.length = 0;
    await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30', { corretorId: 'Fernanda Souza' });
    expect(filtrosVistos.find(([col]) => col === 'assigned_agent_id')).toBeUndefined();
  });

  it('por UUID, manda o filtro para o banco', async () => {
    filtrosVistos.length = 0;
    await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30', { corretorId: CORRETOR });
    expect(filtrosVistos).toContainEqual(['assigned_agent_id', CORRETOR]);
  });

  // Erro de leitura não pode virar "0 min" nem "0 leads contatados": os dois
  // são números plausíveis, e foi assim que o bug das colunas inexistentes
  // passou meses despercebido nesta tela.
  it('falha de leitura devolve null, que e diferente de zero contatados', async () => {
    falhar = true;
    const a = await buscarPrimeiraInteracao(TENANT_A, '2026-09-01', '2026-09-30');
    falhar = false;
    expect(a.leadsContatados).toBeNull();
    expect(medianaMinutos(a.minutos)).toBeNull();
  });

  // O outro lado: período de verdade sem nenhum contato devolve 0, não null.
  it('periodo sem contato nenhum devolve 0 contatados, nao null', async () => {
    const a = await buscarPrimeiraInteracao(TENANT_A, '2026-01-01', '2026-01-31');
    expect(a.leadsContatados).toBe(0);
    expect(medianaMinutos(a.minutos)).toBeNull();
  });
});
