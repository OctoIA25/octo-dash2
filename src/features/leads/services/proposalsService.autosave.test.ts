/**
 * "Alguns não arquivam" (relato de 28/09/2026, Lotus).
 *
 * O salvamento automático da tela de Propostas regravava a linha inteira com
 * o que a tela tinha na memória. Duas colunas vinham erradas por construção:
 *  - lead_id/source: toda proposta salva vira 'draft' na tela, e o autosave
 *    gravava lead_id NULL + 'draft' — a proposta perdia o lead;
 *  - stage_id/status: gravava a etapa de quando o autosave foi agendado, e
 *    desfazia o arquivamento feito nos 650 ms seguintes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enviados: Record<string, unknown>[] = [];

function builder() {
  const chain: Record<string, unknown> = {};
  chain.update = (payload: Record<string, unknown>) => { enviados.push(payload); return chain; };
  chain.eq = () => chain;
  chain.select = () => chain;
  chain.order = () => chain;
  chain.single = () => Promise.resolve({ data: { id: 'p1' }, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => builder() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => builder() } }));

import { updateSavedProposalFields, type SaveProposalInput } from './proposalsService';

// O que a tela manda hoje para uma proposta do CRM já salva: ela a trata como
// 'draft' e não tem o lead à mão.
const DA_TELA = {
  id: 'p1',
  tenantId: 't1',
  leadId: null,
  source: 'draft',
  stageId: 'proposta-enviada',
  status: 'Proposta Enviada',
  propertyReference: 'AP10',
  parties: [],
} as unknown as SaveProposalInput & { id: string };

beforeEach(() => { enviados.length = 0; });

describe('salvamento automático de proposta existente', () => {
  it('não regrava vínculo com o lead, origem nem etapa', async () => {
    await updateSavedProposalFields(DA_TELA);

    expect(enviados).toHaveLength(1);
    for (const coluna of ['lead_id', 'source', 'stage_id', 'status']) {
      expect(enviados[0]).not.toHaveProperty(coluna);
    }
  });

  it('continua gravando o que o usuário edita', async () => {
    await updateSavedProposalFields(DA_TELA);
    expect(enviados[0]).toMatchObject({ tenant_id: 't1', property_reference: 'AP10' });
  });
});
