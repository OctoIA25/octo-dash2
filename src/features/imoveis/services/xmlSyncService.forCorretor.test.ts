import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regressão (A9-resto): syncImoveisForCorretor carrega as atribuições existentes em
 * LOTE (.in) em vez de 1 getExistingAssignment por imóvel, preservando o comportamento.
 */
const h = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  inMock: vi.fn(),
  upsertMock: vi.fn(),
  getTenantImoveis: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: (...a: unknown[]) => h.maybeSingleMock(...a),
    in: (...a: unknown[]) => h.inMock(...a),
    upsert: (...a: unknown[]) => h.upsertMock(...a),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('../services/imoveisXmlService', () => ({ getTenantImoveis: h.getTenantImoveis }));
vi.mock('../services/kenloLeadsService', () => ({ findCorretorInSystem: vi.fn() }));

import { syncImoveisForCorretor } from './xmlSyncService';

const imovel = (
  referencia: string,
  { email, nome = 'Ana', numero = '11999990000' }: { email: string; nome?: string; numero?: string },
) => ({ referencia, corretor_nome: nome, corretor_email: email, corretor_numero: numero });

beforeEach(() => {
  vi.clearAllMocks();
  // broker lookup (tenant_brokers) retorna o corretor
  h.maybeSingleMock.mockResolvedValue({
    data: { id: 'b1', name: 'Ana', email: 'ana@x.com', phone: '11999990000' },
    error: null,
  });
  h.inMock.mockResolvedValue({ data: [], error: null }); // sem atribuições existentes
  h.upsertMock.mockResolvedValue({ error: null });
});

describe('A9 — syncImoveisForCorretor batcheia getExistingAssignment', () => {
  it('faz 1 leitura em lote (.in) e atribui todos os imóveis do corretor', async () => {
    h.getTenantImoveis.mockReturnValue([
      imovel('A1', { email: 'ana@x.com' }),
      imovel('A2', { email: 'ana@x.com' }),
      imovel('A3', { email: 'ana@x.com' }),
      // outro corretor (email/nome/telefone distintos) → filtrado fora
      imovel('Z9', { email: 'carlos@y.com', nome: 'Carlos', numero: '11000000000' }),
    ]);

    const result = await syncImoveisForCorretor('tenant-1', 'user-ana');

    expect(h.inMock).toHaveBeenCalledTimes(1); // batch, não 1 por imóvel
    expect(result.success).toBe(true);
    expect(result.imoveisSincronizados).toBe(3);
    expect(h.upsertMock).toHaveBeenCalledTimes(3);
    expect(result.diagnostico?.every((d) => d.status === 'atribuido')).toBe(true);
  });

  it('respeita atribuição existente de OUTRO corretor (conflito, sem upsert)', async () => {
    h.getTenantImoveis.mockReturnValue([imovel('A1', { email: 'ana@x.com' })]);
    h.inMock.mockResolvedValue({
      data: [{ codigo_imovel: 'A1', corretor_id: 'outro', corretor_nome: 'Outro' }],
      error: null,
    });

    const result = await syncImoveisForCorretor('tenant-1', 'user-ana');

    expect(result.diagnostico?.[0].status).toBe('conflito');
    expect(h.upsertMock).not.toHaveBeenCalled();
  });
});
