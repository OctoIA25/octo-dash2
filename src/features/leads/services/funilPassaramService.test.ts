/**
 * "Não deu para contar quem passou por cada etapa: tenant_required_for_owner"
 * (relato de 28/09/2026).
 *
 * A rota passa por `resolveTenant`, que exige `?tenantId=` quando quem pede é
 * dono da plataforma — sem ele, 400. A conta do funil não mandava. É o mesmo
 * defeito que já tinha quebrado o botão de retorno da cadência.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const urls: string[] = [];
vi.mock('@/features/comunicacao/services/authedFetch', () => ({
  authedFetch: async (url: string) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ ok: true, etapas: ['A'], passaram: [1], inicio_do_historico: null }) };
  },
}));

import { carregarPassaramPorEtapa } from './funilPassaramService';

beforeEach(() => { urls.length = 0; });

describe('carregarPassaramPorEtapa', () => {
  it('manda a imobiliária — o dono da plataforma recebe 400 sem ela', async () => {
    await carregarPassaramPorEtapa(['Novos Leads', 'Interação'], undefined, 'tenant-lotus');
    expect(new URL(urls[0], 'http://x').searchParams.get('tenantId')).toBe('tenant-lotus');
  });

  it("não manda o tenant sintético 'owner' (painel do dono, fora de uma imobiliária)", async () => {
    await carregarPassaramPorEtapa(['Novos Leads'], undefined, 'owner');
    expect(new URL(urls[0], 'http://x').searchParams.has('tenantId')).toBe(false);
  });
});
