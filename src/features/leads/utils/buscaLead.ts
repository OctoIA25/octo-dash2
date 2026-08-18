import type { KanbanLead } from '../services/leadsService';

/**
 * Casa o termo de busca contra nome, telefone, e-mail e tags do lead.
 * Substring simples, case-insensitive — os leads já estão todos em memória.
 * ponytail: sem normalização de acento nem de máscara de telefone; adicionar
 * se aparecer reclamação de "busquei 'João' e não achou".
 */
export function leadCasaBusca(lead: KanbanLead, termo: string): boolean {
  if (!termo) return true;
  return [lead.nomedolead, lead.lead, lead.email, ...(lead.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(termo);
}
