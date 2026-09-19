/**
 * `construtorasService` — a camada que lê o cadastro de construtoras.
 *
 * O que estes testes protegem, e por quê:
 *
 * 1. A COMISSÃO NUNCA ENTRA NA PROJEÇÃO. O banco não concede essa coluna a
 *    quem está logado (GRANT por coluna, molde do `proprietario_*` dos
 *    imóveis): pedi-la devolve 42501 e derruba a tela inteira. Não é estilo,
 *    é contrato com o banco.
 * 2. NÃO EXISTE `select('*')`. Sem SELECT de tabela, o asterisco falha
 *    inteiro — e é justamente essa ausência que impede a comissão de escapar
 *    num select distraído.
 * 3. ERRO DE LEITURA LANÇA, não devolve lista vazia. Lista vazia por falha é
 *    indistinguível de "nada cadastrado", e foi assim que a aba de imóveis
 *    escondeu erro durante meses neste projeto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Chamada { tabela: string; colunas: string; filtros: Record<string, unknown> }
const chamadas: Chamada[] = [];
let respostaErro: { code: string; message: string } | null = null;
let linhas: Array<Record<string, unknown>> = [];
let rpcChamada: { nome: string; args: unknown } | null = null;
let rpcResposta: Array<Record<string, unknown>> = [];

function fake(tabela: string) {
  const c: Chamada = { tabela, colunas: '', filtros: {} };
  const chain: Record<string, unknown> = {};
  chain.select = (cols: string) => { c.colunas = cols; return chain; };
  chain.eq = (k: string, v: unknown) => { c.filtros[k] = v; return chain; };
  chain.order = () => chain;
  chain.upsert = (linha: unknown) => { c.filtros.__upsert = linha; chamadas.push(c); return Promise.resolve({ error: respostaErro }); };
  chain.delete = () => chain;
  chain.then = (resolve: (r: unknown) => unknown) => {
    chamadas.push(c);
    return Promise.resolve({ data: respostaErro ? null : linhas, error: respostaErro }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (t: string) => fake(t),
    rpc: (nome: string, args: unknown) => {
      rpcChamada = { nome, args };
      return Promise.resolve({ data: rpcResposta, error: null });
    },
  },
}));

const TENANT = 't1';

beforeEach(() => {
  chamadas.length = 0;
  respostaErro = null;
  rpcChamada = null;
  rpcResposta = [];
  linhas = [{
    id: 'c1', codigo: 'santa_angela', nome: 'Santa Ângela', razao_social: null,
    responsavel_nome: null, responsavel_telefone: null, responsavel_email: null,
    prazo_pagamento_dias: null, dados_nota: null, e_avulso: false, ativa: true, observacao: null,
  }];
});

describe('a projeção não pode conter a comissão', () => {
  it('a lista de colunas NÃO pede comissao_padrao_pct', async () => {
    const { fetchConstrutoras } = await import('../construtorasService');
    await fetchConstrutoras(TENANT);
    expect(chamadas[0].colunas).not.toContain('comissao');
  });

  it('não usa select(*) — sem SELECT de tabela ele falharia inteiro', async () => {
    const { fetchConstrutoras } = await import('../construtorasService');
    await fetchConstrutoras(TENANT);
    expect(chamadas[0].colunas.trim()).not.toBe('*');
    expect(chamadas[0].colunas).toContain('nome');
  });

  it('o escopo por imobiliária é obrigatório', async () => {
    const { fetchConstrutoras } = await import('../construtorasService');
    await fetchConstrutoras(TENANT);
    expect(chamadas[0].filtros.tenant_id).toBe(TENANT);
  });

  it('a visão de dono sem imobiliária não consulta nada', async () => {
    const { fetchConstrutoras } = await import('../construtorasService');
    expect(await fetchConstrutoras('owner')).toEqual([]);
    expect(chamadas.length).toBe(0);
  });
});

describe('falha de leitura não vira lista vazia', () => {
  it('erro ao listar LANÇA em vez de devolver []', async () => {
    respostaErro = { code: '42501', message: 'permission denied' };
    const { fetchConstrutoras } = await import('../construtorasService');
    await expect(fetchConstrutoras(TENANT)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('a comissão sai só pela RPC', () => {
  it('fetchComissoes chama a função do banco, não a tabela', async () => {
    rpcResposta = [{ construtora_id: 'c1', codigo: 'x', nome: 'X', comissao_padrao_pct: '6.00', prazo_pagamento_dias: 30 }];
    const { fetchComissoes } = await import('../construtorasService');
    const r = await fetchComissoes(TENANT);
    expect(rpcChamada?.nome).toBe('construtoras_comissao');
    expect(chamadas.length).toBe(0);
    expect(r[0].comissaoPadraoPct).toBe(6);
  });

  it('quem o banco não autoriza recebe lista vazia, e isso não é erro', async () => {
    rpcResposta = [];
    const { fetchComissoes } = await import('../construtorasService');
    expect(await fetchComissoes(TENANT)).toEqual([]);
  });
});

describe('gravação', () => {
  it('NÃO manda a comissão quando quem salva não pode vê-la', async () => {
    const { salvarConstrutora } = await import('../construtorasService');
    await salvarConstrutora(TENANT, {
      codigo: 'tebas', nome: 'Tebas', razaoSocial: null, responsavelNome: null,
      responsavelTelefone: null, responsavelEmail: null, prazoPagamentoDias: null,
      dadosNota: null, eAvulso: false, ativa: true, observacao: null,
    });
    const linha = chamadas[0].filtros.__upsert as Record<string, unknown>;
    expect('comissao_padrao_pct' in linha).toBe(false);
  });

  it('manda a comissão quando ela foi informada, inclusive null para limpar', async () => {
    const { salvarConstrutora } = await import('../construtorasService');
    await salvarConstrutora(TENANT, {
      codigo: 'tebas', nome: 'Tebas', razaoSocial: null, responsavelNome: null,
      responsavelTelefone: null, responsavelEmail: null, prazoPagamentoDias: null,
      dadosNota: null, eAvulso: false, ativa: true, observacao: null,
      comissaoPadraoPct: null,
    });
    const linha = chamadas[0].filtros.__upsert as Record<string, unknown>;
    expect('comissao_padrao_pct' in linha).toBe(true);
    expect(linha.comissao_padrao_pct).toBeNull();
  });

  it('código fora do formato é recusado antes de ir ao banco', async () => {
    const { salvarConstrutora } = await import('../construtorasService');
    const r = await salvarConstrutora(TENANT, {
      codigo: 'Santa Ângela', nome: 'Santa Ângela', razaoSocial: null, responsavelNome: null,
      responsavelTelefone: null, responsavelEmail: null, prazoPagamentoDias: null,
      dadosNota: null, eAvulso: false, ativa: true, observacao: null,
    });
    expect(r.success).toBe(false);
    expect(chamadas.length).toBe(0);
  });

  it('duplicata de grafia vira mensagem em português, não código do Postgres', async () => {
    respostaErro = { code: '23505', message: 'duplicate key value violates unique constraint "construtoras_nome_normalizado_uk"' };
    const { salvarConstrutora } = await import('../construtorasService');
    const r = await salvarConstrutora(TENANT, {
      codigo: 'santa_angela_2', nome: 'SANTA ANGELA', razaoSocial: null, responsavelNome: null,
      responsavelTelefone: null, responsavelEmail: null, prazoPagamentoDias: null,
      dadosNota: null, eAvulso: false, ativa: true, observacao: null,
    });
    expect(r.error).toBe('já existe uma construtora com esse nome');
  });
});

describe('codigoDaConstrutora', () => {
  it('vira snake_case sem acento', async () => {
    const { codigoDaConstrutora } = await import('../construtorasService');
    expect(codigoDaConstrutora('Santa Ângela')).toBe('santa_angela');
    expect(codigoDaConstrutora('ARACATU EMPREENDIMENTOS IMOBILIÁRIOS')).toBe('aracatu_empreendimentos_imobiliarios');
    expect(codigoDaConstrutora('F A Oliva')).toBe('f_a_oliva');
  });

  it('nome que não deixa nada aproveitável ainda devolve um código válido', async () => {
    const { codigoDaConstrutora } = await import('../construtorasService');
    expect(codigoDaConstrutora('!!!')).toBe('construtora');
    expect(codigoDaConstrutora('')).toBe('construtora');
  });
});
