/**
 * O corretor acrescenta imóveis ao lead. A regra que importa: sem principal,
 * o código VIRA o principal (`property_code`) — nunca uma linha extra num lead
 * sem imóvel, que deixaria o lead "sem imóvel" para relatório, unidade e LIA.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; op: string; payload?: unknown };
const chamadas: Chamada[] = [];
let erroDoInsert: { code: string; message: string } | null = null;

function builder(tabela: string) {
  const chain: Record<string, unknown> = {};
  chain.update = (payload: unknown) => { chamadas.push({ tabela, op: 'update', payload }); return chain; };
  chain.insert = (payload: unknown) => {
    chamadas.push({ tabela, op: 'insert', payload });
    return Promise.resolve({ error: erroDoInsert });
  };
  chain.eq = () => chain;
  chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

import { adicionarImovelAoLead } from './leadsService';

const base = { tenantId: 't1', leadId: 'lead-1' };

beforeEach(() => {
  chamadas.length = 0;
  erroDoInsert = null;
});

describe('adicionarImovelAoLead', () => {
  it('lead sem imóvel: o primeiro vai para property_code', async () => {
    const onde = await adicionarImovelAoLead({ ...base, principal: '  ', codigo: ' ap10 ' });
    expect(onde).toBe('principal');
    expect(chamadas).toEqual([{ tabela: 'leads', op: 'update', payload: { property_code: 'AP10' } }]);
  });

  it('lead com imóvel: o próximo entra na lista de extras', async () => {
    const onde = await adicionarImovelAoLead({ ...base, principal: 'AP10', codigo: 'ca20' });
    expect(onde).toBe('extra');
    expect(chamadas).toEqual([{
      tabela: 'lead_imoveis_interesse', op: 'insert',
      payload: { tenant_id: 't1', lead_id: 'lead-1', codigo: 'CA20' },
    }]);
  });

  it('repetir o principal é recusado sem tocar no banco', async () => {
    await expect(adicionarImovelAoLead({ ...base, principal: 'AP10', codigo: 'ap10' }))
      .rejects.toThrow('já é o imóvel principal');
    expect(chamadas).toEqual([]);
  });

  it('extra repetido (unique do banco) vira mensagem legível', async () => {
    erroDoInsert = { code: '23505', message: 'duplicate key' };
    await expect(adicionarImovelAoLead({ ...base, principal: 'AP10', codigo: 'CA20' }))
      .rejects.toThrow('CA20 já está neste lead.');
  });
});
