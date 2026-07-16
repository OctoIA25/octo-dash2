import { describe, it, expect } from 'vitest';
import { normalizeC2sLead, c2sFingerprint, mergeC2sLeadUpdate } from './c2sNormalizer.js';

// Payload conforme a doc oficial (docs-api-leads.c2sapp.com) — item de data[].
const raw = (over = {}, attrOver = {}) => ({
  type: 'lead',
  id: 'a1b2c3hash',
  internal_id: 12345678,
  attributes: {
    description: 'Apartamento 3 quartos',
    product: {
      id: 'p1', description: '[101] Apartamento 3 quartos', prop_ref: '101',
      price_float: 350000, city: 'São Paulo',
      real_estate_detail: { negotiation_name: 'Compra' },
    },
    customer: { id: 'c1', name: 'João Silva', email: 'joao@email.com', phone: '5511999998888', phone_global: '+5511999998888' },
    seller: { id: 's1', name: 'Maria Vendedora', email: 'maria@empresa.com' },
    lead_source: { id: 542, name: 'Ação de Rua' },
    channel: { id: 2, name: 'Showroom' },
    lead_status: { id: 1, alias: 'under_negotiation', name: 'Em negociação' },
    funnel_status: { status: 'In attendance' },
    archive_details: { archived: false, archive_notes: null },
    created_at: '2026-04-16T11:40:26.000-03:00',
    updated_at: '2026-06-20T09:00:00.000-03:00',
    ...attrOver,
  },
  messages: [
    { sender_type: 'Seller', recipient_type: 'Customer', body: 'Bom dia!' },
    { sender_type: 'Customer', recipient_type: 'Seller', body: 'Quero visitar o 101' },
  ],
  ...over,
});

