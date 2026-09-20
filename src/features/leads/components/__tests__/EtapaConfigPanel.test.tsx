/**
 * O painel de pré-requisitos por etapa.
 *
 * O teste que importa aqui é o da PRÉVIA QUE FALHOU. A primeira versão desta
 * tela mandava centenas de ids numa URL só; a consulta estourava o tamanho, o
 * código lia a resposta vazia como "nenhum lead tem o dado", e a tela
 * anunciava "328 de 328 reprovariam hoje" sem ter conferido nada.
 *
 * O gestor leria esse número e decidiria não ligar a chave — exatamente a
 * decisão errada, tomada com um número inventado. É a mesma família de
 * defeito que fez "Visitas" mostrar zero para todo corretor por meses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EtapaConfigPanel } from '../EtapaConfigPanel';
import { CHAVES_PADRAO } from '../../utils/preRequisitos';

const leadsEmEtapa = vi.fn();
const agenda = vi.fn();
const propostas = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'not']) chain[m] = () => chain;
      chain.in = (_col: string, _vals: string[]) =>
        tabela === 'leads' ? leadsEmEtapa() : tabela === 'agenda_eventos' ? agenda() : propostas();
      return chain;
    },
  },
}));

vi.mock('../../services/etapaConfigService', () => ({
  buscarChavesDeEtapa: vi.fn(async () => CHAVES_PADRAO),
  salvarChavesDeEtapa: vi.fn(async () => {}),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const TENANT = 'e2e00000-0000-4000-a000-00000000000a';

beforeEach(() => {
  vi.clearAllMocks();
  leadsEmEtapa.mockResolvedValue({ data: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }], error: null });
  agenda.mockResolvedValue({ data: [{ lead_uuid: 'l1' }], error: null });
  propostas.mockResolvedValue({
    data: [{ lead_id: 'l1', value: 1000, property_reference: 'AP1', payment_method: 'Financiamento' }],
    error: null,
  });
});

describe('a prévia diz quantos reprovariam', () => {
  it('conta os que não têm o dado', async () => {
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin />);
    // 3 leads na etapa, 1 com visita completa na agenda -> 2 reprovariam.
    await waitFor(() => expect(screen.getAllByText(/2 de 3 lead\(s\)/).length).toBeGreaterThan(0));
  });

  it('quando ninguém reprova, diz isso em vez de mostrar zero', async () => {
    agenda.mockResolvedValue({ data: [{ lead_uuid: 'l1' }, { lead_uuid: 'l2' }, { lead_uuid: 'l3' }], error: null });
    propostas.mockResolvedValue({
      data: ['l1', 'l2', 'l3'].map((id) => ({
        lead_id: id, value: 1, property_reference: 'X', payment_method: 'Financiamento',
      })),
      error: null,
    });
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin />);
    await waitFor(() => expect(screen.getAllByText(/nenhum dos 3 lead\(s\)/).length).toBeGreaterThan(0));
  });
});

describe('PRÉVIA QUE FALHOU NÃO VIRA NÚMERO', () => {
  it('erro na consulta das propostas não vira "3 de 3 reprovariam"', async () => {
    propostas.mockResolvedValue({ data: null, error: { message: 'URI too long' } });
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin />);

    await waitFor(() =>
      expect(screen.getAllByText(/não foi possível conferir/).length).toBeGreaterThan(0)
    );
    // E nenhum número apareceu no lugar.
    expect(screen.queryByText(/reprovariam hoje/)).not.toBeInTheDocument();
  });

  it('erro na consulta da agenda também', async () => {
    agenda.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin />);
    await waitFor(() =>
      expect(screen.getAllByText(/não foi possível conferir/).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/reprovariam hoje/)).not.toBeInTheDocument();
  });
});

describe('a tela diz o que faz', () => {
  it('avisa que nada aqui bloqueia ninguém', async () => {
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin />);
    await waitFor(() => expect(screen.getByText(/Nada aqui bloqueia ninguém/)).toBeInTheDocument());
    expect(screen.getByText(/anda mesmo assim/)).toBeInTheDocument();
  });

  it('quem não administra vê os interruptores travados', async () => {
    render(<EtapaConfigPanel tenantId={TENANT} isAdmin={false} />);
    await waitFor(() => expect(screen.getAllByRole('switch').length).toBe(4));
    for (const s of screen.getAllByRole('switch')) {
      expect(s).toBeDisabled();
    }
    expect(screen.getByText(/Só quem administra a imobiliária/)).toBeInTheDocument();
  });
});
