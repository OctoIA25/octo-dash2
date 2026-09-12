/**
 * Pendência de anúncio desconhecido: o que a lista mostra e o que a amarração
 * grava. A regra de classificação NÃO é testada aqui — ela vive no banco e é
 * chamada por RPC; o que se prova é que este módulo chama a do banco em vez de
 * ter a sua.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listarAnunciosDesconhecidos, amarrarAnuncio } from './anunciosPendentes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const lead = (over = {}) => ({
  id: over.id || 'lead-1',
  created_at: over.created_at || '2026-09-07T12:00:00Z',
  source: 'ZAP Imóveis',
  property_code: over.property_code ?? '110D1GD',
  classification_source: over.classification_source ?? 'automatic',
  custom_fields: {
    raw_data: {
      original_request: {
        originListingId: over.anuncio ?? '2894853981',
        message: over.message ?? 'Olá, gostaria de ter mais informações para comprar: apartamento, '
          + 'R$ 890.232, Rua Engenheiro José Maria da Silva Velho, 71 - Jardim Ana Maria, Jundiaí - SP '
          + 'que encontrei no Zap. Sua opinião é muito importante para nós.',
      },
    },
  },
  ...(over.extra || {}),
});

/**
 * Supabase de mentira: só os caminhos usados. `updates` e `upserts` registram o
 * que teria sido gravado — é como se prova a regra de precedência sem banco.
 */
const fakeSupabase = ({
  leads = [], leadsError = null, depara = [], deparaError = null,
  catalogo = false, catalogoError = null, classificacao = ['pronto'],
} = {}) => {
  const updates = [];
  const upserts = [];
  const rpcs = [];
  return {
    updates, upserts, rpcs,
    from(tabela) {
      if (tabela === 'lancamento_anuncios') {
        const q = {
          select: () => q,
          eq: async () => ({ data: depara, error: deparaError }),
          upsert: async (linha, opts) => { upserts.push({ linha, opts }); return { error: null }; },
        };
        return q;
      }
      const q = {
        select: () => q,
        eq(_col, val) { q._id = val; return q; },
        or: () => q,
        order: () => q,
        limit: async () => ({ data: leads, error: leadsError }),
        update(patch) { return { eq: async (_c, id) => { updates.push({ id, patch }); return { error: null }; } }; },
      };
      return q;
    },
    rpc: async (fn, args) => {
      rpcs.push({ fn, args });
      if (fn === 'eh_codigo_catalogo') return { data: catalogo, error: catalogoError };
      return { data: classificacao, error: null };
    },
  };
};

/** Lead do Meta Lead Ads: o anúncio é o `form_id`, e não há `original_request`. */
const leadMeta = (over = {}) => ({
  id: over.id || 'meta-1',
  created_at: over.created_at || '2026-09-11T23:09:02Z',
  source: over.source || 'Instagram',
  property_code: over.property_code ?? null,
  classification_source: over.classification_source ?? 'automatic',
  custom_fields: { raw_data: { meta: { form_id: over.form_id ?? '2512857375884799' } } },
});

describe('listarAnunciosDesconhecidos', () => {
  // O buraco que deixou 5 formulários ativos da Lótus invisíveis: lead pago do
  // Meta sem código não aparecia em lugar nenhum porque a tela só olhava ZAP/OLX.
  it('formulário do Meta fora do de-para vira pendência', async () => {
    const supabase = fakeSupabase({ leads: [leadMeta(), leadMeta({ id: 'meta-2' })] });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios).toMatchObject([
      { originListingId: '2512857375884799', codigoNoPortal: null, totalLeads: 2, dica: null },
    ]);
  });

  it('formulário do Meta já mapeado não é pendência', async () => {
    const supabase = fakeSupabase({
      leads: [leadMeta({ form_id: '1050767041092494' })],
      depara: [{ origin_listing_id: '1050767041092494', codigo: 'RESERVA CASTANHEIRA' }],
    });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios).toEqual([]);
  });

  it('agrupa por anúncio, conta leads e extrai o endereço da mensagem', async () => {
    const supabase = fakeSupabase({ leads: [lead(), lead({ id: 'lead-2', created_at: '2026-09-06T10:00:00Z' })] });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.ok).toBe(true);
    expect(r.anuncios).toHaveLength(1);
    expect(r.anuncios[0]).toMatchObject({
      originListingId: '2894853981', codigoNoPortal: '110D1GD', totalLeads: 2,
    });
    expect(r.anuncios[0].dica).toContain('Rua Engenheiro José Maria da Silva Velho, 71');
    // O rodapé que o portal cola em toda mensagem não é endereço.
    expect(r.anuncios[0].dica).not.toContain('Sua opinião');
  });

  it('anúncio que já está no de-para não é pendência', async () => {
    const supabase = fakeSupabase({ leads: [lead()], depara: [{ origin_listing_id: '2894853981', codigo: 'L003' }] });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios).toEqual([]);
  });

  // A tabela do de-para tem RLS sem policy: o navegador não lê 'L001'… sozinho.
  it('devolve os códigos já conhecidos, sem repetir, para a lista de escolha', async () => {
    const supabase = fakeSupabase({
      leads: [lead()],
      depara: [
        { origin_listing_id: '1', codigo: 'L014' },
        { origin_listing_id: '2', codigo: 'L003' },
        { origin_listing_id: '3', codigo: 'L014' },
      ],
    });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.codigosConhecidos).toEqual(['L003', 'L014']);
  });

  it('anúncio do nosso feed (código do catálogo) não é pendência', async () => {
    const supabase = fakeSupabase({ leads: [lead({ property_code: 'AP679' })], catalogo: true });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios).toEqual([]);
  });

  it('confere o catálogo uma vez por código, não por lead', async () => {
    const supabase = fakeSupabase({ leads: [lead(), lead({ id: 'lead-2' }), lead({ id: 'lead-3' })] });
    await listarAnunciosDesconhecidos(supabase, 't1');
    expect(supabase.rpcs.filter((c) => c.fn === 'eh_codigo_catalogo')).toHaveLength(1);
  });

  it('lead sem anúncio no payload é ignorado (não vira pendência anônima)', async () => {
    const supabase = fakeSupabase({ leads: [lead({ anuncio: '' })] });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios).toEqual([]);
  });

  it('mais leads primeiro', async () => {
    const supabase = fakeSupabase({
      leads: [lead(), lead({ id: 'b', anuncio: '999' }), lead({ id: 'c', anuncio: '999' }), lead({ id: 'd', anuncio: '999' })],
    });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.anuncios.map((a) => a.originListingId)).toEqual(['999', '2894853981']);
  });

  it('erro de banco não vira lista vazia — vira erro', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ leadsError: { message: 'timeout' } });
    const r = await listarAnunciosDesconhecidos(supabase, 't1');
    expect(r.ok).toBe(false);
    erro.mockRestore();
  });
});

