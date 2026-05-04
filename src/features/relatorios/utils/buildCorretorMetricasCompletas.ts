import type { CorretorMetricasCompletas } from '@/types/metricsTypes';
import type { MetricasIndividuaisLeads, MetricasIndividuaisVendas } from '../services/relatoriosService';

export function slugCorretorId(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'corretor'
  );
}

export function buildCorretorMetricasCompletas(params: {
  nomeCorretor: string;
  rankingPosicao: number;
  equipe?: string;
  leads: MetricasIndividuaisLeads | null;
  vendas: MetricasIndividuaisVendas | null;
  gestaoAtivaRanking: number;
  tempoMedioRespostaMin?: number;
}): CorretorMetricasCompletas {
  const {
    nomeCorretor,
    rankingPosicao,
    equipe = '—',
    leads,
    vendas,
    gestaoAtivaRanking,
    tempoMedioRespostaMin = 0,
  } = params;

  const lr = leads?.leadsRecebidos ?? 0;
  const visitas = leads?.visitas ?? 0;
  const vendasFunil = leads?.vendasRealizadas ?? 0;
  const vendasPorNegocio = vendas?.vendasTotal ?? 0;
  const vendasRealizadas = Math.max(vendasFunil, vendasPorNegocio);

  const taxaVisitas = lr > 0 ? Math.round((visitas / lr) * 1000) / 10 : 0;
  const taxaVendas =
    visitas > 0
      ? Math.round((vendasRealizadas / visitas) * 1000) / 10
      : lr > 0
        ? Math.round((vendasRealizadas / lr) * 1000) / 10
        : 0;

  const comissao = vendas?.comissaoTotal ?? 0;
  const metaComissao = Math.max(Math.round(comissao * 1.35), 360000);
  const pctMeta = metaComissao > 0 ? Math.min(100, Math.round((comissao / metaComissao) * 100)) : 0;

  return {
    id: slugCorretorId(nomeCorretor),
    nome: nomeCorretor,
    ranking: Math.max(1, rankingPosicao || 1),
    equipe,
    kpis: {
      vendasFeitas: vendas?.vendasTotal ?? 0,
      comissaoTotal: comissao,
      gestaoAtiva: gestaoAtivaRanking,
      percentualAtingimentoMeta: pctMeta,
      tempoMedioResposta: tempoMedioRespostaMin,
    },
    funil: {
      leadsRecebidos: lr,
      visitasRealizadas: visitas,
      taxaConversaoVisitas: taxaVisitas,
      vendasRealizadas,
      taxaConversaoVendas: taxaVendas,
    },
    portfolio: {
      imoveisFicha: gestaoAtivaRanking || lr,
      imoveisExclusivos: vendas?.vendasExclusivas ?? 0,
    },
    leadsPorFonte: (leads?.porFonte ?? []).map((x) => ({
      fonte: x.label,
      quantidade: x.value,
    })),
    evolucaoLeads:
      lr > 0
        ? [{ mes: 'Período', quantidade: lr }]
        : [{ mes: 'Período', quantidade: 0 }],
    participacaoTreinamentos: 0,
  };
}
