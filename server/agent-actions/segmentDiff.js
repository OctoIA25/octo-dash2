import { normalizePhone } from '../utils/phone.js';

/**
 * Compara dois públicos de leads para diagnóstico do dual-run (ex.: kenlo vs crm/leads).
 *
 * Propósito: identificar sobreposição e divergências entre a lista de contatos que o agente
 * disparou (primaryRows) e o público efetivamente gravado na fonte secundária (secondaryRows),
 * sem vazar telefones completos nas amostras (LGPD).
 *
 * Precedência das chaves de match (por primary):
 *  1. sourceLeadId (chave forte): secondary.sourceLeadId === primary.id
 *     - Ignora null/''/undefined de qualquer lado (nulo não casa com nulo).
 *  2. Telefone normalizado (fallback): normalizePhone(secondary.phone) === normalizePhone(primary.phone)
 *     - Telefone vazio nunca casa.
 *
 * Cada secondary é consumido no máximo uma vez (Set de índices), evitando dupla contagem.
 *
 * @param {Array<{id: string, name: string, phone: string, source: string, sourceLeadId: string|null}>} primaryRows
 * @param {Array<{id: string, name: string, phone: string, source: string, sourceLeadId: string|null}>} secondaryRows
 * @param {{ sampleSize?: number }} [opts]
 * @returns {{
 *   primaryCount: number,
 *   secondaryCount: number,
 *   inBoth: number,
 *   onlyInPrimary: number,
 *   onlyInSecondary: number,
 *   onlyInPrimarySample: Array<{id, name, phone, source}>,
 *   onlyInSecondarySample: Array<{id, name, phone, source}>,
 *   matchedBy: { sourceLeadId: number, phone: number },
 * }}
 */
export function diffPublics(primaryRows, secondaryRows, opts = {}) {
  const { sampleSize = 5 } = opts;

  // --- Índices para lookup eficiente ---

  // sourceLeadId → [índice no secondaryRows, ...]
  // Só indexa valores não-nulos e não-vazios
  const bySourceLeadId = new Map();
  for (let i = 0; i < secondaryRows.length; i++) {
    const slid = secondaryRows[i].sourceLeadId;
    if (slid != null && slid !== '') {
      // Indexa por String para casar com o lookup `String(primary.id)` mesmo se
      // um lado vier como número (robustez de tipo; no banco ambos são texto).
      const key = String(slid);
      if (!bySourceLeadId.has(key)) bySourceLeadId.set(key, []);
      bySourceLeadId.get(key).push(i);
    }
  }

  // normalizePhone(phone) → [índice no secondaryRows, ...]
  // Só indexa quando o telefone normalizado é não-vazio
  const byPhone = new Map();
  for (let i = 0; i < secondaryRows.length; i++) {
    const norm = normalizePhone(secondaryRows[i].phone ?? '');
    if (norm !== '') {
      if (!byPhone.has(norm)) byPhone.set(norm, []);
      byPhone.get(norm).push(i);
    }
  }

  // Set de índices de secondaryRows já consumidos por algum primary
  const consumed = new Set();

  const matchedBy = { sourceLeadId: 0, phone: 0 };
  const onlyInPrimaryRows = [];
  let inBoth = 0;

  // --- Tentar casar cada primary ---
  for (const primary of primaryRows) {
    let matched = false;

    // 1. Chave forte: sourceLeadId
    if (primary.id != null && primary.id !== '') {
      const candidates = bySourceLeadId.get(String(primary.id));
      if (candidates) {
        for (const idx of candidates) {
          if (!consumed.has(idx)) {
            consumed.add(idx);
            inBoth++;
            matchedBy.sourceLeadId++;
            matched = true;
            break;
          }
        }
      }
    }

    // 2. Fallback: telefone normalizado (só se não-vazio)
    if (!matched) {
      const normPrimary = normalizePhone(primary.phone ?? '');
      if (normPrimary !== '') {
        const candidates = byPhone.get(normPrimary);
        if (candidates) {
          for (const idx of candidates) {
            if (!consumed.has(idx)) {
              consumed.add(idx);
              inBoth++;
              matchedBy.phone++;
              matched = true;
              break;
            }
          }
        }
      }
    }

    if (!matched) {
      onlyInPrimaryRows.push(primary);
    }
  }

  // Secondaries não consumidos = only-in-secondary
  const onlyInSecondaryRows = secondaryRows.filter((_, i) => !consumed.has(i));

  return {
    primaryCount: primaryRows.length,
    secondaryCount: secondaryRows.length,
    inBoth,
    onlyInPrimary: onlyInPrimaryRows.length,
    onlyInSecondary: onlyInSecondaryRows.length,
    onlyInPrimarySample: onlyInPrimaryRows.slice(0, sampleSize).map(maskRow),
    onlyInSecondarySample: onlyInSecondaryRows.slice(0, sampleSize).map(maskRow),
    matchedBy,
  };
}

/**
 * Mascara o telefone de uma linha para exibição (mantém apenas os 4 últimos dígitos).
 * Ex.: '11999990000' → '*******0000'. Telefone vazio retorna '****'.
 *
 * @param {{ id, name, phone, source }} row
 * @returns {{ id, name, phone, source }}
 */
function maskRow(row) {
  const norm = normalizePhone(row.phone ?? '');
  let maskedPhone;
  if (norm === '') {
    maskedPhone = '****';
  } else if (norm.length <= 4) {
    maskedPhone = norm; // muito curto para mascarar — mantém como está
  } else {
    maskedPhone = '*'.repeat(norm.length - 4) + norm.slice(-4);
  }
  return { id: row.id, name: row.name, phone: maskedPhone, source: row.source };
}
