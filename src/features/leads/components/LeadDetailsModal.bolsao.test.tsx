/**
 * O modal do Bolsão (30/09): lead #95419, da LIA, código L027.
 *
 * - O selo dizia "Desconhecido" e o botão Assumir não aparecia: o modal
 *   comparava o status com 'bolsão' (acento) e o banco grava 'bolsao'.
 * - "Imóvel de Interesse" dizia "não encontrado": L027 é o Auten Jundiaí,
 *   cadastrado em Lançamentos, fora do catálogo de prontos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const imovelPorCodigo = vi.fn();
const lancamentos = vi.fn();

vi.mock('@/features/imoveis/services/catalogoImoveisService', () => ({
  fetchImovelDoTenantPorCodigo: (...args: unknown[]) => imovelPorCodigo(...args),
}));
vi.mock('@/features/imoveis/services/lancamentosLookup', async () => {
  const real = await vi.importActual<typeof import('@/features/imoveis/services/lancamentosLookup')>(
    '@/features/imoveis/services/lancamentosLookup',
  );
  return { ...real, fetchLancamentosRef: (...args: unknown[]) => lancamentos(...args) };
});
vi.mock('@/features/imoveis/hooks/useImoveisData', () => ({ useImoveisData: () => ({ imoveis: [] }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'a@b.c' }, tenantId: 't1' }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { sidebarPermissions: ['chat'] } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('./AtividadesLeadSection', () => ({ AtividadesLeadSection: () => <div>atividades</div> }));
vi.mock('@/features/recommendations/components/EnviarRecomendacoesModal', () => ({
  EnviarRecomendacoesModal: () => null,
}));

import { LeadDetailsModal } from './LeadDetailsModal';
import type { BolsaoLead } from '../services/bolsaoService';

const LEAD = {
  id: 95419,
  created_at: '2026-09-23T10:00:00Z',
  status: 'bolsao',
  codigo: 'L027',
  lead: '+5511974131502',
  nomedolead: 'Maria Eduarda',
  portal: 'Lia (Lotus Brokers)',
  classification: ['lancamento'],
  source_lead_id: 'uuid-1',
} as unknown as BolsaoLead;

const abrir = (lead: BolsaoLead = LEAD) =>
  render(
    <MemoryRouter>
      <LeadDetailsModal
        lead={lead}
        isOpen
        onClose={vi.fn()}
        onAssumirLead={vi.fn()}
        onConfirmarAtendimento={vi.fn()}
        isAssumindoLead={false}
        isConfirmandoLead={false}
        isAdmin
        isCorretor={false}
        currentCorretor="Owner"
        mostrarRecomendacoes={false}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  imovelPorCodigo.mockReset().mockResolvedValue(null);
  lancamentos.mockReset().mockResolvedValue([
    { id: 'lanc-auten', nome: 'Auten Jundiaí', codigos: ['L027'] },
    { id: 'lanc-sky', nome: 'Sky Videiras', codigos: ['L033'] },
  ]);
});

describe('LeadDetailsModal no Bolsão', () => {
  it("status 'bolsao' é Bolsão: selo certo, botão Assumir, sem atividades antes de assumir", () => {
    abrir();
    expect(screen.getByText('📦 Bolsão')).toBeInTheDocument();
    expect(screen.queryByText('❓ Desconhecido')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assumir Lead/ })).toBeInTheDocument();
    expect(screen.queryByText('atividades')).not.toBeInTheDocument();
  });

  it('código de lançamento mostra o nome do empreendimento, com link', async () => {
    abrir();
    const link = await screen.findByRole('link', { name: /Auten Jundiaí/ });
    expect(link).toHaveAttribute('href', '/imoveis/lancamentos/lanc-auten');
    expect(screen.queryByText('Imóvel não encontrado no catálogo')).not.toBeInTheDocument();
  });

  it('código que não é de pronto nem de lançamento continua "não encontrado"', async () => {
    abrir({ ...LEAD, codigo: 'XYZ999' });
    expect(await screen.findByText('Imóvel não encontrado no catálogo')).toBeInTheDocument();
  });

  it('com telefone, mostra o número e o link da conversa', () => {
    abrir();
    expect(screen.getByText('Contato do Lead')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir conversa' })).toBeInTheDocument();
  });

  it('sem telefone (corretor), não há contato nem conversa', () => {
    abrir({ ...LEAD, lead: null });
    expect(screen.queryByText('Contato do Lead')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir conversa' })).not.toBeInTheDocument();
  });
});
