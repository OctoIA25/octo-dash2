/**
 * A.7 · as telas: o player só conta o que tocou, a prova abre depois das
 * aulas, as abas vazias somem, e o certificado se confere pelo hash. As
 * regras de verdade (relógio, gabarito, hash) são do banco
 * (supabase/tests/universidade.test.sql).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Aula, Curso } from '../universidadeService';

const servico = vi.hoisted(() => ({
  registrarProgresso: vi.fn(), carregarCurso: vi.fn(), responderProva: vi.fn(),
  carregarCursos: vi.fn(), carregarTrilha: vi.fn(), verificarCertificado: vi.fn(),
}));
vi.mock('../universidadeService', () => servico);
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'eu', systemRole: 'corretor' } }) }));

// Um player de mentira: guardamos o onStateChange e mandamos a posição.
const yt = vi.hoisted(() => ({ estado: null as null | ((e: { data: number }) => void), posicao: 0 }));
vi.mock('../youtube', () => ({
  carregarYouTube: async () => ({
    PlayerState: { PLAYING: 1 },
    Player: class {
      constructor(_el: unknown, o: { events: { onStateChange: (e: { data: number }) => void } }) { yt.estado = o.events.onStateChange; }
      getCurrentTime() { return yt.posicao; }
      destroy() {}
    },
  }),
}));

import { PlayerDaAula } from '../PlayerDaAula';
import { CursoView } from '../CursoView';
import { AbasDaUniversidade } from '../AbasDaUniversidade';
import { CertificadoPage } from '../CertificadoPage';

const comQuery = (ui: React.ReactElement, rota = '/') => render(
  <MemoryRouter initialEntries={[rota]}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
  </MemoryRouter>,
);
const aula = (o: Partial<Aula> = {}): Aula => ({
  id: 'a1', ordem: 1, titulo: 'Boas-vindas', descricao: null, youtube_id: 'dQw4w9WgXcQ', duracao_seg: 600,
  segundos_vistos: 0, concluida: false, ...o,
});

beforeEach(() => { Object.values(servico).forEach((f) => f.mockReset()); yt.estado = null; yt.posicao = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('A.7 · o player conta o que tocou', () => {
  it('tocou 12 s e arrastou até o fim: manda 12, não 600', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    servico.registrarProgresso.mockResolvedValue({ segundos_vistos: 12, concluida: false });
    render(<PlayerDaAula aula={aula()} onRegistrou={() => {}} />);
    await waitFor(() => expect(yt.estado).not.toBeNull());
    act(() => yt.estado!({ data: 1 }));                        // tocando
    for (let s = 0; s <= 12; s++) { yt.posicao = s; act(() => { vi.advanceTimersByTime(1000); }); }
    yt.posicao = 598;                                           // arrastou a barra
    act(() => { vi.advanceTimersByTime(1000); });
    yt.posicao = 599;
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => yt.estado!({ data: 2 }));                        // pausou
    const enviados = servico.registrarProgresso.mock.calls.map((c) => c[1] as number);
    expect(Math.max(...enviados)).toBeLessThanOrEqual(14);
    expect(Math.max(...enviados)).toBeGreaterThanOrEqual(11);
  });
});

const curso = (o: Partial<Curso> = {}): Curso => ({
  id: 'c1', titulo: 'Onboarding', descricao: null, categoria: null, publicado: true, nota_corte: 70,
  aulas: [aula({ concluida: true, segundos_vistos: 600 }), aula({ id: 'a2', ordem: 2, titulo: 'Cadastro' })],
  questoes: [{ id: 'q1', ordem: 1, enunciado: 'Quem atende primeiro?', alternativas: ['A LIA', 'O corretor'] }],
  tentativas: [], meu: { situacao: 'no_meio', aulas: 2, aulas_concluidas: 1, tem_prova: true, tentativas: 0, melhor_nota: null, certificado: null },
  ...o,
});

describe('A.7 · o curso', () => {
  it('a prova fica fechada até a última aula', async () => {
    servico.carregarCurso.mockResolvedValue(curso());
    comQuery(<CursoView cursoId="c1" onVoltar={() => {}} />);
    expect(await screen.findByText('A prova abre depois de todas as aulas assistidas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar respostas' })).toBeNull();
  });

  it('com as aulas vistas, responde e mostra o resultado; aprovado ganha o certificado', async () => {
    const todas = curso({ aulas: [aula({ concluida: true }), aula({ id: 'a2', ordem: 2, concluida: true })] });
    servico.carregarCurso.mockResolvedValue(todas);
    servico.responderProva.mockResolvedValue({ nota: 100, aprovado: true, nota_corte: 70, certas: 1, total: 1, certificado: { hash: 'f'.repeat(64), emitido_em: '2026-10-01T12:00:00Z', novo: true } });
    comQuery(<CursoView cursoId="c1" onVoltar={() => {}} />);
    fireEvent.click(await screen.findByLabelText('A LIA'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    await waitFor(() => expect(servico.responderProva).toHaveBeenCalledWith('c1', [0]));
    expect(await screen.findByRole('status')).toHaveTextContent('Aprovado com 100');
  });

  it('com certificado, o link de conferência traz o hash', async () => {
    const hash = 'a'.repeat(64);
    servico.carregarCurso.mockResolvedValue(curso({ meu: { ...curso().meu, situacao: 'concluiu', certificado: { hash, emitido_em: '2026-10-01T12:00:00Z' } } }));
    comQuery(<CursoView cursoId="c1" onVoltar={() => {}} />);
    expect(await screen.findByRole('link', { name: 'Conferir o certificado' })).toHaveAttribute('href', `/certificado/${hash}`);
  });
});

describe('A.7 · as abas não mostram tela vazia', () => {
  it('corretor sem curso publicado e sem trilha: nada de aba', async () => {
    servico.carregarCursos.mockResolvedValue({ pode_gerir: false, cursos: [] });
    servico.carregarTrilha.mockResolvedValue({ prazo: null, gestor: null, pode_editar: false, itens: [] });
    const { container } = comQuery(<AbasDaUniversidade tenantId="lotus" />);
    await waitFor(() => expect(servico.carregarTrilha).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('com curso publicado, aparece Cursos; com item na trilha, Minha trilha', async () => {
    servico.carregarCursos.mockResolvedValue({ pode_gerir: false, cursos: [{ id: 'c1' }] });
    servico.carregarTrilha.mockResolvedValue({ prazo: null, gestor: null, pode_editar: false, itens: [{ id: 'i1' }] });
    comQuery(<AbasDaUniversidade tenantId="lotus" />);
    expect(await screen.findByRole('tab', { name: 'Cursos' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Minha trilha' })).toBeInTheDocument();
  });
});

describe('A.7 · conferência do certificado', () => {
  const abrir = (hash: string) => comQuery(<Routes><Route path="/certificado/:hash" element={<CertificadoPage />} /></Routes>, `/certificado/${hash}`);

  it('válido mostra quem, o quê e quando', async () => {
    servico.verificarCertificado.mockResolvedValue({ valido: true, nome: 'Ana Aluna', curso: 'Onboarding', nota: 100, emitido_em: '2026-10-01T12:00:00Z', imobiliaria: 'Lotus' });
    abrir('b'.repeat(64));
    expect(await screen.findByText('Certificado válido ✓')).toBeInTheDocument();
    expect(screen.getByText('Ana Aluna')).toBeInTheDocument();
  });
  it('adulterado: existe, mas não bate', async () => {
    servico.verificarCertificado.mockResolvedValue({ valido: false, nome: 'Outra Pessoa', curso: 'Onboarding' });
    abrir('c'.repeat(64));
    expect(await screen.findByText(/ele foi alterado/)).toBeInTheDocument();
  });
  it('código que não é hash nem consulta', () => {
    abrir('nao-e-hash');
    expect(screen.getByText('Esse código não é de um certificado.')).toBeInTheDocument();
    expect(servico.verificarCertificado).not.toHaveBeenCalled();
  });
});
