/**
 * Serviço para dados de relatórios em tempo real
 * Substitui dados mockados por dados reais do banco
 */

import { supabase } from '@/lib/supabaseClient';
import { canonicalizeFonteCounts } from '@/data/realLeadsProcessor';
import {
  buscarVendasAssinadas as buscarVendasAssinadasProposals,
  agruparPorCorretor,
  somarVendas,
  normalizarNome,
  type VendaAssinada,
} from '@/features/metricas/services/vendasAssinadasService';

const UUID_AGENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Filtro por `assigned_agent_id` (UUID) ou `assigned_agent_name` (ex.: ranking por nome). */
export function isAgentKeyUuid(agentKey: string): boolean {
  return UUID_AGENT_RE.test(agentKey.trim());
}

function applyAssignedAgentFilter<T extends { eq: (c: string, v: string) => T }>(
  query: T,
  agentKey: string
): T {
  const key = agentKey.trim();
  if (!key) return query;
  if (isAgentKeyUuid(key)) return query.eq('assigned_agent_id', key);
  return query.eq('assigned_agent_name', key);
}

function toDayStartIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00.000Z`;
}

function toDayEndIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59.999Z`;
}

/** Dias do período (inclusivo). Mínimo 1 para nunca dividir por zero. */
function diasNoPeriodo(inicio: string, fim: string): number {
  const de = new Date(toDayStartIso(inicio)).getTime();
  const ate = new Date(toDayEndIso(fim)).getTime();
  const dias = Math.round((ate - de) / (1000 * 60 * 60 * 24));
  return Math.max(1, dias);
}

