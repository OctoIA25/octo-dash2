/**
 * A.3 · a tela das Flags: o mix bate com a tabela, quem não tem atuação fica
 * separado, e a régua ausente é dita — nunca vira vermelho.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FlagsDoMes } from '../flagsService';
import type { PessoaComFlag } from '../flags';

const carregar = vi.fn<(...a: unknown[]) => Promise<FlagsDoMes>>();
vi.mock('../flagsService', () => ({ carregarFlags: (...a: unknown[]) => carregar(...a) }));

import { FlagsSection } from '../FlagsSection';

const p = (nome: string, o: Partial<PessoaComFlag>): PessoaComFlag => ({
  user_id: nome, nome, equipe: 'Lançamentos', atuacao: 'lancamentos', metricas: { vendas: 0, visitas: 0, captacoes: 0 },
  flag: 'vermelho', proximo: 'amarelo', falta: { vendas: 1 }, antes: null, ...o,
});

const dados = (o: Partial<FlagsDoMes> = {}): FlagsDoMes => ({
  mes: '2026-10-01',
  reguas: { 'lancamentos:verde': [{ vendas: 2 }], 'lancamentos:amarelo': [{ vendas: 1 }] },
  pessoas: [
    p('Lúcia', { flag: 'amarelo', proximo: 'verde', falta: { vendas: 1 }, metricas: { vendas: 1, visitas: 3, captacoes: 0 }, antes: 'vermelho' }),
    p('Laura', { flag: 'verde', proximo: null, falta: null, metricas: { vendas: 2, visitas: 0, captacoes: 0 } }),
    p('Luan', {}),
    p('Paulo', { equipe: 'Prontos', atuacao: 'prontos', flag: null, proximo: null, falta: null }),
    p('Sérgio', { equipe: 'Prontos', atuacao: null, flag: null, proximo: null, falta: null }),
  ],
  ...o,
});

const montar = () => render(
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FlagsSection tenantId="lotus" />
    </QueryClientProvider>
  </MemoryRouter>,
);

beforeEach(() => { carregar.mockReset(); });

describe('A.3 · tela das Flags', () => {
  it('o mix conta as mesmas pessoas da tabela e soma 100%', async () => {
    carregar.mockResolvedValue(dados());
    montar();
    const mix = await screen.findByRole('region', { name: 'Mix da casa' });
    expect(within(mix).getByText(/3 classificados · 1 sem régua · 1 sem atuação definida/)).toBeInTheDocument();
    expect(within(mix).getAllByText(/· 3[34]%/)).toHaveLength(3);
    const linhas = screen.getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);                                   // 3 classificados + o Paulo, sem régua
  });

  it('a linha diz quanto falta e de onde a pessoa veio', async () => {
    carregar.mockResolvedValue(dados());
    montar();
    const lucia = (await screen.findByText('Lúcia')).closest('tr')!;
    expect(within(lucia).getByText('falta 1 venda para o verde')).toBeInTheDocument();
    expect(within(lucia).getByText('era vermelho')).toBeInTheDocument();
    expect(within(screen.getByText('Laura').closest('tr')!).getByText('—')).toBeInTheDocument();
  });

  it('régua ausente é avisada, e a pessoa fica "sem régua" — não vermelha', async () => {
    carregar.mockResolvedValue(dados());
    montar();
    expect(await screen.findByText(/Prontos ainda sem régua/)).toBeInTheDocument();
    expect(within(screen.getByText('Paulo').closest('tr')!).getByText('sem régua')).toBeInTheDocument();
  });

  it('quem não tem atuação aparece separado, fora da tabela', async () => {
    carregar.mockResolvedValue(dados());
    montar();
    const separado = await screen.findByRole('region', { name: 'Sem atuação definida' });
    expect(within(separado).getByText('Sérgio')).toBeInTheDocument();
    expect(screen.getByRole('table')).not.toHaveTextContent('Sérgio');
  });

  it('por equipe soma as mesmas pessoas', async () => {
    carregar.mockResolvedValue(dados());
    montar();
    fireEvent.click(await screen.findByRole('tab', { name: 'Por equipe' }));
    const prontos = screen.getByText('Prontos', { selector: 'td' }).closest('tr')!;
    expect(within(prontos).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Prontos', '2', '0', '0', '0', '2', '0', '0', '0']);
  });

  it('o corretor que abrir por engano recebe o motivo, não uma tela vazia', async () => {
    carregar.mockImplementation(async () => { throw new Error('As flags são da gestão: diretoria e líderes de equipe.'); });
    montar();
    expect(await screen.findByRole('alert')).toHaveTextContent('As flags são da gestão');
  });
});
