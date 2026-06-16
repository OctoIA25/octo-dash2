import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SavedProposal } from '@/features/leads/services/proposalsService';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'corretor@octo.com' }, tenantId: 'tenant-1' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/features/leads/hooks/useLeadsMetrics', () => ({
  useLeadsMetrics: () => ({ leads: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/features/imoveis/hooks/useImoveisData', () => ({
  useImoveisData: () => ({ imoveis: [] }),
}));

vi.mock('@/features/leads/services/leadsService', () => ({
  atualizarStatusLeadCRM: vi.fn().mockResolvedValue(undefined),
}));

const savedProposalFixture: SavedProposal = {
  id: 'b6d1a6a0-0000-4000-8000-000000000001',
  tenant_id: 'tenant-1',
  lead_id: null,
  source: 'draft',
  property_origin: 'interno',
  property_reference: 'CB0123',
  cep: '01001000',
  numero: '100',
  logradouro: 'Rua das Flores',
  bairro: 'Centro',
  complemento: '',
  cidade: 'São Paulo',
  uf: 'SP',
  // O usuário autenticado nos testes é o corretor `user-1`. A página só exibe
  // propostas do próprio corretor (ou de admin/owner), então o fixture precisa
  // pertencer a ele para ser renderizado.
  agent_user_id: 'user-1',
  agent_name: 'Corretor Teste',
  business_type: 'Venda',
  lead_type: 'Interessado',
  origin: 'Manual',
  temperature: 'Morno',
  status: 'Proposta Criada',
  stage_id: 'proposta-criada',
  value: 850000,
  payment_method: 'Com financiamento',
  has_financing: true,
  financing_amount: '',
  down_payment: '',
  banking_support: 'suporte',
  specific_conditions: '',
  transaction_form: {},
  external_partners: false,
  reviewed: false,
  sent_to_proponent: false,
  sent_to_owner: false,
  created_by: null,
  updated_by: null,
  created_at: '2026-06-01T12:00:00.000Z',
  updated_at: '2026-06-01T12:00:00.000Z',
  parties: [
    {
      id: 'party-1',
      proposal_id: 'b6d1a6a0-0000-4000-8000-000000000001',
      tenant_id: 'tenant-1',
      party_type: 'comprador',
      full_name: 'Ana Souza',
      cpf: '00000000000',
      rg: '',
      phone: '11999999999',
      email: 'ana@exemplo.com',
      is_company: false,
      signature_channel: 'email',
      signed_by: '',
      signature_status: 'pendente',
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-01T12:00:00.000Z',
    },
  ],
  history: [],
};

vi.mock('@/features/leads/services/proposalsService', () => ({
  fetchSavedProposals: vi.fn().mockImplementation(async () => [savedProposalFixture]),
  createSavedProposal: vi.fn().mockImplementation(async () => savedProposalFixture),
  updateSavedProposal: vi.fn().mockImplementation(async () => savedProposalFixture),
  updateSavedProposalFields: vi.fn().mockResolvedValue(undefined),
  updateSavedProposalStage: vi.fn().mockResolvedValue(undefined),
  appendSavedProposalHistoryItems: vi.fn().mockResolvedValue([]),
  replaceSavedProposalParties: vi.fn().mockResolvedValue([]),
  syncProposalStageFromLead: vi.fn().mockResolvedValue(undefined),
}));

import { PropostaPage } from './PropostaPage';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // jsdom não implementa object URLs, usados pelo preview de PDF. A origem
  // http no stub evita "opaque origin" quando o jsdom carrega o iframe.
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3000/mock-pdf') as never;
  URL.revokeObjectURL = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false) as never;
  Element.prototype.setPointerCapture = vi.fn() as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
  window.matchMedia =
    window.matchMedia ||
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList);
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PropostaPage />
    </MemoryRouter>,
  );

describe('PropostaPage — abrir e fechar dialogs', () => {
  it('cancela a criação de nova proposta sem quebrar a página', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /nova proposta/i }));
    expect(await screen.findByText('Proposta em imóvel da carteira, ou de fora?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancelar$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Proposta em imóvel da carteira, ou de fora?')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /nova proposta/i })).toBeInTheDocument();
  });

  it('abre o preview do documento no rascunho, fecha e cancela sem quebrar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /nova proposta/i }));
    await user.click(screen.getByRole('button', { name: /pré-visualizar documento/i }));

    expect(await screen.findByText('Contrato de Compromisso de Compra e Venda')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^fechar$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Contrato de Compromisso de Compra e Venda')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^cancelar$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Proposta em imóvel da carteira, ou de fora?')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /nova proposta/i })).toBeInTheDocument();
  });

  it('permite visualizar o PDF anexado para assinatura', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Ana Souza'));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('tab', { name: /assinatura eletrônica/i }));

    // O upload usa pickFiles(), que cria um <input type="file"> efêmero no
    // document.body apenas ao acionar o dropzone (removido após o change). Por
    // isso é preciso clicar no dropzone antes de localizar o input.
    await user.click(screen.getByRole('button', { name: /enviar documento em pdf/i }));

    const input = document.querySelector('input[type="file"][accept*="pdf"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const pdf = new File(['%PDF-1.4'], 'contrato.pdf', { type: 'application/pdf' });
    // O input do pickFiles fica fora da árvore visível (position fixed,
    // aria-hidden), o que faz o user.upload falhar na checagem de
    // pointer-events. Disparar o `change` direto reproduz a seleção real do
    // arquivo, que é justamente o evento que o pickFiles escuta.
    fireEvent.change(input, { target: { files: [pdf] } });

    await user.click(await screen.findByRole('button', { name: /visualizar pdf/i }));
    expect(await screen.findByTitle('contrato.pdf')).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(pdf);

    await user.click(screen.getByRole('button', { name: /^fechar$/i }));
    await waitFor(() => {
      expect(screen.queryByTitle('contrato.pdf')).not.toBeInTheDocument();
    });
  });

  it('abre o detalhe de uma proposta, fecha e reabre sem quebrar', async () => {
    const user = userEvent.setup();
    renderPage();

    const card = await screen.findByText('Ana Souza');
    await user.click(card);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /nova proposta/i })).toBeInTheDocument();

    // Reabrir o MESMO card precisa funcionar (selectedProposal sobrevive ao
    // fechamento; só detailOpen controla a visibilidade).
    await user.click(screen.getByText('Ana Souza'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
