/**
 * A data da baixa — 30/09/2026.
 *
 * Pagar gravava sempre o dia do clique. Foram lançadas 88 contas já pagas de
 * uma vez, e todas ficaram com 30/09 — a mais antiga era de fevereiro de 2025.
 * A tela não deixava corrigir, e a data real acabou escrita no histórico.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));

const baixar = vi.fn();
const carregarLancamentos = vi.fn();
vi.mock('../financeiroService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  baixar: (...a: unknown[]) => baixar(...a),
  carregarLancamentos: (...a: unknown[]) => carregarLancamentos(...a),
  carregarPlanoDeContas: async () => [],
}));

import { FinanceiroPage } from '../FinanceiroPage';
import type { Lancamento } from '../financeiro';

const linha = (extra: Partial<Lancamento>): Lancamento => ({
  id: 'x', tipo: 'pagar', descricao: '', valor: 100, competencia: '2026-09-01',
  vencimento: '2026-09-10', pago_em: null, valor_pago: null, status: 'aberto',
  origem: 'manual', origem_id: null, centro_custo: '', anexo: null, observacao: '',
  conta_id: null, conta_codigo: null, conta_nome: null, vencido: false,
  dias_de_atraso: null, venda_tipo: null, portal: null, valor_liquido: null,
  ...extra,
});

const abrir = (linhas: Lancamento[]) => {
  carregarLancamentos.mockResolvedValue({
    de: '2026-09-01', ate: '2026-09-30', por: 'vencimento', linhas,
    totais: {
      lancamentos: linhas.length, a_receber: 0, a_pagar: 0, recebido: 0, pago: 0,
      vencidos: 0, valor_vencido: 0, sem_conta: 0, liquido: 0,
      de_lancamento: 0, de_terceiros: 0, sem_venda: 0,
    },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/financeiro?tab=pagar']}>
      <QueryClientProvider client={qc}><FinanceiroPage /></QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  // 23h30 em São Paulo já é 1º/10 em Greenwich — o dia em que `toISOString`
  // gravava a baixa no dia seguinte.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T02:30:00Z'));
  baixar.mockReset().mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe('a baixa pergunta a data', () => {
  it('pagar abre a data com hoje (de São Paulo) e grava a data escolhida', async () => {
    abrir([linha({ id: 'l1' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'pagar' }));

    const data = screen.getByLabelText('Data do pagamento') as HTMLInputElement;
    expect(data.value).toBe('2026-09-30');
    expect(baixar).not.toHaveBeenCalled();

    fireEvent.change(data, { target: { value: '2026-09-10' } });
    await userEvent.click(screen.getByLabelText('Confirmar data'));
    expect(baixar).toHaveBeenCalledWith('l1', '2026-09-10', 100);
  });

  it('clicar na data de uma baixa a corrige, sem mexer no valor pago', async () => {
    abrir([linha({ id: 'l2', status: 'baixado', pago_em: '2026-09-30', valor_pago: 60 })]);
    await userEvent.click(await screen.findByTitle('Mudar a data do pagamento'));

    const data = screen.getByLabelText('Data do pagamento') as HTMLInputElement;
    expect(data.value).toBe('2026-09-30');
    fireEvent.change(data, { target: { value: '2025-02-10' } });
    await userEvent.click(screen.getByLabelText('Confirmar data'));
    expect(baixar).toHaveBeenCalledWith('l2', '2025-02-10', 60);
  });

  it('data no futuro não confirma', async () => {
    abrir([linha({ id: 'l3' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'pagar' }));
    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-10-01' } });
    expect(screen.getByLabelText('Confirmar data')).toBeDisabled();
  });
});
