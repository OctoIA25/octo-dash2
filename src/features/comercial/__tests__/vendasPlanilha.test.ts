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
 * O que sobra para o front proteger são duas coisas pequenas e caras:
 * **o filtro que saiu não pode voltar pela chamada**, e **falha de leitura não
 * pode virar lista vazia**.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { carregarPlanilha } from '../vendasPlanilhaService';

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const RESPOSTA = {
  linhas: [], total_linhas: 0, total_vgv: 0,
  total_comissao: 0, total_imobiliaria: 0, total_recebido: 0,
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: RESPOSTA, error: null });
});

describe('a chamada manda só o que a planilha tem', () => {
  /*
   * O `p_tipo` saiu da função do banco junto com o filtro Lançamentos/Prontos.
   * Mandá-lo assim mesmo não daria erro visível — o PostgREST responderia
   * "function not found" e a tela ficaria vazia, que é indistinguível de "não
   * houve venda no período".
   */
  it('não manda mais o filtro de lançamento/pronto', async () => {
    await carregarPlanilha('t1', { de: '2026-09-01', ate: '2026-09-30' });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).toEqual(['p_tenant_id', 'p_de', 'p_ate', 'p_corretor']);
  });

  it('o recorte por período e por corretor continua indo', async () => {
    await carregarPlanilha('t1', { de: '2026-09-01', ate: '2026-09-30', corretor: 'Ana' });
    expect(rpc).toHaveBeenCalledWith('vendas_planilha_conferencia', {
      p_tenant_id: 't1', p_de: '2026-09-01', p_ate: '2026-09-30', p_corretor: 'Ana',
    });
  });

  it('filtro em branco vira nulo, e não a string vazia', async () => {
    await carregarPlanilha('t1', { corretor: '' });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_corretor).toBeNull();
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
