/**
 * Mapeia proposta + lead → uma linha da planilha de forecast.
 *
 * Função pura: quem chama já resolveu o RLS (a leitura de `proposals` devolve
 * só o que o usuário pode ver) e já juntou o lead. Aqui não há filtro por
 * corretor — filtrar no front seria uma segunda fonte de verdade discordando
 * do banco.
 */

import {
  calcularComissaoForecast,
  isLancamento,
  type Comissao,
  type LeadClassification,
} from './comissao';

/** Colunas de `proposals` que a planilha lê. Subconjunto de `SavedProposal`. */
export interface ForecastProposalRow {
  id: string;
  lead_id: string | null;
  /** Etapa do funil — é o que define em qual coluna o card cai. */
  stage_id: string;
  agent_name: string | null;
  property_reference: string | null;
  value: number | string | null;
  forecast_empreendimento: string | null;
  forecast_unidade: string | null;
  forecast_previsao: string | null;
  forecast_estado: string | null;
  updated_at: string;
  /** Nome do comprador — fallback quando o lead não veio (proposta avulsa). */
  parties?: Array<{ party_type: string; full_name: string | null }> | null;
}

/** Colunas de `leads` que a planilha lê. */
export interface ForecastLeadRow {
  id: string;
  name: string | null;
  assigned_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  classification: LeadClassification;
}

export interface ForecastRow {
  proposalId: string;
  /** Lead espelhado, ou null em proposta avulsa. O seletor de "colocar lead" usa para não oferecer quem já está na planilha. */
  leadId: string | null;
  /** Etapa do funil (`proposals.stage_id`) — define a coluna do card. */
  stageId: string;
  corretor: string;
  lead: string;
  empreendimento: string;
  unidade: string;
  valor: number;
  comissao: Comissao;
  /** ISO ou null. Início do atendimento. */
  dataAtendimento: string | null;
  /**
   * ISO ou null. É o `updated_at` do lead — não existe tabela de interações,
   * então qualquer edição do lead move esta data, não só atendimento de fato.
   * Limitação registrada na spec.
   */
  ultimoAtendimento: string | null;
  /** 'YYYY-MM-DD' ou null. Nasce vazia por decisão de design. */
  previsaoFechamento: string | null;
  /** Nasce vazio por decisão de design. */
  estadoAtual: string;
}

const texto = (valor: string | null | undefined): string => (valor ?? '').trim();

const numero = (valor: number | string | null | undefined): number => {
  const bruto = typeof valor === 'string' ? Number(valor) : valor;
  return Number.isFinite(bruto) && (bruto as number) > 0 ? (bruto as number) : 0;
};

/**
 * Nome do lead. `leads.name` é a fonte; o comprador em `proposal_parties` só
 * entra quando a proposta não tem lead vinculado (source draft/manual).
 */
function nomeDoLead(proposta: ForecastProposalRow, lead: ForecastLeadRow | null): string {
  const doLead = texto(lead?.name);
  if (doLead) return doLead;

  const comprador = (proposta.parties || []).find((p) => p.party_type === 'comprador');
  return texto(comprador?.full_name);
}

/**
 * Empreendimento e unidade são texto livre digitado na planilha. Enquanto
 * ninguém digitou, o código do imóvel serve de valor inicial — é o que a
 * planilha manual fazia para terceiros ("replica esse valor" nas duas colunas).
 *
 * Em lançamento não há o que pré-preencher: o código do imóvel não é o nome do
 * empreendimento, e chutá-lo ali seria pior que deixar em branco.
 */
function prefill(
  gravado: string | null,
  propertyReference: string | null,
  ehLancamento: boolean,
): string {
  const valor = texto(gravado);
  if (valor) return valor;
  return ehLancamento ? '' : texto(propertyReference);
}

export function toForecastRow(
  proposta: ForecastProposalRow,
  lead: ForecastLeadRow | null,
): ForecastRow {
  const ehLancamento = isLancamento(lead?.classification);
  const comissao = calcularComissaoForecast(proposta.value, lead?.classification);

  return {
    proposalId: proposta.id,
    leadId: proposta.lead_id,
    stageId: proposta.stage_id,
    corretor: texto(proposta.agent_name),
    lead: nomeDoLead(proposta, lead),
    empreendimento: prefill(
      proposta.forecast_empreendimento,
      proposta.property_reference,
      ehLancamento,
    ),
    unidade: prefill(proposta.forecast_unidade, proposta.property_reference, ehLancamento),
    valor: numero(proposta.value),
    comissao,
    // assigned_at é quando o lead caiu para o corretor. Lead importado antes da
    // roleta pode não ter — aí created_at é a melhor aproximação do início.
    dataAtendimento: lead?.assigned_at || lead?.created_at || null,
    ultimoAtendimento: lead?.updated_at || null,
    previsaoFechamento: proposta.forecast_previsao || null,
    estadoAtual: texto(proposta.forecast_estado),
  };
}

/** Totais do rodapé — é o número que o gestor olha primeiro. */
export function somarForecast(linhas: ForecastRow[]): { valor: number; comissao: number } {
  return linhas.reduce(
    (acc, linha) => ({
      valor: acc.valor + linha.valor,
      comissao: acc.comissao + linha.comissao.valor,
    }),
    { valor: 0, comissao: 0 },
  );
}
