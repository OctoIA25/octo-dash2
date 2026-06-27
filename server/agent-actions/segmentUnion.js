/**
 * União deduplicada de dois públicos já resolvidos (leads CRM + kenlo_leads).
 *
 * Dedup por TELEFONE normalizado (única chave, por decisão de design). Usa a
 * MESMA `normalizePhone` que `diffPublics` (server/utils/phone.js) para que a
 * noção de "mesmo contato" seja consistente em todo o módulo.
 *
 * Precedência: a linha do CRM (`leads`) vence o empate — tem nome/corretor/
 * source_lead_id mais ricos para variáveis de template. A kenlo correspondente
 * é descartada (NÃO é um segundo envio).
 *
 * Telefone vazio nunca casa (não há para onde enviar): linhas sem telefone
 * entram na união e são removidas depois pela camada de elegibilidade
 * (no_whatsapp). Puro, sem rede — testável direto.
 */
import { normalizePhone } from '../utils/phone.js';

export function mergeUnionByPhone(leadsRows = [], kenloRows = []) {
  // Índice dos telefones já cobertos pelo CRM (ignora vazio — vazio não casa).
  const crmPhones = new Set();
  for (const r of leadsRows) {
    const p = normalizePhone(r.phone ?? '');
    if (p !== '') crmPhones.add(p);
  }

  // CRM tem precedência: começa com todas as linhas do CRM.
  const out = [...leadsRows];

  // Adiciona kenlo só quando o telefone não está coberto pelo CRM.
  // Telefone vazio (normaliza p/ '') nunca está no Set → sempre entra.
  for (const r of kenloRows) {
    const p = normalizePhone(r.phone ?? '');
    if (p === '' || !crmPhones.has(p)) out.push(r);
  }

  return out;
}
