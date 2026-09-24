/**
 * A coluna de pagamento da Conferência de vendas — item 5 do chefe, 24/09.
 *
 * O que se protege aqui é o rótulo e a recusa. A planilha não tem forma de
 * pagamento; a coluna é preenchida à mão, e a forma mais fácil de ela mentir é
 * dizer "à vista · 3 de 5" ou "0 de 0 parcelas".
 *
 * O banco também recusa (há CHECK), e de propósito: a trava daqui existe para
 * a pessoa ver o motivo em português antes de a gravação sair, em vez de
 * receber uma violação de constraint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rotuloDoPagamento, gravarPagamento, type VendaDaPlanilha } from '../vendasPlanilhaService';

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const venda = (over: Partial<VendaDaPlanilha> = {}): VendaDaPlanilha => ({
  id: 'v1', data_assinatura: '2026-09-10', empreendimento: 'Reserva Castanheira',
  unidade_codigo: 'B · 27', cliente_nome: null, corretor_nome: 'Ana', nivel_corretor: 'PL',
  gerente: 'Gisele', tipo_negocio: 'lancamento',
  origem: 'Santa', area_m2: 120, valor_m2: 4166.67, total_unidade: 515463,
  valor_vgv: 500000, comissao_total_venda: 25000,
  repasse_corretor: 10000, team_leader_valor: 5000, comissao_imobiliaria: 10000,
  status_recebimento: null,
  data_recebimento: null, pagamento_forma: null, parcelas_total: null, parcelas_pagas: null,
  ...over,
});

describe('rótulo do pagamento', () => {
  it('à vista', () => {
    expect(rotuloDoPagamento(venda({ pagamento_forma: 'a_vista' }))).toBe('à vista');
  });

  it('parcelado sai como "3 de 5 parcelas", que foi o que o chefe escreveu', () => {
    expect(rotuloDoPagamento(venda({ pagamento_forma: 'parcelado', parcelas_total: 5, parcelas_pagas: 3 })))
      .toBe('3 de 5 parcelas');
  });

  /*
   * O caso que decide se a coluna serve. `null` NÃO é "à vista" nem
   * "0 parcelas": é "ninguém preencheu ainda". Devolver um texto aqui faria a
   * tela afirmar uma forma de pagamento que ninguém informou — e o contador de
   * pendências zeraria sozinho.
   */
  it('sem preenchimento devolve null, e não um texto plausível', () => {
    expect(rotuloDoPagamento(venda())).toBeNull();
  });
});

describe('gravar pagamento', () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ error: null }); });

  it('parcelado sem dizer quantas é recusado antes de ir ao banco', async () => {
    const r = await gravarPagamento('v1', { forma: 'parcelado', parcelasTotal: null });
    expect(r).toEqual({ success: false, error: 'diga em quantas parcelas' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mais pagas do que parcelas é recusado, e diz o limite', async () => {
    const r = await gravarPagamento('v1', { forma: 'parcelado', parcelasTotal: 5, parcelasPagas: 6 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('0 a 5');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('zero parcelas é recusado — "0 de 0" não quer dizer nada', async () => {
    const r = await gravarPagamento('v1', { forma: 'parcelado', parcelasTotal: 0 });
    expect(r.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('à vista não manda parcela nenhuma para o banco', async () => {
    const r = await gravarPagamento('v1', { forma: 'a_vista', parcelasTotal: 5, parcelasPagas: 3 });
    expect(r.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('venda_pagamento_gravar', expect.objectContaining({
      p_forma: 'a_vista', p_parcelas_total: null, p_parcelas_pagas: 0,
    }));
  });

  it('limpar manda forma nula — apagar é diferente de gravar "à vista"', async () => {
    const r = await gravarPagamento('v1', { forma: null });
    expect(r.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('venda_pagamento_gravar', expect.objectContaining({ p_forma: null }));
  });

  it('erro do banco volta como falha, e não como sucesso silencioso', async () => {
    rpc.mockResolvedValue({ error: { message: 'sem permissao para editar o pagamento' } });
    const r = await gravarPagamento('v1', { forma: 'a_vista' });
    expect(r).toEqual({ success: false, error: 'sem permissao para editar o pagamento' });
  });
});
