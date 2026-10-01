/**
 * A.6 · o Fire no Início (todo dia, para a casa) e na gestão (Metas › Fire).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Edicao, PainelFire } from '../fireService';

const painel = vi.fn<(...a: unknown[]) => Promise<PainelFire>>();
const salvar = vi.fn();
const ativar = vi.fn();
const encerrar = vi.fn();
vi.mock('../fireService', () => ({
  carregarPainel: (...a: unknown[]) => painel(...a),
  salvarEdicao: (...a: unknown[]) => salvar(...a),
  ativarEdicao: (...a: unknown[]) => ativar(...a),
  encerrarEdicao: (...a: unknown[]) => encerrar(...a),
  excluirEdicao: vi.fn(), salvarDesafio: vi.fn(), removerDesafio: vi.fn(),
}));
vi.mock('../ExtratoFire', () => ({ ExtratoFire: ({ userId }: { userId: string }) => <div>extrato de {userId}</div> }));
vi.mock('@/lib/dataSP', () => ({ hojeSP: () => '2026-10-10' }));

import { FireNoInicio } from '../FireNoInicio';
import { FireGestao } from '../FireGestao';

const edicao = (o: Partial<Edicao> = {}): Edicao => ({
  id: 'ed', nome: 'Fire de Outubro', inicio: '2026-10-01', fim: '2026-10-31', status: 'ativa',
  processado_em: '2026-10-10T13:00:00Z', encerrada_em: null,
  pontuacao: { lancamentos: { captacao: 5, visita: 10, proposta: 20, venda: 50 }, prontos: { captacao: 5, visita: 15, proposta: 20, venda: 50 } },
  desafios: [
    { id: 'd1', descricao: '3 visitas até sexta', evento: 'visita', quantidade: 3, desde: '2026-10-06', prazo: '2026-10-11', pontos: 30, cumpriram: 1 },
    { id: 'd0', descricao: 'Desafio vencido', evento: 'venda', quantidade: 1, desde: '2026-10-01', prazo: '2026-10-05', pontos: 50, cumpriram: 0 },
  ],
  classificacao: [
    { user_id: 'ana', nome: 'Ana', equipe: 'Lançamentos', atuacao: 'lancamentos', pontos: 120 },
    { user_id: 'lucia', nome: 'Lúcia', equipe: 'Lançamentos', atuacao: 'lancamentos', pontos: 90 },
    { user_id: 'paulo', nome: 'Paulo', equipe: 'Prontos', atuacao: 'prontos', pontos: 40 },
  ],
  sem_atuacao: ['Sérgio'],
  ...o,
});
const dados = (o: Partial<PainelFire> = {}): PainelFire => ({
  pode_gerir: false, eu: 'lucia', edicoes: [{ id: 'ed', nome: 'Fire de Outubro', inicio: '2026-10-01', fim: '2026-10-31', status: 'ativa' }],
  edicao: edicao(), recordes: [{ tipo: 'maior_venda', nome: 'Ana', valor: 1500000, periodo: '2026-09-12', edicao: null }], ...o,
});

const montar = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
);

beforeEach(() => { painel.mockReset(); salvar.mockReset(); ativar.mockReset(); encerrar.mockReset(); });

describe('A.6 · Fire no Início', () => {
  it('mostra os pontos, a posição, o topo e só os desafios em aberto', async () => {
    painel.mockResolvedValue(dados());
    montar(<FireNoInicio tenantId="lotus" />);
    expect(await screen.findByText(/Você:/)).toHaveTextContent('Você: 90 pontos · 2º de 3');
    expect(within(screen.getByRole('list', { name: 'Topo da classificação' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3 visitas até sexta')).toBeInTheDocument();
    expect(screen.queryByText('Desafio vencido')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver de onde veio cada ponto' }));
    expect(screen.getByText('extrato de lucia')).toBeInTheDocument();
  });

  it('sem edição ativa, o bloco não aparece', async () => {
    painel.mockResolvedValue(dados({ edicao: edicao({ status: 'encerrada' }) }));
    const { container } = montar(<FireNoInicio tenantId="lotus" />);
    await waitFor(() => expect(painel).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('A.6 · Fire na gestão', () => {
  it('quem não é diretoria vê a campanha, sem botões de mexer', async () => {
    painel.mockResolvedValue(dados());
    montar(<FireGestao tenantId="lotus" />);
    expect(await screen.findByText('Fire de Outubro', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova edição' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Encerrar edição' })).toBeNull();
    expect(screen.getByText(/Sem atuação definida — não pontuam: Sérgio/)).toBeInTheDocument();
    expect(screen.getByText('Maior venda')).toBeInTheDocument();
  });

  it('a diretoria cria o rascunho com a pontuação por atuação', async () => {
    painel.mockResolvedValue(dados({ pode_gerir: true, edicoes: [], edicao: null }));
    salvar.mockResolvedValue('nova');
    montar(<FireGestao tenantId="lotus" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova edição' }));
    fireEvent.change(screen.getByLabelText('Nome da edição'), { target: { value: 'Fire de Novembro' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Prontos · Visita'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith('lotus', {
      id: undefined, nome: 'Fire de Novembro', inicio: '2026-11-01', fim: '2026-11-30',
      pontuacao: { lancamentos: { captacao: 5, visita: 10, proposta: 20, venda: 50 }, prontos: { captacao: 5, visita: 15, proposta: 20, venda: 50 } },
    }));
  });

  it('rascunho se ativa; ativa só encerra depois de confirmar', async () => {
    painel.mockResolvedValue(dados({ pode_gerir: true, edicao: edicao({ status: 'rascunho' }) }));
    ativar.mockResolvedValue(12);
    const { unmount } = montar(<FireGestao tenantId="lotus" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(ativar).toHaveBeenCalledWith('ed'));
    unmount();

    painel.mockResolvedValue(dados({ pode_gerir: true }));
    encerrar.mockResolvedValue(undefined);
    montar(<FireGestao tenantId="lotus" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar edição' }));
    expect(encerrar).not.toHaveBeenCalled();
    expect(screen.getByText(/Encerrar congela a classificação/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar agora' }));
    await waitFor(() => expect(encerrar).toHaveBeenCalledWith('ed'));
  });

  it('a classificação filtra por atuação e soma por equipe; clicar abre o extrato', async () => {
    painel.mockResolvedValue(dados({ pode_gerir: true }));
    montar(<FireGestao tenantId="lotus" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Prontos' }));
    expect(screen.getByText('Paulo')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).toBeNull();
    fireEvent.click(screen.getByText('Paulo'));
    expect(screen.getByText('extrato de paulo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Por equipe' }));
    const lanc = screen.getByText('Lançamentos', { selector: 'td' }).closest('tr')!;
    expect(within(lanc).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Lançamentos', '2', '210']);
  });
});
