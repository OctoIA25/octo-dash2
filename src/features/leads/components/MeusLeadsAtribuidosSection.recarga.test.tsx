/**
 * Recarga não pode tirar a pessoa do lugar.
 *
 * Salvar um lead avisa o app inteiro (leadsEventEmitter) e este kanban
 * recarrega. Enquanto recarregava, a tela trocava as colunas por "Carregando
 * seus leads...": as colunas eram desmontadas e, com elas, iam embora a rolagem
 * e o "Mostrar mais" — quem estava no fim de uma coluna longa voltava ao topo e
 * precisava descer tudo de novo para achar o lead (queixa de 21/09/2026).
 *
 * O spinner grande continua na PRIMEIRA carga, quando não há nada na tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';

// vi.hoisted: o factory do vi.mock sobe para o topo do arquivo e não enxerga
// const comum — LEADS e o espião precisam subir junto.
const { LEADS, fetchLeadsDoCorretorCRM } = vi.hoisted(() => {
  const LEADS = Array.from({ length: 20 }, (_, i) => ({
    id: `lead-${i}`,
    created_at: '2026-07-01T12:00:00Z',
    codigo: `AP00${i}`,
    corretor: null,
    lead: '(11) 98888-7777',
    numerocorretor: null,
    status: 'Novos Leads',
    corretor_responsavel: 'Ana',
    numero_corretor_responsavel: null,
    data_atribuicao: null,
    atendido: null,
    data_atendimento: null,
    data_finalizacao: null,
    data_expiracao: null,
    nomedolead: `Lead ${String(i).padStart(2, '0')}`,
    Foto: null,
    portal: 'Kenlo',
    email: null,
    temperature: null,
    property_value: null,
    comments: null,
    archived_at: null,
    archive_reason: null,
    lead_type: 1,
    is_exclusive: false,
    participa_bolsao: false,
    assigned_at: '2026-07-01T12:00:00Z',
    event_at: '2026-07-01T12:00:00Z',
  }));
  return { LEADS, fetchLeadsDoCorretorCRM: vi.fn(async () => LEADS) };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Ana', email: 'ana@imob.com', systemRole: 'corretor', permissions: {} },
    isCorretor: true,
    isAdmin: false,
    isOwner: false,
    isLoading: false,
    tenantId: 'tenant-1',
  }),
}));

vi.mock('@/contexts/ViewAsContext', () => ({
  useEffectiveUser: () => ({ id: 'user-1', name: 'Ana', email: 'ana@imob.com', isViewingAs: false, isAdmin: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { sidebarPermissions: ['leads'] }, tenantId: 'tenant-1', isAdmin: false, isOwner: false }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// A tela registra atalhos no cabeçalho da Home; no teste o registro é inócuo.
vi.mock('@/contexts/NovoActionsContext', () => ({
  useNovoActions: () => ({ actions: [], registerActions: vi.fn(), clearActions: vi.fn() }),
  useRegisterNovoActions: vi.fn(),
}));

vi.mock('./CriarLeadQuickModal', () => ({ CriarLeadQuickModal: () => null }));

vi.mock('../services/tenantBolsaoConfigService', () => ({ fetchTenantBolsaoConfig: vi.fn(async () => null) }));

vi.mock('../services/proposalsService', () => ({ syncProposalStageFromLead: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ error: null })),
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  },
}));

vi.mock('../services/leadsService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/leadsService')>();
  return {
    ...real,
    fetchLeadsDoCorretorCRM,
    fetchLeadsDoCorretorPorNome: vi.fn(async () => []),
    fetchTodosLeadsCRM: vi.fn(async () => LEADS),
  };
});

import { MeusLeadsAtribuidosSection } from './MeusLeadsAtribuidosSection';

const renderKanban = () => render(<MemoryRouter><MeusLeadsAtribuidosSection /></MemoryRouter>);

describe('MeusLeadsAtribuidosSection — recarga depois de salvar um lead', () => {
  beforeEach(() => {
    fetchLeadsDoCorretorCRM.mockClear();
  });

  it('mantém o "Mostrar mais" aberto quando alguém salva um lead', async () => {
    renderKanban();

    expect(await screen.findByText('Lead 00')).toBeInTheDocument();
    // A coluna mostra 15 cards; o 16º só aparece depois do "Mostrar mais".
    expect(screen.queryByText('Lead 15')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Mostrar mais/));
    expect(screen.getByText('Lead 15')).toBeInTheDocument();

    const antes = fetchLeadsDoCorretorCRM.mock.calls.length;
    leadsEventEmitter.emit();

    await waitFor(() => expect(fetchLeadsDoCorretorCRM.mock.calls.length).toBeGreaterThan(antes));
    expect(screen.queryByText('Carregando seus leads...')).not.toBeInTheDocument();
    expect(screen.getByText('Lead 15')).toBeInTheDocument();
  });

  it('a primeira carga continua mostrando "Carregando seus leads..."', async () => {
    renderKanban();

    expect(screen.getByText('Carregando seus leads...')).toBeInTheDocument();
    expect(await screen.findByText('Lead 00')).toBeInTheDocument();
  });
});
