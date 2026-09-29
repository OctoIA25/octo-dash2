import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { getTodosCandidatos, deleteCandidato, aplicarMudancaDeEtapa, toast } = vi.hoisted(() => ({
  getTodosCandidatos: vi.fn(),
  deleteCandidato: vi.fn(),
  aplicarMudancaDeEtapa: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('../services/recruitmentService', () => ({ recruitmentService: { getTodosCandidatos, deleteCandidato } }));
vi.mock('../services/mudancaDeEtapa', () => ({ aplicarMudancaDeEtapa }));
vi.mock('sonner', () => ({ toast }));

import { useRecrutamentoQuadro } from './useRecrutamentoQuadro';
import type { CandidatoComEtapas } from '../services/recruitmentService';

const ana = { id: 'a', nome: 'Ana', estagio: 'lead', status: 'Lead', etapas: [] } as unknown as CandidatoComEtapas;
const bia = { id: 'b', nome: 'Bia', estagio: 'onboard', status: 'Onboard', etapas: [] } as unknown as CandidatoComEtapas;

describe('useRecrutamentoQuadro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getTodosCandidatos.mockResolvedValue([ana, bia]);
  });

  it('carrega todos os candidatos do tenant', async () => {
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', autoRefresh: false }));
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(getTodosCandidatos).toHaveBeenCalledWith('t1');
    expect(result.current.candidatos.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.erro).toBeNull();
  });

  it('mover: troca na hora, grava com o e-mail de quem moveu e devolve true', async () => {
    let resolver: (v: unknown) => void = () => {};
    aplicarMudancaDeEtapa.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', usuarioEmail: 'erick@lotus.com', autoRefresh: false }));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    let promessa: Promise<boolean>;
    act(() => { promessa = result.current.moverEstagio(ana, 'qualificado'); });
    // Otimista: antes de o servidor responder o card já está na coluna nova.
    expect(result.current.candidatos.find((c) => c.id === 'a')).toMatchObject({ estagio: 'qualificado', status: 'Qualificado' });
    expect(aplicarMudancaDeEtapa).toHaveBeenCalledWith({ candidato: ana, novoLabel: 'Qualificado', usuarioEmail: 'erick@lotus.com', tenantId: 't1' });

    await act(async () => { resolver({}); expect(await promessa).toBe(true); });
    expect(toast.success).toHaveBeenCalledWith('Ana → Qualificado');
  });

  it('erro: volta para onde estava, mostra a mensagem real e devolve false', async () => {
    aplicarMudancaDeEtapa.mockRejectedValue(new Error('Defina o Coordenador do candidato antes de ativá-lo (regra D062).'));
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', autoRefresh: false }));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.moverEstagio(ana, 'onboard'); });
    expect(ok).toBe(false);
    expect(result.current.candidatos.find((c) => c.id === 'a')).toMatchObject({ estagio: 'lead', status: 'Lead' });
    expect(toast.error).toHaveBeenCalledWith('Defina o Coordenador do candidato antes de ativá-lo (regra D062).');
  });

  it('falha na carga vira `erro`, não exceção', async () => {
    getTodosCandidatos.mockRejectedValue(new Error('rede caiu'));
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', autoRefresh: false }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe('rede caiu');
    expect(result.current.candidatos).toEqual([]);
  });
});

describe('useRecrutamentoQuadro — excluir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getTodosCandidatos.mockResolvedValue([ana, bia]);
  });

  it('apaga no banco (com o tenant), some do quadro e devolve true', async () => {
    deleteCandidato.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', autoRefresh: false }));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.excluir(ana); });
    expect(ok).toBe(true);
    expect(deleteCandidato).toHaveBeenCalledWith('a', 't1');
    expect(result.current.candidatos.map((c) => c.id)).toEqual(['b']);
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Ana/));
  });

  it('erro: fica no quadro, mostra a mensagem real e devolve false', async () => {
    deleteCandidato.mockRejectedValue(new Error('permission denied for table recrut_candidato'));
    const { result } = renderHook(() => useRecrutamentoQuadro({ tenantId: 't1', autoRefresh: false }));
    await waitFor(() => expect(result.current.carregando).toBe(false));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.excluir(ana); });
    expect(ok).toBe(false);
    expect(result.current.candidatos.map((c) => c.id)).toEqual(['a', 'b']);
    expect(toast.error).toHaveBeenCalledWith('permission denied for table recrut_candidato');
  });
});
