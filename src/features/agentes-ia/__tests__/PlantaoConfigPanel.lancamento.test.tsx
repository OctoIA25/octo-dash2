/**
 * Configuração das perguntas de lançamento (28/09): quem responde, depois de
 * quantas horas o diretor é avisado, e quem é ele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const salvar = vi.fn();
vi.mock('../services/plantaoService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  carregarConfig: async () => ({
    espera_maxima_minutos: 30, destino: 'corretor_do_lead', plantonista_id: null,
    lancamento_responsavel_id: null, lancamento_escala_horas: 24, lancamento_escala_para_id: null,
  }),
  salvarConfig: (...a: unknown[]) => salvar(...a),
  simularRegua: async () => null,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: async () => ({
      data: [
        { user_id: 'fer', name: 'Fernanda Souza', email: 'fernanda@lotus.dev', permissions: { whatsapp_phones: ['11 90000-0000'] } },
        { user_id: 'eri', name: 'Erick Ferrigatti', email: 'erick@lotus.dev', permissions: {} },
        { user_id: 'own', name: '', email: 'octo.inteligenciaimobiliaria@gmail.com', permissions: {} },
      ],
      error: null,
    }),
  },
}));

import { PlantaoConfigPanel } from '../components/PlantaoConfigPanel';

const abrir = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PlantaoConfigPanel tenantId="t1" isAdmin /></QueryClientProvider>);
};

beforeEach(() => salvar.mockReset().mockResolvedValue(undefined));

describe('perguntas de lançamento', () => {
  it('grava quem responde, as horas e quem é avisado', async () => {
    abrir();
    const quemResponde = await screen.findByLabelText('Quem responde');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Fernanda Souza' }).length).toBeGreaterThan(0));
    await userEvent.selectOptions(quemResponde, 'fer');
    await userEvent.selectOptions(screen.getByLabelText('Quem é avisado'), 'eri');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][1]).toMatchObject({
      lancamento_responsavel_id: 'fer',
      lancamento_escala_horas: 24,
      lancamento_escala_para_id: 'eri',
    });
  });

  it('avisa quando quem recebe o escalonamento não tem WhatsApp', async () => {
    abrir();
    const quemAvisa = await screen.findByLabelText('Quem é avisado');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Erick Ferrigatti' }).length).toBeGreaterThan(0));
    await userEvent.selectOptions(quemAvisa, 'eri');
    expect(screen.getByText(/Erick Ferrigatti não tem WhatsApp cadastrado/)).toBeInTheDocument();

    await userEvent.selectOptions(quemAvisa, 'fer');
    expect(screen.queryByText(/não tem WhatsApp cadastrado/)).not.toBeInTheDocument();
  });

  it('a conta dona da plataforma não aparece para escolher', async () => {
    abrir();
    await screen.findByLabelText('Quem é avisado');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Erick Ferrigatti' }).length).toBeGreaterThan(0));
    expect(screen.queryByRole('option', { name: /octo\.inteligencia/ })).not.toBeInTheDocument();
  });
});
