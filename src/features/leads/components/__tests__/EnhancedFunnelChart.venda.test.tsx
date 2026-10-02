/**
 * Pedido do chefe em 02/10: "proposta ficaria tudo junto, e no final colocaria
 * o último item como venda (...) as que estão no Conferência de vendas, cada
 * uma tem que filtrar de acordo com o período dela".
 *
 * O que se protege: a "Proposta" junta as três etapas sem contar lead duas
 * vezes, e a Venda vem do banco pelo período — e erro não vira "0 vendas".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProcessedLead } from '@/data/realLeadsProcessor';

vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ currentTheme: 'light' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
const carregarPassaram = vi.fn();
vi.mock('@/features/leads/services/funilPassaramService', () => ({
  carregarPassaramPorEtapa: (...a: unknown[]) => carregarPassaram(...a),
}));
const contarVendas = vi.fn();
vi.mock('@/features/leads/services/funilVendasService', () => ({
  contarVendasDoFunil: (...a: unknown[]) => contarVendas(...a),
}));

import { EnhancedFunnelChart } from '../EnhancedFunnelChart';

const PROPOSTA = 'Proposta Enviada+Proposta Criada+Proposta Assinada';

const comQuery = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const leads = ['Negociação', 'Proposta Enviada', 'Proposta Criada', 'Proposta Assinada']
  .map((etapa_atual) => ({ etapa_atual })) as unknown as ProcessedLead[];

beforeEach(() => {
  carregarPassaram.mockReset();
  contarVendas.mockReset();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

describe('EnhancedFunnelChart — Proposta junta e Venda no fim', () => {
  it('as três propostas viram UMA etapa, e a última é a Venda', async () => {
    carregarPassaram.mockReturnValue(new Promise(() => {}));
    contarVendas.mockResolvedValue(29);
    render(<EnhancedFunnelChart leads={leads} contarPassaram={false} />, { wrapper: comQuery() });

    expect(screen.queryByText('Proposta Assinada')).toBeNull();
    // Enviada + Criada + Assinada estão agora em "Proposta": 3 de 4 leads.
    const proposta = screen.getByText('Proposta').parentElement!;
    expect(proposta.textContent).toContain('3');
    expect(proposta.textContent).toContain('75.0%');

    expect(await screen.findByText('29')).toBeInTheDocument();
    expect(screen.getByText('da Conferência de vendas')).toBeInTheDocument();
  });

  it('pergunta as vendas pelo período e pela atuação da tela; sem período, todas', () => {
    contarVendas.mockReturnValue(new Promise(() => {}));
    const periodo = { de: '2026-09-01', ate: '2026-09-30' };
    render(<EnhancedFunnelChart leads={[]} contarPassaram={false} periodoDasVendas={periodo} atuacao="pronto" />,
      { wrapper: comQuery() });
    expect(contarVendas).toHaveBeenCalledWith('t1', periodo, 'pronto');

    render(<EnhancedFunnelChart leads={[]} contarPassaram={false} />, { wrapper: comQuery() });
    expect(contarVendas).toHaveBeenLastCalledWith('t1', null, 'todos');
  });

  it('"passaram" pede a Proposta como um grupo, e não pede a Venda', async () => {
    contarVendas.mockReturnValue(new Promise(() => {}));
    carregarPassaram.mockResolvedValue({
      etapas: ['Novos Leads', 'Interação', 'Visita Agendada', 'Visita Realizada', 'Negociação', PROPOSTA],
      passaram: [0, 0, 0, 0, 9, 5],
      inicioDoHistorico: '2026-09-10T10:00:00Z',
    });
    render(<EnhancedFunnelChart leads={leads} />, { wrapper: comQuery() });

    const pedidas = carregarPassaram.mock.calls[0][0] as string[];
    expect(pedidas[pedidas.length - 1]).toBe(PROPOSTA);
    expect(pedidas).not.toContain('Venda');

    // O 5 é o do grupo, contado distinto no banco — não 3 + 5 das partes.
    await screen.findByText(/"Passaram" conta desde/);
    expect(screen.getByText('Proposta').parentElement!.textContent).toMatch(/^Proposta5\(/);
  });

  it('se a contagem de vendas falha, diz que falhou — nunca "0 vendas"', async () => {
    carregarPassaram.mockReturnValue(new Promise(() => {}));
    contarVendas.mockRejectedValue(new Error('Não deu para contar as vendas.'));
    render(<EnhancedFunnelChart leads={leads} contarPassaram={false} />, { wrapper: comQuery() });

    expect(await screen.findByText('Não deu para contar as vendas')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