// Types (definidos inline para evitar dependência de Database)
interface RelatorioVenda {
  id: string;
  tenant_id: string;
  corretor_id?: string;
  imovel_id?: string;
  lead_id?: string;
  codigo_imovel?: string;
  tipo_negocio?: string;
  valor_imovel?: number;
  valor_comissao?: number;
  percentual_comissao?: number;
  exclusividade?: boolean;
  status?: string;
  fonte_negocio?: string;
  data_transacao?: string;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

interface RelatorioCorretorMetric {
  id: string;
  tenant_id: string;
  corretor_id: string;
  ano: number;
  mes: number;
  vendas_criadas?: number;
  vendas_assinadas?: number;
  valor_total_vendas?: number;
  total_leads_recebidos?: number;
  total_leads_interagidos?: number;
  taxa_interacao?: number;
  tempo_medio_resposta?: number;
  visitas_realizadas?: number;
  taxa_conversao_visitas?: number;
  taxa_conversao_vendas?: number;
  imoveis_ativos?: number;
  imoveis_exclusivos?: number;
  imoveis_ficha?: number;
  gestao_ativa?: number;
  participacao_treinamentos?: number;
  meta_vendas?: number;
  meta_comissao?: number;
  percentual_atingimento_meta?: number;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

interface RelatorioTeamMetric {
  id: string;
  tenant_id: string;
  equipe_id?: string;
  nome_equipe?: string;
  ano: number;
  mes: number;
  total_corretores?: number;
  vendas_criadas?: number;
  vendas_assinadas?: number;
  valor_total_vendas?: number;
  total_leads_recebidos?: number;
  total_leads_interagidos?: number;
  taxa_interacao_geral?: number;
  tempo_medio_resposta_equipe?: number;
  imoveis_ativos?: number;
  imoveis_exclusivos?: number;
  taxa_conversao_visitas?: number;
  taxa_conversao_vendas?: number;
  imoveis_ativados_mes?: number;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

// Interfaces para dados de relatórios
export interface VendasPorFonte {
  fonte: string;
  quantidade: number;
}

export interface VendasPorFaixa {
  mes: string;
  ate_500k: number;
  de_500k_999k: number;
  acima_1m: number;
}

export interface LeadsPorBairro {
  bairro: string;
  quantidade: number;
}

export interface MetricasIndividuais {
  corretor: string;
  valorComissao: number;
  vendasFeitas: number;
  gestaoAtiva: number;
  ranking: number;
  fotoUrl?: string;
}

export interface KPIsGerais {
  totalLeadsRecebidos: number;
  totalLeadsInteragidos: number;
  /** Leads recebidos por dia no período — contagem, não percentual. */
  mediaLeadsDia: number;
  mediaTempoPrimeiraInteracao: number;
  totalLeadsConvertidos: number;
  /** Propostas assinadas no período (`proposals`), não leads com valor preenchido. */
  vendasAssinadas: number;
  /** Valor Geral de Vendas do período. */
  vgv: number;
  /** Comissão: override de `commission_total` ou a derivação 3,5%/6% do forecast. */
  vgc: number;
  ticketMedio: number;
}

export interface MetricasIndividuaisLeads {
  totalLeads: number;
  leadsRecebidos: number;
  /** Leads com `visit_date` preenchido — o fato da visita, não a etapa atual. */
  visitas: number;
  /** Tempo médio de 1ª resposta DESTE corretor, em minutos. */
  tempoMedioRespostaMin: number;
  porFonte: Array<{ label: string; value: number }>;
  porImovel: Array<{ label: string; value: number }>;
}

export interface MetricasIndividuaisVendas {
  vendasTotal: number;
  vendasExclusivas: number;
  vendasNaoExclusivas: number;
  vgvTotal: number;
  /** Comissão real das propostas assinadas (`proposals`), nunca o valor do imóvel. */
  comissaoTotal: number;
  ticketMedio: number;
  rows: Array<{
    id: string;
    codigo_imovel: string;
    exclusividade: string;
    fonte: string;
    valor_imovel: number;
    comissao: number;
    data: string;
  }>;
  fonteBreakdown: Array<{ fonte: string; quantidade: number }>;
}

// Funções para buscar dados reais

// Amostra do tempo de resposta: os leads respondidos MAIS RECENTES. A média de
// tempo de primeira resposta não tem como sair de uma COUNT, e o PostgREST corta
// em 1000 de qualquer jeito — então a janela é explícita e recente, em vez de um
// pedaço arbitrário do começo da tabela.
const AMOSTRA_TEMPO_RESPOSTA = 1000;

/** Lote do `.in()` de leads — mesmo limite usado em vendasAssinadasService. */
const LEADS_BATCH = 200;

/**
 * KPIs gerais do período. Todas as leituras respeitam `inicio`/`fim` — o filtro de
 * data da tela é o mesmo que o PDF exportado anuncia no subtítulo; antes os cards
 * eram sempre o acumulado do tenant e o "Período: X a Y" do relatório era falso.
 *
 * `totalLeadsConvertidos` NÃO sai de `leads.final_sale_value`: essa coluna está
 * vazia em produção e a venda de verdade mora em `proposals` (stage
 * `proposta-assinada`) desde o corte de 01/09/2026. Contamos aqui os leads
 * distintos com proposta assinada no período — o mesmo número que o card de
 * vendas mostra, sem os dois valores se contradizerem na mesma tela.
 */
export async function buscarKPIsGerais(
  tenantId: string,
  inicio: string,
  fim: string,
): Promise<KPIsGerais> {
  const de = toDayStartIso(inicio);
  const ate = toDayEndIso(fim);

  const noPeriodo = () =>
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', de)
      .lte('created_at', ate);

  // As quatro leituras são independentes → uma rodada só.
  // Antes isto era um `select('*')` de TODOS os leads com os filtros feitos em JS,
  // sobre duas colunas que não existem na tabela (`first_interaction_at` e
  // `etapa_atual`): o filtro nunca casava e três destes KPIs eram zero fixo. A
  // coluna real de resposta é `first_response_at`.
  const [recebidos, interagidos, amostraResposta, vendas] = await Promise.all([
    noPeriodo(),
    noPeriodo().not('first_response_at', 'is', null),
    supabase
      .from('leads')
      .select('created_at, first_response_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', de)
      .lte('created_at', ate)
      .not('first_response_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(AMOSTRA_TEMPO_RESPOSTA),
    buscarVendasAssinadasProposals(tenantId, inicio, fim),
  ]);

  const primeiroErro = [recebidos, interagidos, amostraResposta].find(r => r.error)?.error;
  if (primeiroErro) throw primeiroErro;

  const temposResposta = (amostraResposta.data || [])
    .map(l => {
      if (!l.created_at || !l.first_response_at) return 0;
      const diff = new Date(l.first_response_at).getTime() - new Date(l.created_at).getTime();
      return Math.floor(diff / (1000 * 60)); // minutos
    })
    .filter(t => t > 0);

  const mediaTempoPrimeiraInteracao = temposResposta.length > 0
    ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
    : 0;

  const leadsConvertidos = new Set(
    vendas.map(venda => venda.leadId).filter((id): id is string => Boolean(id)),
  ).size;
  const totais = somarVendas(vendas);

  return {
    totalLeadsRecebidos: recebidos.count ?? 0,
    totalLeadsInteragidos: interagidos.count ?? 0,
    mediaLeadsDia: Math.round(((recebidos.count ?? 0) / diasNoPeriodo(inicio, fim)) * 10) / 10,
    mediaTempoPrimeiraInteracao,
    totalLeadsConvertidos: leadsConvertidos,
    vendasAssinadas: totais.vendas,
    vgv: totais.vgv,
    vgc: totais.vgc,
    ticketMedio: totais.vendas > 0 ? totais.vgv / totais.vendas : 0,
  };
}

export async function buscarRankingCorretores(
  tenantId: string,
  ano: number,
  mes: number,
  periodo: 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
): Promise<MetricasIndividuais[]> {
  let startMonth = mes;
  let endMonth = mes;
  const startYear = ano;
  const endYear = ano;

  if (periodo === 'quarterly') {
    startMonth = ((mes - 1) / 3) * 3 + 1;
    endMonth = startMonth + 2;
  } else if (periodo === 'semiannual') {
    startMonth = mes <= 6 ? 1 : 7;
    endMonth = mes <= 6 ? 6 : 12;
  } else if (periodo === 'yearly') {
    startMonth = 1;
    endMonth = 12;
  }

  // Buscar dados diretos da tabela leads em vez de corretor_metrics
  const { data: leads, error } = await supabase
    .from('leads')
    .select('assigned_agent_name, created_at, final_sale_value')
    .eq('tenant_id', tenantId)
    // .gte('created_at', `${startYear}-${String(startMonth - 1).padStart(2, '0')}-01`)
    // .lt('created_at', `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`);

  if (error) throw error;

  // Agregar dados por corretor
  const aggregated = new Map<string, {
    valorComissao: number;
    vendasFeitas: number;
    gestaoAtiva: number;
    fotoUrl?: string;
  }>();

  leads?.forEach(lead => {
    const key = lead.assigned_agent_name;
    if (!key) return;

    const existing = aggregated.get(key) || {
      valorComissao: 0,
      vendasFeitas: 0,
      gestaoAtiva: 0,
      fotoUrl: undefined
    };

    aggregated.set(key, {
      valorComissao: existing.valorComissao + (lead.final_sale_value || 0),
      vendasFeitas: existing.vendasFeitas + (lead.final_sale_value ? 1 : 0),
      gestaoAtiva: existing.gestaoAtiva + 1,
      fotoUrl: existing.fotoUrl
    });
  });

  // Converter para array e ordenar
  const ranking = Array.from(aggregated.entries())
    .map(([corretorId, data]) => ({
      corretor: corretorId,
      ...data
    }))
    .sort((a, b) => b.valorComissao - a.valorComissao)
    .map((item, index) => ({
      ...item,
      ranking: index + 1,
      fotoUrl: item.fotoUrl || `/avatars/${item.corretor.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`
    }));

  return ranking;
}

/** Página do PostgREST. Sem o laço, toda leitura empaca em 1000 linhas sem erro. */
const PAGE_SIZE = 1000;

/**
 * Métricas de leads do corretor no período.
 *
 * Reescrita porque a versão anterior filtrava `etapa_atual` e agrupava por
 * `bairro` — nenhuma das duas colunas existe em `leads` (o optional chaining
 * engolia em silêncio, e "Visitas", "Vendas" e o gráfico de bairro eram zero
 * fixo para todo corretor). O que existe e diz a mesma coisa: `visit_date`
 * (o fato da visita) e `source` / `property_code`.
 */
export async function buscarMetricasIndividuaisLeads(
  tenantId: string,
  corretorId: string,
  dataInicial: string,
  dataFinal: string
): Promise<MetricasIndividuaisLeads> {
  const di = toDayStartIso(dataInicial);
  const df = toDayEndIso(dataFinal);

  const leads: Array<{
    source: string | null;
    property_code: string | null;
    visit_date: string | null;
    created_at: string | null;
    first_response_at: string | null;
  }> = [];
  for (let page = 0; ; page += 1) {
    let query = supabase
      .from('leads')
      .select('source, property_code, visit_date, created_at, first_response_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', di)
      .lte('created_at', df)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    query = applyAssignedAgentFilter(query, corretorId);

    const { data, error } = await query;
    if (error) throw error;

    const linhas = (data ?? []) as typeof leads;
    leads.push(...linhas);
    if (linhas.length < PAGE_SIZE) break;
  }

  const totalLeads = leads.length;
  const visitas = leads.filter(l => Boolean(l.visit_date)).length;

  // Tempo de resposta DO CORRETOR. Antes a tela mostrava a média do tenant
  // inteiro dentro do painel individual — número certo, dono errado.
  const tempos = leads
    .filter(l => l.created_at && l.first_response_at)
    .map(l => Math.floor(
      (new Date(l.first_response_at as string).getTime() - new Date(l.created_at as string).getTime()) / (1000 * 60)
    ))
    .filter(t => t > 0);
  const tempoMedioRespostaMin = tempos.length > 0
    ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
    : 0;

  const fontesCount = canonicalizeFonteCounts(
    leads.map(lead => lead.source || 'Não informado')
  );

  const porFonte = Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ label: fonte, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const imoveisCount = new Map<string, number>();
  leads.forEach(lead => {
    const imovel = lead.property_code || 'Não informado';
    imoveisCount.set(imovel, (imoveisCount.get(imovel) || 0) + 1);
  });

  const porImovel = Array.from(imoveisCount.entries())
    .map(([imovel, quantidade]) => ({ label: imovel, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return {
    totalLeads,
    leadsRecebidos: totalLeads,
    visitas,
    tempoMedioRespostaMin,
    porFonte,
    porImovel
  };
}

/** Vendas do corretor no período — a chave é o UUID quando há, senão o nome. */
function vendaEhDoCorretor(venda: VendaAssinada, corretorId: string): boolean {
  const chave = corretorId.trim();
  if (!chave) return true;
  if (isAgentKeyUuid(chave)) return venda.agentUserId === chave;
  return normalizarNome(venda.agentNome) === normalizarNome(chave);
}

/**
 * Vendas e comissão do corretor.
 *
 * A fonte é `proposals` (stage `proposta-assinada`), a mesma do VGV/VGC da dash
 * desde o corte de 01/09/2026 — antes isto lia `leads.final_sale_value`, coluna
 * vazia em produção, e devolvia comissão = valor do imóvel.
 */
export async function buscarMetricasIndividuaisVendas(
  tenantId: string,
  corretorId: string,
  dataInicial: string,
  dataFinal: string
): Promise<MetricasIndividuaisVendas> {
  const todas = await buscarVendasAssinadasProposals(tenantId, dataInicial, dataFinal);
  const vendas = todas.filter(venda => vendaEhDoCorretor(venda, corretorId));

  // Exclusividade, código e fonte moram no lead, não na proposta.
  const leadIds = [...new Set(vendas.map(v => v.leadId).filter((id): id is string => Boolean(id)))];
  const dadosLead = new Map<string, { is_exclusive: boolean | null; property_code: string | null; source: string | null }>();

  for (let i = 0; i < leadIds.length; i += LEADS_BATCH) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, is_exclusive, property_code, source')
      .in('id', leadIds.slice(i, i + LEADS_BATCH));

    if (error) {
      console.warn('[metricasIndividuais] dados do lead indisponíveis:', error.message);
      break;
    }
    for (const lead of (data ?? []) as Array<{ id: string } & { is_exclusive: boolean | null; property_code: string | null; source: string | null }>) {
      dadosLead.set(lead.id, lead);
    }
  }

  const totais = somarVendas(vendas);
  const vendasExclusivas = vendas.filter(
    v => v.leadId && dadosLead.get(v.leadId)?.is_exclusive === true
  ).length;

  const rows = vendas.map(venda => {
    const lead = venda.leadId ? dadosLead.get(venda.leadId) : undefined;
    return {
      id: venda.id,
      codigo_imovel: lead?.property_code || '',
      exclusividade: lead?.is_exclusive ? 'exclusivo' : 'não exclusivo',
      fonte: lead?.source || 'Não informado',
      valor_imovel: venda.vgv,
      comissao: venda.vgc,
      data: venda.dataAssinatura,
    };
  });

  const fontesCount = canonicalizeFonteCounts(
    rows.map(row => row.fonte)
  );

  const fonteBreakdown = Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    vendasTotal: totais.vendas,
    vendasExclusivas,
    vendasNaoExclusivas: totais.vendas - vendasExclusivas,
    vgvTotal: totais.vgv,
    comissaoTotal: totais.vgc,
    ticketMedio: totais.vendas > 0 ? totais.vgv / totais.vendas : 0,
    rows,
    fonteBreakdown
  };
}

export async function buscarVendasPorFonte(tenantId: string): Promise<VendasPorFonte[]> {
  const { data: vendas, error } = await supabase
    .from('leads')
    .select('source')
    .eq('tenant_id', tenantId)
    .not('final_sale_value', 'is', null);

  if (error) throw error;

  const fontesCount = canonicalizeFonteCounts(
    (vendas ?? []).map(venda => venda.source || 'Não informado')
  );

  return Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export async function buscarVendasPorFaixa(
  tenantId: string,
  meses: number = 12
): Promise<VendasPorFaixa[]> {
  const { data: vendas, error } = await supabase
    .from('leads')
    .select('final_sale_value, created_at')
    .eq('tenant_id', tenantId)
    .not('final_sale_value', 'is', null)
    .gte('created_at', new Date(Date.now() - meses * 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Agrupar por mês e faixa de valor
  const mesesData = new Map<string, {
    ate_500k: number;
    de_500k_999k: number;
    acima_1m: number;
  }>();

  vendas?.forEach(venda => {
    if (!venda.created_at || !venda.final_sale_value) return;

    const mes = new Date(venda.created_at).toLocaleDateString('pt-BR', { month: 'short' });
    const valor = venda.final_sale_value;

    if (!mesesData.has(mes)) {
      mesesData.set(mes, { ate_500k: 0, de_500k_999k: 0, acima_1m: 0 });
    }

    const data = mesesData.get(mes)!;
    if (valor <= 500000) {
      data.ate_500k++;
    } else if (valor <= 999999) {
      data.de_500k_999k++;
    } else {
      data.acima_1m++;
    }
  });

  return Array.from(mesesData.entries())
    .map(([mes, data]) => ({ mes, ...data }));
}