describe('normalizeC2sLead', () => {
  it('mapeia payload C2S → linha canônica de kenlo_leads', () => {
    const row = normalizeC2sLead(raw(), 't1');
    expect(row.tenant_id).toBe('t1');
    expect(row.external_id).toBe('a1b2c3hash');       // id criptografado da C2S, como veio
    expect(row.client_name).toBe('João Silva');
    expect(row.client_phone).toBe('11999998888');     // DDI 55 removido (convenção kenlo_leads)
    expect(row.client_email).toBe('joao@email.com');
    expect(row.lead_timestamp).toBe('2026-04-16T11:40:26.000-03:00');
    expect(row.portal).toBe('Ação de Rua');           // lead_source vence channel
    expect(row.message).toBe('Quero visitar o 101');  // primeira msg do CLIENTE, não do corretor
    expect(row.interest_reference).toBe('101');
    expect(row.interest_type).toBe('Compra');
    expect(row.interest_is_sale).toBe(true);
    expect(row.interest_is_rent).toBe(false);
    expect(row.attended_by_name).toBe('Maria Vendedora');
    expect(row.stage).toBe('contacted');              // funnel_status "In attendance" → contacted
    expect(row.archived_at).toBeNull();               // ativo: sinal canônico é archived_at IS NULL
    expect(row.archive_reason).toBeNull();
    expect(row.raw_data).toBeTruthy();
    // attended_by_id NUNCA: o id de seller da C2S é hash, não uuid de tenant_brokers.
    expect(row).not.toHaveProperty('attended_by_id');
    // source_crm é estampado pelo ENGINE, não pelo normalizador.
    expect(row).not.toHaveProperty('source_crm');
    // kenlo_leads NÃO tem coluna is_archived (arquivado = archived_at != null).
    expect(row).not.toHaveProperty('is_archived');
  });

  it('stage: New lead → new; locação → is_rent', () => {
    const row = normalizeC2sLead(raw({}, {
      lead_status: { id: 0, alias: 'new', name: 'Novo' },
      funnel_status: { status: 'New lead' },
      product: { prop_ref: 'X', real_estate_detail: { negotiation_name: 'Locação' } },
    }), 't1');
    expect(row.stage).toBe('new');
    expect(row.interest_is_rent).toBe(true);
    expect(row.interest_is_sale).toBe(false);
  });

  // O funil detalhado da C2S deve cair nas colunas certas do Kanban (não colapsar
  // tudo em new/contacted). Slugs conforme o CHECK de kenlo_leads.stage +
  // KENLO_STAGE_TO_STATUS do front.
  describe('mapeamento do funil C2S → stage do Kanban', () => {
    const stageFor = (funnel, aliasOver) => normalizeC2sLead(
      raw({}, { funnel_status: { status: funnel }, ...(aliasOver && { lead_status: aliasOver }) }), 't1',
    ).stage;

    it('funnel_status posiciona nas colunas intermediárias', () => {
      expect(stageFor('New lead')).toBe('new');
      expect(stageFor('In attendance')).toBe('contacted');
      expect(stageFor('Scheduled visit')).toBe('visit_scheduled'); // Visita Agendada
      expect(stageFor('Done visit')).toBe('visit_done');           // Visita Realizada
      expect(stageFor('Created offer')).toBe('proposal');          // Proposta Enviada
    });

    it('estados terminais do lead_status VENCEM o funil (fechado/arquivado são definitivos)', () => {
      expect(stageFor('Scheduled visit', { alias: 'converted' })).toBe('closed_won'); // Negócio fechado
      expect(stageFor('In attendance', { alias: 'lost' })).toBe('closed_lost');       // Arquivado
    });

    it('sem funil reconhecido cai no macro-estado; sem nada, presença de corretor', () => {
      expect(stageFor('unknown phase', { alias: 'under_negotiation' })).toBe('negotiation');
      const semNada = normalizeC2sLead(raw({}, { funnel_status: null, lead_status: null, seller: { name: 'Ana' } }), 't1');
      expect(semNada.stage).toBe('contacted');
    });

    it('só grava slugs que o CHECK de kenlo_leads.stage aceita (nunca pt-BR nem "visit")', () => {
      const VALID = new Set(['new', 'contacted', 'qualified', 'visit_scheduled', 'visit_done', 'negotiation', 'proposal', 'closed_won', 'closed_lost']);
      for (const f of ['New lead', 'In attendance', 'Scheduled visit', 'Done visit', 'Created offer', 'qualquer coisa']) {
        expect(VALID.has(stageFor(f))).toBe(true);
      }
    });
  });

  describe('extractPropRef — fallback de código do imóvel', () => {
    const withProduct = (productOver) => raw({}, { product: { id: 'p1', real_estate_detail: { negotiation_name: 'Compra' }, ...productOver } });

    it('prop_ref preenchido → usa direto, ignora description', () => {
      const row = normalizeC2sLead(withProduct({ prop_ref: 'AP1146', description: 'outra coisa' }), 't1');
      expect(row.interest_reference).toBe('AP1146');
    });

    it('prop_ref null + description é só o código → extrai', () => {
      const row = normalizeC2sLead(withProduct({ prop_ref: null, description: 'CA0826' }), 't1');
      expect(row.interest_reference).toBe('CA0826');
    });

    it('prop_ref null + description no padrão [CODIGO] → extrai', () => {
      const row = normalizeC2sLead(withProduct({ prop_ref: null, description: '[AP1208] Apartamento com 2 Quartos' }), 't1');
      expect(row.interest_reference).toBe('AP1208');
    });

    it('prop_ref null + description genérica → null', () => {
      const row = normalizeC2sLead(withProduct({ prop_ref: null, description: 'Em locar um imóvel' }), 't1');
      expect(row.interest_reference).toBeNull();
    });

    it('prop_ref null + product null → null', () => {
      const row = normalizeC2sLead(raw({}, { product: null }), 't1');
      expect(row.interest_reference).toBeNull();
    });
  });

  it('portal cai para channel quando lead_source ausente; message cai para description sem msg do cliente', () => {
    const r = raw({ messages: [{ sender_type: 'Seller', body: 'Oi' }] }, { lead_source: null });
    const row = normalizeC2sLead(r, 't1');
    expect(row.portal).toBe('Showroom');
    expect(row.message).toBe('Apartamento 3 quartos');
  });

  it('telefone sem DDI mantém; arquivado reflete archive_details (D4)', () => {
    const r = raw({}, {
      customer: { name: 'X', phone: '11988887777' },
      archive_details: { archived: true, archive_notes: 'duplicado' },
    });
    const row = normalizeC2sLead(r, 't1');
    expect(row.client_phone).toBe('11988887777');
    expect(row.archived_at).toBe('2026-06-20T09:00:00.000-03:00'); // ≈ updated_at da C2S
    expect(row.archive_reason).toBe('duplicado');
  });

  it('teste-pino: normalizador e merge só emitem colunas que EXISTEM em kenlo_leads', () => {
    // Fonte: supabase/migrations/* (schema real). Se uma chave sair desta lista,
    // o upsert falharia em produção com PGRST204 — este teste quebra primeiro.
    // Atualize a lista JUNTO com a migration que criar a coluna.
    const KENLO_LEADS_COLUMNS = new Set([
      'id', 'tenant_id', 'external_id', 'client_name', 'client_phone', 'client_email',
      'lead_timestamp', 'portal', 'message', 'interest_image', 'interest_reference',
      'interest_type', 'interest_is_sale', 'interest_is_rent', 'attended_by_name',
      'attended_by_id', 'stage', 'temperature', 'raw_data', 'created_at', 'updated_at',
      'archived_at', 'archive_reason', 'first_response_at', 'is_exclusive',
      'kenlo_fingerprint', 'source_crm', 'is_backfill',
    ]);
    const row = normalizeC2sLead(raw({}, { archive_details: { archived: true, archive_notes: 'x' } }), 't1');
    for (const k of Object.keys(row)) {
      expect(KENLO_LEADS_COLUMNS.has(k), `normalizador emite coluna inexistente: ${k}`).toBe(true);
    }
    const patch = mergeC2sLeadUpdate(row, { kenlo_fingerprint: 'defasado', archived_at: null });
    for (const k of Object.keys(patch)) {
      expect(KENLO_LEADS_COLUMNS.has(k), `merge emite coluna inexistente: ${k}`).toBe(true);
    }
  });
});

