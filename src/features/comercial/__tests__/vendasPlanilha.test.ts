/**
 * A leitura da planilha na Conferência de vendas.
 *
 * O arquivo era sobre a coluna de pagamento — "à vista / 3 de 5 parcelas",
 * pedido do chefe em 24/09. Em 25/09 ele pediu o contrário: "deixe apenas as
 * informações da planilha que enviei", e a coluna saiu junto com o gerente e o
 * filtro de lançamento/pronto. As travas daquela coluna continuam no banco,
 * onde a tabela ficou, e são conferidas por
 * `supabase/tests/conferencia_da_planilha.test.sql`.
 *
 * 29/09: os filtros voltaram — equipe, pronto/lançamento, construtora,
 * empreendimento e situação — como RECORTE, na barra de cima da página.
 *
 * O que o front protege são duas coisas pequenas e caras: **os nomes da
 * chamada são os da função do banco**, e **falha de leitura não pode virar
 * lista vazia**.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { carregarPlanilha, gravarCodigoDaVenda } from '../vendasPlanilhaService';
import { carregarConferencia } from '../vendasService';

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const RESPOSTA = {
  linhas: [], total_linhas: 0, total_unidade: 0,
  total_comissao: 0, total_imobiliaria: 0, total_recebido: 0,
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: RESPOSTA, error: null });
});

describe('a chamada usa os nomes da função do banco', () => {
  /*
   * Um nome que o banco não conhece não dá erro visível — o PostgREST
   * responde "function not found" e a tela fica vazia, que é indistinguível
   * de "não houve venda no período". Os nomes abaixo são os da migration
   * 20260929_conferencia_filtros_em_cima.
   */
  it('planilha: os nove filtros, com os nomes do banco', async () => {
    await carregarPlanilha('t1', {
      de: '2026-09-01', ate: '2026-09-30', corretor: 'Ana', equipeId: 'e1', tipo: 'lancamento',
      construtoraId: 'c1', lancamentoId: 'l1', situacao: 'parcelado',
    });
    expect(rpc).toHaveBeenCalledWith('vendas_planilha_conferencia', {
      p_tenant_id: 't1', p_de: '2026-09-01', p_ate: '2026-09-30', p_corretor: 'Ana',
      p_equipe_id: 'e1', p_tipo: 'lancamento', p_construtora_id: 'c1',
      p_lancamento_id: 'l1', p_situacao: 'parcelado',
    });
  });

  it('CRM: os filtros novos vão com os nomes do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await carregarConferencia('t1', {
      de: '2026-09-01', ate: '2026-09-30', equipeId: 'e1', tipo: 'terceiros', lancamentoId: 'l1',
    });
    expect(rpc).toHaveBeenCalledWith('vendas_conferencia', {
      p_tenant_id: 't1', p_de: '2026-09-01', p_ate: '2026-09-30', p_status: null,
      p_construtora_id: null, p_corretor_id: null,
      p_equipe_id: 'e1', p_tipo: 'terceiros', p_lancamento_id: 'l1', p_situacao: null,
    });
  });

  // 03/10: o CRM filtra pela mesma situação da aba Planilha (pago/parcelado/pendente).
  it('CRM: a situação vai como p_situacao', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await carregarConferencia('t1', { de: '2026-09-01', ate: '2026-09-30', situacao: 'parcelado' });
    expect((rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>).p_situacao).toBe('parcelado');
  });

  /*
   * O select da tela manda '' para "Todos". Se isso chegasse ao banco como
   * texto, "tipo = ''" não casaria com nada e a lista viria vazia.
   */
  it('filtro em branco vira nulo, e não a string vazia', async () => {
    await carregarPlanilha('t1', { corretor: '', equipeId: '', tipo: '', situacao: '' });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect([args.p_corretor, args.p_equipe_id, args.p_tipo, args.p_situacao]).toEqual([null, null, null, null]);
  });
});

describe('o código do imóvel das vendas de terceiros', () => {
  it('grava com os nomes da função do banco, sem espaço sobrando', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await gravarCodigoDaVenda('linha-1', '  110D1GD ');
    expect(rpc).toHaveBeenCalledWith('venda_planilha_gravar_codigo', {
      p_venda_planilha_id: 'linha-1', p_codigo: '110D1GD',
    });
  });

  // Apagar é mandar nulo: é o que o banco entende como "tira o código".
  it('campo em branco apaga', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await gravarCodigoDaVenda('linha-1', '   ');
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_codigo).toBeNull();
  });

  it('recusa do banco sobe, para a tela desfazer e avisar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'sem permissao para editar o codigo' } });
    await expect(gravarCodigoDaVenda('linha-1', 'X')).rejects.toMatchObject({
      message: 'sem permissao para editar o codigo',
    });
  });
});

describe('falha de leitura não vira lista vazia', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. "Nenhuma venda da planilha neste recorte" e
   * "não deu para ler" levam a conclusões opostas sobre o mês, e a tela só
   * sabe distinguir se o serviço distinguir.
   */
  it('erro do banco sobe, em vez de devolver zero venda', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'sem permissao para a conferencia' } });
    await expect(carregarPlanilha('t1')).rejects.toMatchObject({
      message: 'sem permissao para a conferencia',
    });
  });

  it('o owner não consulta — ele não tem imobiliária', async () => {
    expect(await carregarPlanilha('owner')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
