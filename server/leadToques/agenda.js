/**
 * Cadência ↔ agenda.
 *
 * O próximo toque marcado pelo corretor vira uma atividade "Retornar para o
 * cliente" na agenda dele, ligada ao lead. Ela é bloqueante como qualquer
 * outra: vencida, o corretor é cobrado e, 24h depois, sai do recebimento de
 * leads (processar_atividades_pendentes).
 *
 * Registrar um toque novo FECHA a atividade do toque anterior — é a mesma
 * regra que o aviso da cadência já usa ("toque novo substitui o compromisso").
 * Sem isso, a atividade velha venceria e bloquearia justamente quem está em dia.
 *
 * Desfazer o toque não aparece aqui: a coluna `toque_id` tem ON DELETE CASCADE,
 * então apagar o toque leva a atividade junto (20260920).
 *
 * Falha aqui NÃO derruba o toque: o toque é o que o corretor fez, a atividade é
 * consequência. Sem ela o lead fica sem prazo — erra para o lado de não
 * bloquear ninguém por engano —, e o erro sai no log do servidor.
 */

export const TIPO_CADENCIA = 'retornar_cliente';
export const TITULO_CADENCIA = 'Retornar para o cliente';

const STATUS_ABERTOS = ['pendente', 'confirmado'];

// 'sv-SE' formata como "2026-09-21 14:00", que é o formato da agenda (data + horário).
const FORMATO_SAO_PAULO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Instante gravado no toque → data e horário como o corretor marcou. */
export function dataHoraEmSaoPaulo(iso) {
  if (!iso) return null;
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return null;
  const [data, horario] = FORMATO_SAO_PAULO.format(instante).split(' ');
  return { data, horario };
}

/**
 * Lead do CRM entra por `lead_uuid` (tem chave estrangeira para `leads`);
 * qualquer outro por `lead_id`, que não tem — enfiar um id de fora em lead_uuid
 * seria rejeitado pelo banco.
 */
export function colunaDoLead(lead) {
  return lead?.tabela === 'leads' ? 'lead_uuid' : 'lead_id';
}

export function eventoDoToque({ toque, tenantId, corretorEmail, lead }) {
  const quando = dataHoraEmSaoPaulo(toque?.proximo_toque_em);
  if (!quando) return null;

  return {
    tenant_id: tenantId,
    corretor_email: corretorEmail,
    titulo: TITULO_CADENCIA,
    descricao: 'Próximo toque da cadência do lead.',
    data: quando.data,
    horario: quando.horario,
    tipo: TIPO_CADENCIA,
    status: 'pendente',
    prioridade: 'media',
    [colunaDoLead(lead)]: lead.id,
    lead_nome: lead.nome ?? null,
    lead_telefone: lead.phone ?? null,
    toque_id: toque.id,
  };
}

export async function sincronizarAgendaDoToque({ supabase, toque, tenantId, corretorEmail, lead }) {
  try {
    const { error: erroFechamento } = await supabase
      .from('agenda_eventos')
      .update({ status: 'concluido', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq(colunaDoLead(lead), lead.id)
      .not('toque_id', 'is', null)
      .neq('toque_id', toque.id)
      .in('status', STATUS_ABERTOS);
    if (erroFechamento) throw erroFechamento;

    const evento = eventoDoToque({ toque, tenantId, corretorEmail, lead });
    if (!evento) return null;

    const { data, error } = await supabase.from('agenda_eventos').insert(evento).select('id').single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[lead-toques] toque registrado, mas a agenda não acompanhou:', err?.message);
    return null;
  }
}
