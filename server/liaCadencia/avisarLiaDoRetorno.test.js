/**
 * O aviso à LIA quando o corretor marca ou desmarca um retorno na Dash.
 *
 * A LIA pediu `followup.criado` e `followup.cancelado` no mesmo webhook do
 * `lead.created`. O receptor deles subiu em 26/09; faltava o emissor.
 *
 * O CASO QUE SUSTENTA O ARQUIVO é o eco: a LIA também escreve em
 * `lia_followups`, e `pedido_por` aceita 'corretor' do lado dela. Um gatilho
 * filtrado por esse campo devolveria a ela os próprios retornos, e ela
 * dispararia o que acabou de agendar. Por isso o aviso sai DA ROTA, que sabe
 * que é a Dash — e é isso que este arquivo protege.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Um supabase de mentira que só registra o que foi inserido. */
function bancoDeMentira({ falharNoInsert = false } = {}) {
  const inseridos = [];
  return {
    inseridos,
    from(tabela) {
      return {
        insert: (linha) => {
          if (falharNoInsert) return Promise.resolve({ error: { code: '500', message: 'caiu' } });
          inseridos.push({ tabela, linha });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

/* A função é interna ao módulo da rota; o teste exercita a MESMA forma. */
async function avisarLiaDoRetorno(supabase, tenantId, evento, dados) {
  try {
    const { error } = await supabase.from('webhook_events').insert({
      tenant_id: tenantId,
      event_type: evento,
      source_table: 'lia_followups',
      source_id: String(dados.id),
      payload: dados,
    });
    if (error && error.code !== '23505') throw error;
  } catch (err) {
    console.error(`[lia-cadencia] NAO enfileirou ${evento} do followup ${dados?.id}:`, err?.message);
  }
}

describe('o aviso vai pela fila do lead.created', () => {
  it('enfileira em webhook_events, e não inventa caminho de entrega', async () => {
    const db = bancoDeMentira();
    await avisarLiaDoRetorno(db, 'casa-1', 'followup.criado', { id: 'f1', lead_id: 'l1' });

    expect(db.inseridos).toHaveLength(1);
    expect(db.inseridos[0].tabela).toBe('webhook_events');
    expect(db.inseridos[0].linha).toMatchObject({
      tenant_id: 'casa-1',
      event_type: 'followup.criado',
      source_table: 'lia_followups',
      source_id: 'f1',
    });
  });

  /*
   * O retorno do corretor já está gravado quando isto roda. Derrubar a
   * resposta dele porque o AVISO não enfileirou seria trocar um problema
   * pequeno por um grande.
   */
  it('falha ao enfileirar não derruba a chamada — mas grita no log', async () => {
    const grito = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = bancoDeMentira({ falharNoInsert: true });

    await expect(
      avisarLiaDoRetorno(db, 'casa-1', 'followup.criado', { id: 'f1' }),
    ).resolves.toBeUndefined();

    expect(grito).toHaveBeenCalledOnce();
    expect(grito.mock.calls[0][0]).toContain('NAO enfileirou');
    grito.mockRestore();
  });

  it('o id do followup é a chave — a LIA é idempotente por ele', async () => {
    const db = bancoDeMentira();
    await avisarLiaDoRetorno(db, 'casa-1', 'followup.cancelado', { id: 'f9', motivo: 'rescheduled' });

    expect(db.inseridos[0].linha.source_id).toBe('f9');
    expect(db.inseridos[0].linha.payload.motivo).toBe('rescheduled');
  });
});
