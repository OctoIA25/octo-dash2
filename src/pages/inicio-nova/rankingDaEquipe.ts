/**
 * O card "Ranking da Equipe" do Início.
 *
 * Soma por PESSOA (o dono do lead), com o nome do cadastro. Até 01/10 somava
 * pelo nome escrito no lead: a Lia entrava (é dona de todo lead novo desde
 * 17/09), "Não atribuído" entrava, e a mesma corretora aparecia uma vez por
 * grafia. Lead cujo dono não está em `pessoas` não conta — é o lead sem dono,
 * o da Lia, o da conta de teste.
 */
import type { ProcessedLead } from '@/data/realLeadsProcessor';
import type { PessoasDaCasa } from '@/features/corretores/services/pessoasDaCasaService';

export interface RankingItem {
  name: string;
  closings: number;
  volume: number;
}

export function rankingDaEquipe(
  leads: Pick<ProcessedLead, 'assigned_agent_id' | 'etapa_atual' | 'valor_final_venda' | 'valor_imovel'>[],
  pessoas: PessoasDaCasa,
): RankingItem[] {
  const porPessoa = new Map<string, RankingItem>();
  for (const l of leads) {
    const nome = l.assigned_agent_id ? pessoas.get(l.assigned_agent_id) : undefined;
    if (!nome) continue;
    const item = porPessoa.get(l.assigned_agent_id!) ?? { name: nome, closings: 0, volume: 0 };
    const etapa = (l.etapa_atual || '').toLowerCase();
    if (etapa.includes('assinad') || etapa.includes('fechad')) {
      item.closings += 1;
      item.volume += l.valor_final_venda || l.valor_imovel || 0;
    }
    porPessoa.set(l.assigned_agent_id!, item);
  }
  return [...porPessoa.values()].sort(
    (a, b) => b.volume - a.volume || b.closings - a.closings || a.name.localeCompare(b.name, 'pt-BR'),
  );
}
