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
const regua = vi.fn();
vi.mock('../services/plantaoService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  carregarConfig: async () => ({
    espera_maxima_minutos: 30, destino: 'corretor_do_lead', plantonista_id: null,
    lancamento_responsavel_id: null, lancamento_escala_horas: 24, lancamento_escala_para_id: null,
  }),
  salvarConfig: (...a: unknown[]) => salvar(...a),
  simularRegua: (...a: unknown[]) => regua(...a),
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

beforeEach(() => {
  salvar.mockReset().mockResolvedValue(undefined);
  regua.mockReset().mockResolvedValue(null);
});

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

/*
 * 30/09 — a régua contava como "respondida em 0 min, dentro do prazo" a
 * pergunta que a LIA da Lotus grava no instante da resposta (80 de 95). O
 * banco passou a medir só resposta com tempo; a tela diz quantas ficaram fora.
 */
describe('a régua só mede resposta com tempo', () => {
  it('diz quantas ficaram fora da conta, e a mediana em dias, não em 4.013 min', async () => {
    regua.mockResolvedValue({
      minutos: 30, dias: 90, respondidas: 15, dentro_do_prazo: 0,
      pct_dentro: 0, mediana_minutos: 4013, sem_tempo: 80,
    });
    abrir();
    expect(await screen.findByText(/80 gravadas junto com a resposta ficaram fora da conta/)).toBeInTheDocument();
    expect(screen.getByText(/Sua mediana é de 2 dias/)).toBeInTheDocument();
  });

  it('se TODAS foram gravadas junto, diz que não há tempo para medir — não "sem plantão"', async () => {
    regua.mockResolvedValue({
      minutos: 30, dias: 90, respondidas: 0, dentro_do_prazo: 0,
      pct_dentro: null, mediana_minutos: null, sem_tempo: 80,
    });
    abrir();
    expect(await screen.findByText(/não há tempo de resposta para medir/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem plantão respondido/)).not.toBeInTheDocument();
  });
});