describe('c2sFingerprint', () => {
  it('estável para payload idêntico; sensível a stage/corretor/arquivamento (origem-vence)', () => {
    const a = normalizeC2sLead(raw(), 't1');
    const b = normalizeC2sLead(raw(), 't1');
    expect(c2sFingerprint(a)).toBe(c2sFingerprint(b));

    const stageChanged = { ...a, stage: 'new' };
    const sellerChanged = { ...a, attended_by_name: 'Outro' };
    const archivedChanged = { ...a, archived_at: '2026-06-20T09:00:00.000-03:00' };
    expect(c2sFingerprint(stageChanged)).not.toBe(c2sFingerprint(a));
    expect(c2sFingerprint(sellerChanged)).not.toBe(c2sFingerprint(a));
    expect(c2sFingerprint(archivedChanged)).not.toBe(c2sFingerprint(a));
  });

  it('archived_at (timestamp derivado) NÃO entra no hash — updated_at da C2S não gera update perpétuo', () => {
    const a = normalizeC2sLead(raw({}, { archive_details: { archived: true, archive_notes: 'x' } }), 't1');
    const b = normalizeC2sLead(raw({}, { archive_details: { archived: true, archive_notes: 'x' }, updated_at: '2026-06-21T10:00:00.000-03:00' }), 't1');
    expect(c2sFingerprint(a)).toBe(c2sFingerprint(b));
  });
});

describe('mergeC2sLeadUpdate (origem vence — D1/D4)', () => {
  const existingBase = {
    id: 'row1', external_id: 'a1b2c3hash', stage: 'qualified',
    attended_by_name: 'Corretor Manual', attended_by_id: 'u-1',
    archived_at: null, kenlo_fingerprint: 'defasado',
  };

  it('hash igual → null (zero UPDATE)', () => {
    const incoming = normalizeC2sLead(raw(), 't1');
    const existing = { ...existingBase, kenlo_fingerprint: c2sFingerprint(incoming) };
    expect(mergeC2sLeadUpdate(incoming, existing)).toBeNull();
  });

  it('stage e corretor da C2S SOBRESCREVEM o CRM local (diferente do Kenlo)', () => {
    const incoming = normalizeC2sLead(raw(), 't1');
    const patch = mergeC2sLeadUpdate(incoming, existingBase);
    expect(patch.stage).toBe('contacted');                 // origem vence
    expect(patch.attended_by_name).toBe('Maria Vendedora'); // origem vence
    expect(patch.kenlo_fingerprint).toBe(c2sFingerprint(incoming));
    // Colunas locais do CRM continuam intocáveis por omissão.
    expect(patch).not.toHaveProperty('temperature');
    expect(patch).not.toHaveProperty('first_response_at');
    expect(patch).not.toHaveProperty('is_exclusive');
    expect(patch).not.toHaveProperty('attended_by_id');
    // Sem transição de arquivamento: archived_at não entra (preserva timestamp).
    expect(patch).not.toHaveProperty('archived_at');
    // Coluna inexistente em kenlo_leads jamais pode aparecer num patch.
    expect(patch).not.toHaveProperty('is_archived');
  });

  it('transição de arquivamento grava archived_at; desarquivamento limpa', () => {
    const arquivado = normalizeC2sLead(raw({}, { archive_details: { archived: true, archive_notes: 'perdido' } }), 't1');
    const p1 = mergeC2sLeadUpdate(arquivado, existingBase); // ativo → arquivado
    expect(p1.archived_at).toBe('2026-06-20T09:00:00.000-03:00');
    expect(p1.archive_reason).toBe('perdido');

    const ativo = normalizeC2sLead(raw(), 't1');
    const p2 = mergeC2sLeadUpdate(ativo, { ...existingBase, archived_at: '2026-01-01T00:00:00Z' }); // arquivado → resgatado
    expect(p2.archived_at).toBeNull();
    expect(p2.archive_reason).toBeNull();
  });
});