describe('amarrarAnuncio', () => {
  const log = () => vi.spyOn(console, 'log').mockImplementation(() => {});

  it('amarrar formulário do Meta reprocessa os leads pagos daquele form', async () => {
    const l = log();
    const supabase = fakeSupabase({ leads: [leadMeta(), leadMeta({ id: 'meta-2', form_id: 'outro' })] });
    const r = await amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '2512857375884799', codigo: 'allegrato' });
    expect(r).toMatchObject({ ok: true, codigo: 'ALLEGRATO', leadsAtualizados: 1 });
    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0]).toMatchObject({ id: 'meta-1', patch: { property_code: 'ALLEGRATO' } });
    l.mockRestore();
  });

  it('grava o de-para com o código em MAIÚSCULO e reprocessa os leads do anúncio', async () => {
    const l = log();
    const supabase = fakeSupabase({ leads: [lead(), lead({ id: 'lead-2', anuncio: 'outro' })] });
    const r = await amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '2894853981', codigo: ' ap001 ' });

    expect(r).toMatchObject({ ok: true, codigo: 'AP001', leadsAtualizados: 1 });
    expect(supabase.upserts[0].linha).toEqual({
      tenant_id: 't1', origin_listing_id: '2894853981', codigo: 'AP001',
    });
    // Só o lead DAQUELE anúncio é tocado.
    expect(supabase.updates).toHaveLength(1);
    expect(supabase.updates[0].id).toBe('lead-1');
    expect(supabase.updates[0].patch.property_code).toBe('AP001');
    l.mockRestore();
  });

  it('a classificação vem da função do banco, não de regra local', async () => {
    const l = log();
    const supabase = fakeSupabase({ leads: [lead()], classificacao: ['pronto'] });
    await amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '2894853981', codigo: 'AP001' });
    expect(supabase.rpcs).toContainEqual({
      fn: 'classificar_lead_com_lancamento',
      args: { p_tenant: 't1', p_codigo: 'AP001', p_portal: 'ZAP Imóveis', p_is_rent: null, p_is_sale: null },
    });
    expect(supabase.updates[0].patch.classification).toEqual(['pronto']);
    l.mockRestore();
  });

  it('decisão de humano/Lia é intocável: recebe o código, não a classificação', async () => {
    const l = log();
    const supabase = fakeSupabase({ leads: [lead({ classification_source: 'dashboard' })] });
    await amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '2894853981', codigo: 'AP001' });
    expect(supabase.updates[0].patch).toEqual({ property_code: 'AP001' });
    expect(supabase.rpcs.some((c) => c.fn === 'classificar_lead_com_lancamento')).toBe(false);
    l.mockRestore();
  });

  it('recusa entrada vazia antes de tocar no banco', async () => {
    const supabase = fakeSupabase();
    await expect(amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '', codigo: 'AP001' }))
      .resolves.toMatchObject({ ok: false });
    await expect(amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '123', codigo: '   ' }))
      .resolves.toMatchObject({ ok: false });
    expect(supabase.upserts).toEqual([]);
  });

  it('falha ao reprocessar não desfaz o de-para — lead novo já entra certo', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ leadsError: { message: 'timeout' } });
    const r = await amarrarAnuncio(supabase, { tenantId: 't1', originListingId: '123', codigo: 'L040' });
    expect(r.ok).toBe(true);
    expect(r.aviso).toBeTruthy();
    expect(supabase.upserts).toHaveLength(1);
    erro.mockRestore();
  });
});

describe('rotas', () => {
  it('as duas rotas exigem admin/líder do tenant (mesmo gate da config)', () => {
    const fonte = readFileSync(join(__dirname, 'routes.js'), 'utf8');
    expect(fonte).toMatch(/app\.post\('\/api\/v1\/zap\/anuncios\/desconhecidos', requireManager/);
    expect(fonte).toMatch(/app\.post\('\/api\/v1\/zap\/anuncios', requireManager/);
  });
});
