/**
 * A.6 · o extrato: de onde veio cada ponto, a origem que abre o lead, e o
 * estorno com motivo. As regras (imutável, uma vez só) são do banco
 * (supabase/tests/fire.test.sql).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PontoDoExtrato } from '../fireService';

const carregar = vi.fn<(...a: unknown[]) => Promise<PontoDoExtrato[]>>();
const estornar = vi.fn<(...a: unknown[]) => Promise<string>>();
vi.mock('../fireService', () => ({
  carregarExtrato: (...a: unknown[]) => carregar(...a),
  estornarPonto: (...a: unknown[]) => estornar(...a),
}));
const buscarLead = vi.fn();
vi.mock('@/features/leads/services/leadsService', () => ({ fetchKanbanLeadDaConversa: (...a: unknown[]) => buscarLead(...a) }));
vi.mock('@/features/leads/components/CriarLeadQuickModal', () => ({
  CriarLeadQuickModal: ({ isOpen, editingLead }: { isOpen: boolean; editingLead: { name: string } | null }) =>
    isOpen ? <div role="dialog">{editingLead?.name}</div> : null,
}));

import { ExtratoFire } from '../ExtratoFire';

const ponto = (o: Partial<PontoDoExtrato>): PontoDoExtrato => ({
  id: 'p', evento: 'visita', origem_tipo: 'visita', origem_id: 'u:la@2026-10-01', lead_id: null, descricao: null,
  pontos: 10, data: '2026-10-01T15:00:00Z', estorno_de: null, estorno_motivo: null, estornado: false, ...o,
});

const extrato = [
  ponto({ id: 'e1', evento: 'captacao', origem_tipo: 'imovel', pontos: -5, estorno_de: 'c1', estorno_motivo: 'imóvel em duplicidade', descricao: 'Imóvel FIRE-1' }),
  ponto({ id: 'v1', evento: 'venda', origem_tipo: 'venda', pontos: 50, lead_id: 'lead-a', descricao: 'Lead A' }),
  ponto({ id: 'v0', evento: 'venda', origem_tipo: 'venda', pontos: 50, lead_id: null, descricao: null }),
  ponto({ id: 'c1', evento: 'captacao', origem_tipo: 'imovel', pontos: 5, descricao: 'Imóvel FIRE-1', estornado: true }),
  ponto({ id: 'x1', evento: 'visita', pontos: 10, lead_id: 'lead-b', descricao: 'Lead B' }),
];

const montar = (podeEstornar = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ExtratoFire tenantId="lotus" edicaoId="ed" userId="lucia" podeEstornar={podeEstornar} />
  </QueryClientProvider>,
);

beforeEach(() => { carregar.mockReset(); estornar.mockReset(); buscarLead.mockReset(); carregar.mockResolvedValue(extrato); });

const linha = (texto: string) => screen.getAllByText(texto)[0].closest('li')!;

describe('A.6 · extrato do Fire', () => {
  it('cada ponto diz de onde veio; o estorno traz o motivo e o original fica marcado', async () => {
    montar();
    await screen.findByRole('list', { name: 'Extrato' });
    expect(within(linha('Estorno')).getByText('Motivo: imóvel em duplicidade')).toBeInTheDocument();
    expect(within(linha('Estorno')).getByText('-5')).toBeInTheDocument();
    expect(screen.getByText('estornado')).toBeInTheDocument();
    expect(screen.getByText(/sem lead/)).toBeInTheDocument();
  });

  it('a origem com lead abre o lead ali mesmo', async () => {
    buscarLead.mockResolvedValue({ name: 'Lead A', lead_type: 'comprador' });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Lead A' }));
    await waitFor(() => expect(buscarLead).toHaveBeenCalledWith('lotus', 'lead-a', []));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Lead A');
  });

  it('o corretor não tem botão de estorno', async () => {
    montar(false);
    await screen.findByRole('list', { name: 'Extrato' });
    expect(screen.queryByRole('button', { name: 'estornar' })).toBeNull();
  });

  it('a diretoria estorna com motivo; estorno e ponto já estornado não oferecem estorno', async () => {
    estornar.mockResolvedValue('novo');
    montar(true);
    await screen.findByRole('list', { name: 'Extrato' });
    expect(screen.getAllByRole('button', { name: 'estornar' })).toHaveLength(3);   // v1, v0, x1
    fireEvent.click(within(linha('Lead B')).getByRole('button', { name: 'estornar' }));
    const confirmar = screen.getByRole('button', { name: 'Estornar' });
    fireEvent.change(screen.getByLabelText('Motivo do estorno'), { target: { value: 'oi' } });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo do estorno'), { target: { value: 'visita lançada no lead errado' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(estornar).toHaveBeenCalledWith('x1', 'visita lançada no lead errado'));
  });
});
