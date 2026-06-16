/**
 * Agregação do RELATÓRIO DE FUNIL POR UNIDADE.
 *
 * Reaproveita integralmente:
 *  - as regras de etapas do funil (`computeFunnelStages` de
 *    `@/features/leads/utils/funnelStages`) — mesmas etapas/contagens dos
 *    relatórios atuais, sem duplicar regra de negócio;
 *  - a classificação de tipo de imóvel (`classifyUnidade`).
 *
 * Resultado: para cada categoria de unidade com ao menos 1 lead, o conjunto de
 * leads correspondente e o funil calculado sobre esse subconjunto.
 */

import { ProcessedLead } from '@/data/realLeadsProcessor';
import {
  computeFunnelStages,
  FunnelStages,
  FunnelSubSection,
} from '@/features/leads/utils/funnelStages';
import {
  classifyUnidade,
  ImovelTipoInfo,
  UNIDADE_CATEGORIES,
  UnidadeCategoria,
} from './unidadeClassifier';

export interface FunilUnidadeGrupo {
  categoria: UnidadeCategoria;
  total: number;
  leads: ProcessedLead[];
  funnel: FunnelStages;
}

/**
 * Agrupa os leads por categoria de unidade, preservando a ordem canônica e
 * omitindo categorias sem leads.
 */
export function groupLeadsByUnidade(
  leads: ProcessedLead[],
  tipoMap: Map<string, ImovelTipoInfo>
): Map<UnidadeCategoria, ProcessedLead[]> {
  // Inicializa na ordem canônica para saída determinística.
  const grupos = new Map<UnidadeCategoria, ProcessedLead[]>();
  for (const cat of UNIDADE_CATEGORIES) grupos.set(cat, []);

  for (const lead of leads || []) {
    const categoria = classifyUnidade(lead, tipoMap);
    grupos.get(categoria)!.push(lead);
  }

  // Remove categorias vazias mantendo a ordem.
  for (const [cat, arr] of grupos) {
    if (arr.length === 0) grupos.delete(cat);
  }

  return grupos;
}

/**
 * Constrói o relatório completo: lista de grupos (categoria + funil) na ordem
 * canônica, apenas para categorias com leads.
 */
export function buildFunilPorUnidade(
  leads: ProcessedLead[],
  tipoMap: Map<string, ImovelTipoInfo>,
  subSection: FunnelSubSection = 'geral'
): FunilUnidadeGrupo[] {
  const grupos = groupLeadsByUnidade(leads, tipoMap);

  const resultado: FunilUnidadeGrupo[] = [];
  for (const [categoria, leadsDaCategoria] of grupos) {
    resultado.push({
      categoria,
      total: leadsDaCategoria.length,
      leads: leadsDaCategoria,
      funnel: computeFunnelStages(leadsDaCategoria, subSection),
    });
  }
  return resultado;
}
