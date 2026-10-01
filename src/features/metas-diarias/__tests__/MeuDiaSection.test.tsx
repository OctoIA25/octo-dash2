/**
 * A.4 · o que o "Meu dia" mostra. A conta (campos pela atuação, realizado,
 * filas) é do banco (supabase/tests/metas_diarias.test.sql); aqui, a tela.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeuDia } from '../metasDiariasService';
import { PESOS_PADRAO } from '@/features/leads/utils/score';

const carregar = vi.fn<(...a: unknown[]) => Promise<MeuDia>>();
const lancar = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('../metasDiariasService', async (orig) => ({
  ...(await orig<typeof import('../metasDiariasService')>()),
  carregarMeuDia: (...a: unknown[]) => carregar(...a),
  lancarCompromisso: (...a: unknown[]) => lancar(...a),
}));
vi.mock('@/features/leads/services/scoreService', () => ({
  buscarSinaisDeScore: async () => ({ l1: { respondeu: true, sem_resposta_ha_dias: 4 } }),
  buscarConfiguracaoDoScore: async () => ({ pesos: PESOS_PADRAO, porOrigem: {} }),
}));

import { MeuDiaSection } from '../MeuDiaSection';

const dia = (o: Partial<MeuDia> = {}): MeuDia => ({
  data: '2026-10-01', corte: '10:00', campos: ['visitas', 'propostas', 'retornos'], compromisso: null,
  realizado: { captacoes: 0, visitas: 1, propostas: 0, retornos: 2 },
  agenda: [{ id: 'a1', horario: '14:00', tipo: 'visita_agendada', titulo: 'Visita', status: 'agendado', lead_id: 'l1', lead_nome: 'Ana', imovel: 'Reserva Castanheira' }],
  tarefas: [], vencidas: [], parados: [{ lead_id: 'l2', nome: 'Bruno', etapa: 'Interação', dias: 9 }],
  lia: [{ id: 'q1', pergunta: 'O apê aceita pet?', lead_id: null, criado_em: '2026-10-01T09:00:00Z' }],
  meus_leads: [{ id: 'l1', nome: 'Ana', etapa: 'Interação', temperatura: null, origem: null }],
  ...o,
});

const montar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MeuDiaSection tenantId="lotus" />
  </QueryClientProvider>,
);

beforeEach(() => { carregar.mockReset(); lancar.mockReset(); });

describe('A.4 · Meu dia', () => {
  it('corretor de lançamentos não vê Captações; lança só os campos dele', async () => {
    carregar.mockResolvedValue(dia());
    lancar.mockResolvedValue({});
    montar();
    expect(await screen.findByLabelText('Visitas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Captações')).toBeNull();

    fireEvent.change(screen.getByLabelText('Visitas'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lançar compromisso' }));
    await waitFor(() => expect(lancar).toHaveBeenCalledWith('lotus', { visitas: 3 }));
  });

  it('com compromisso lançado, mostra o realizado contra o prometido e o atraso', async () => {
    carregar.mockResolvedValue(dia({ compromisso: { prometido: { visitas: 3, propostas: 1, retornos: 5 }, lancado_em: '2026-10-01T14:30:00Z', atrasado: true } }));
    montar();
    expect(await screen.findByText(/depois das 10:00/)).toBeInTheDocument();
    expect(screen.getByText('de 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lançar compromisso' })).toBeNull();
  });

  it('agenda e as três filas aparecem com os leads dele', async () => {
    carregar.mockResolvedValue(dia());
    montar();
    expect(await screen.findByText(/Reserva Castanheira/)).toBeInTheDocument();
    expect(screen.getByText(/parado há 9 dias/)).toBeInTheDocument();
    expect(screen.getByText('O apê aceita pet?')).toBeInTheDocument();
    expect(await screen.findByText(/respondeu e sumiu há 4 dias/)).toBeInTheDocument();
  });

  it('lista cortada no limite do banco diz "20+", não um 20 falso', async () => {
    const parados = Array.from({ length: 20 }, (_, i) => ({ lead_id: `p${i}`, nome: `Parado ${i}`, etapa: 'Interação', dias: 30 - i }));
    carregar.mockResolvedValue(dia({ parados }));
    montar();
    expect(await screen.findByText('(20+)')).toBeInTheDocument();
  });

  it('dia vazio diz que está vazio, não some', async () => {
    carregar.mockResolvedValue(dia({ agenda: [], parados: [], lia: [], meus_leads: [] }));
    montar();
    expect(await screen.findByText('Nada marcado para hoje na sua agenda.')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma atividade vencida/)).toBeInTheDocument();
    expect(screen.getByText('Nenhum lead seu com sinal de resgate hoje.')).toBeInTheDocument();
  });
});
