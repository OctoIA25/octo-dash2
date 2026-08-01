/**
 * Escalonamento IA→corretor — derivado (NÃO emitido) de lia_perguntas_corretor.
 *
 * A tabela lia_perguntas_corretor é escrita pelo n8n (fora do nosso código). Uma
 * pergunta ao corretor É o escalonamento: a IA transferiu a decisão ao humano.
 *   início     = criado_em      (100% preenchido; escalated_at é NULL em ~61% — não usar)
 *   resolução  = respondida_em  (só quando status='respondida')
 *   unidade    = lead_id DISTINTO (um lead pode gerar várias perguntas)
 *
 * Distribuição real do tempo de resposta é de cauda longa (P50≈2h, P95≈2,4 dias):
 * por isso reportamos P50/P95, NUNCA média (a média mente sob cauda longa).
 *
 * Funções puras: fetch (no endpoint) → estas transformam → DTO. Sem I/O aqui.
 */

/** Percentil por interpolação linear sobre a lista JÁ ordenada crescente. null se vazia. */
export function percentile(sortedValues, q) {
  const n = sortedValues.length;
  if (n === 0) return null;
  if (n === 1) return sortedValues[0];
  const rank = q * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (rank - lo) * (sortedValues[hi] - sortedValues[lo]);
}

/** Minutos entre criado_em e respondida_em; null se algum ausente ou delta negativo. */
function responseMinutes(row) {
  if (!row.criado_em || !row.respondida_em) return null;
  const start = Date.parse(row.criado_em);
  const end = Date.parse(row.respondida_em);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const minutes = (end - start) / 60000;
  return minutes >= 0 ? minutes : null; // relógio do n8n às vezes inverte
}

/**
 * @param {Array} rows       linhas de lia_perguntas_corretor (já filtradas por tenant/janela)
 * @param {Set}   closedLeadIds  ids de leads com final_sale_value > 0 (fechados)
 * @returns DTO com contagens, tempo de resposta (P50/P95) e fechamento de escalonados.
 */
export function computeEscalationMetrics(rows, closedLeadIds) {
  const resolved = rows.filter((r) => r.status === 'respondida');

  const durations = resolved
    .map(responseMinutes)
    .filter((m) => m != null)
    .sort((a, b) => a - b);

  const escalatedLeads = new Set(rows.map((r) => r.lead_id).filter(Boolean));
  const closedLeads = [...escalatedLeads].filter((id) => closedLeadIds.has(id));

  return {
    total: rows.length,
    resolved: resolved.length,
    pending: rows.length - resolved.length,
    response_time: {
      samples: durations.length,
      p50_minutes: percentile(durations, 0.5),
      p95_minutes: percentile(durations, 0.95),
    },
    closure: {
      escalated_leads: escalatedLeads.size,
      closed_leads: closedLeads.length,
      rate: escalatedLeads.size > 0 ? closedLeads.length / escalatedLeads.size : null,
    },
  };
}
