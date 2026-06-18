import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regressão (A9): syncImoveisFromXml não pode mais fazer N+1.
 * Prova que:
 *  - getExistingAssignment vira 1 leitura em lote (.in) em vez de 1 por imóvel;
 *  - findCorretorInSystem é memoizada (chamada 1× por corretor único, não por imóvel);
 *  - o diagnóstico/resultado é preservado.
 */

const h = vi.hoisted(() => ({
  inMock: vi.fn<(...a: unknown[]) => Promise<{ data: unknown[]; error: null }>>(),
  upsertMock: vi.fn<(...a: unknown[]) => Promise<{ error: null }>>(),
  getTenantImoveis: vi.fn(),
  findCorretorInSystem: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: (...a: unknown[]) => h.inMock(...a),
    upsert: (...a: unknown[]) => h.upsertMock(...a),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('../services/imoveisXmlService', () => ({ getTenantImoveis: h.getTenantImoveis }));
vi.mock('../services/kenloLeadsService', () => ({ findCorretorInSystem: h.findCorretorInSystem }));

import { syncImoveisFromXml } from './xmlSyncService';

const imovel = (referencia: string, corretor: { nome?: string; email?: string; numero?: string }) => ({
  referencia,
  corretor_nome: corretor.nome,
  corretor_email: corretor.email,
  corretor_numero: corretor.numero,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.inMock.mockResolvedValue({ data: [], error: null }); // nenhuma atribuição existente
  h.upsertMock.mockResolvedValue({ error: null });
});

describe('A9 — syncImoveisFromXml sem N+1', () => {
  it('memoiza findCorretorInSystem (1× por corretor único, não por imóvel) e atribui todos', async () => {
    // 4 imóveis, 2 corretores únicos (X em 3 imóveis, Y em 1)
    const corretorX = { nome: 'Ana', email: 'ana@x.com', numero: '11999990000' };
    const corretorY = { nome: 'Bru', email: 'bru@y.com', numero: '11888880000' };
    h.getTenantImoveis.mockReturnValue([
      imovel('A1', corretorX),
      imovel('A2', corretorX),
      imovel('A3', corretorY),
      imovel('A4', corretorX),
    ]);
    h.findCorretorInSystem.mockImplementation(async (_t: string, cx: { email?: string }) =>
      cx.email === 'ana@x.com'
        ? { id: 'user-X', nome: 'Ana', matchType: 'email' }
        : { id: 'user-Y', nome: 'Bru', matchType: 'email' },
    );

    const result = await syncImoveisFromXml('tenant-1');

    // Memoização: 2 chamadas (X e Y), não 4
    expect(h.findCorretorInSystem).toHaveBeenCalledTimes(2);
    // Batch: 1 leitura .in (não 1 por imóvel)
    expect(h.inMock).toHaveBeenCalledTimes(1);
    // Comportamento preservado: 4 imóveis atribuídos, todos 'atribuido'
    expect(result.success).toBe(true);
    expect(result.imoveisSincronizados).toBe(4);
    expect(result.diagnostico?.every((d) => d.status === 'atribuido')).toBe(true);
    expect(h.upsertMock).toHaveBeenCalledTimes(4);
    expect(result.corretoresEncontrados).toBe(2);
  });

  it('respeita atribuição existente (conflito não sobrescreve)', async () => {
    const corretorX = { nome: 'Ana', email: 'ana@x.com', numero: '11999990000' };
    h.getTenantImoveis.mockReturnValue([imovel('A1', corretorX)]);
    // já existe atribuição para A1 com OUTRO corretor
    h.inMock.mockResolvedValue({
      data: [{ codigo_imovel: 'A1', corretor_id: 'outro-user', corretor_nome: 'Outro' }],
      error: null,
    });
    h.findCorretorInSystem.mockResolvedValue({ id: 'user-X', nome: 'Ana', matchType: 'email' });

    const result = await syncImoveisFromXml('tenant-1');

    expect(result.diagnostico?.[0].status).toBe('conflito');
    expect(h.upsertMock).not.toHaveBeenCalled(); // não sobrescreve
  });
});
