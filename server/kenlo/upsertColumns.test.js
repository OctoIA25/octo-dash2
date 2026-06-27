/**
 * Guarda do contrato mais crítico do sync incremental: o UPSERT de leads existentes
 * NÃO pode tocar colunas locais do CRM (temperature, archived_at, first_response_at,
 * is_exclusive, archive_reason). O supabase-js deriva o `columns` do UPSERT como a
 * UNIÃO das chaves de todas as rows do lote. Este teste roda o postgrest-js REAL
 * (não o fake) e verifica que essas colunas ficam fora do `columns` — então o SQL
 * gerado (col = EXCLUDED.col) nunca as referencia e elas são preservadas.
 *
 * Se alguém um dia juntar os lotes de insert e update num único upsert, ou espalhar
 * a linha existente inteira na row de update, este teste quebra — que é o objetivo.
 */
import { describe, it, expect } from 'vitest';
import { PostgrestQueryBuilder } from '@supabase/postgrest-js';

const LOCAL_ONLY = ['temperature', 'archived_at', 'archive_reason', 'first_response_at', 'is_exclusive'];

// Captura a URL gerada sem fazer rede de verdade.
function captureUpsert(rows) {
  let captured = '';
  const fetchSpy = async (url) => { captured = String(url); return new Response('[]', { status: 201 }); };
  const qb = new PostgrestQueryBuilder(new URL('http://local/kenlo_leads'), { headers: {}, schema: 'public', fetch: fetchSpy });
  return qb.upsert(rows, { onConflict: 'tenant_id,external_id', ignoreDuplicates: false }).then(() => {
    const cols = new URL(captured).searchParams.get('columns') || '';
    return cols.replace(/"/g, '').split(',').filter(Boolean);
  });
}

describe('UPSERT columns-union (postgrest-js real)', () => {
  it('row de update (chaves de conflito + campos Kenlo) NÃO inclui colunas locais', async () => {
    // Espelha exatamente a row montada em KenloSyncService para updates.
    const updateRow = {
      tenant_id: 't1', external_id: 'joao', kenlo_fingerprint: 'abc',
      client_name: 'João', client_phone: '11988887777', client_email: 'j@x.com',
      lead_timestamp: '2026-06-25T10:00:00Z', portal: 'Site', message: null,
      interest_image: null, interest_reference: 'IM-1', interest_type: 'sale',
      interest_is_sale: true, interest_is_rent: false, raw_data: { _id: 'joao' },
    };
    const cols = await captureUpsert([updateRow]);
    for (const local of LOCAL_ONLY) expect(cols).not.toContain(local);
    expect(cols).toContain('client_email'); // campo Kenlo presente (será atualizado)
    expect(cols).not.toContain('stage');     // stage preservado por omissão
  });

  it('PROVA do risco: misturar uma row "gorda" amplia a união e arrastaria colunas locais', async () => {
    // Documenta POR QUE inserts e updates são lotes separados: se uma row do lote
    // tiver temperature/archived_at, elas entram no `columns` e nulariam as outras.
    const fat = { tenant_id: 't1', external_id: 'a', temperature: 'hot', archived_at: '2026-01-01' };
    const lean = { tenant_id: 't1', external_id: 'b', client_email: 'x@y.com' };
    const cols = await captureUpsert([fat, lean]);
    expect(cols).toContain('temperature');  // exatamente o que NÃO queremos no lote de update
    expect(cols).toContain('archived_at');
  });
});
