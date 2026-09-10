import type { KanbanLead } from '../services/leadsService';
import { origemChannelKey } from '@/features/relatorios/utils/canalClassifier';

/**
 * Canal do lead = de onde ele veio (ZAP, VivaReal, Imovelweb, Site, Meta...).
 * Mora em `portal`, que o leadsService achata a partir de `kenlo_leads.portal` e
 * de `leads.source` — por isso é sempre daí que se lê, nunca de uma das duas.
 */
const canalDoLead = (lead: KanbanLead): string =>
  String((lead as unknown as Record<string, unknown>).portal ?? '').trim();

/** Sentinela do filtro — o Radix Select não aceita item com value vazio. */
export const SEM_CANAL = '__sem_canal__';

/** Valor "não filtrar", igual aos demais filtros da barra. */
export const TODOS_CANAIS = 'todos';

export interface OpcoesCanal {
  /** [chave normalizada, rótulo exibido], em ordem alfabética. */
  opcoes: Array<[string, string]>;
  /** Há leads sem canal preenchido (merece a opção "Sem canal"). */
  temSemCanal: boolean;
}

/**
 * Opções do filtro a partir dos leads já carregados — não existe lista fixa de
 * portais: cada tenant recebe de um conjunto diferente, e ele muda sozinho
 * quando uma integração nova entra.
 *
 * Dedup pela chave normalizada de Relatórios (trim + minúsculas), exibindo o
 * primeiro rótulo visto: "ZAP Imóveis" e "zap imoveis" viram uma opção só.
 */
export function canaisDosLeads(leads: KanbanLead[]): OpcoesCanal {
  const porChave = new Map<string, string>();
  let temSemCanal = false;

  for (const lead of leads) {
    const bruto = canalDoLead(lead);
    if (!bruto) {
      temSemCanal = true;
      continue;
    }
    const chave = origemChannelKey(bruto);
    if (!porChave.has(chave)) porChave.set(chave, bruto);
  }

  return {
    opcoes: [...porChave.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
    temSemCanal,
  };
}

/** `filtro` é 'todos', SEM_CANAL, ou a chave normalizada de um canal. */
export function leadCasaCanal(lead: KanbanLead, filtro: string): boolean {
  if (filtro === TODOS_CANAIS) return true;
  const chave = origemChannelKey(canalDoLead(lead));
  return filtro === SEM_CANAL ? chave === '' : chave === filtro;
}
