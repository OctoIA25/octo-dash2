/**
 * Vendas assinadas — fonte única de VGV/VGC da dash.
 *
 * Nasce de `proposals` no estágio `proposta-assinada`, que desde o backfill de
 * 01/09/2026 (`scripts/backfill-proposals-from-commercial-sales.mjs`) contém as
 * 37 vendas históricas da planilha REPORT **e** toda venda nova do funil.
 * `commercial_sales` ficou congelada quando o sync horário da planilha foi
 * desligado: ler dela hoje é ler um retrato de 01/09 que nunca mais se mexe.
 *
 * Dois ganhos vêm de graça ao trocar a origem:
 * - venda assinada no funil entra no VGV/VGC no mesmo dia;
 * - o corretor é `agent_user_id`, não o apelido digitado na planilha — some a
 *   duplicação "Fernanda" × "Fernanda Souza" no ranking.
 *
 * RLS: `proposals` restringe corretor às próprias propostas (policy
 * "Tenant members can view proposals"), então gestor/owner soma o tenant e
 * corretor soma o que é dele. É a mesma regra que o funil e o forecast já usam.
 */
import { supabase } from '@/lib/supabaseClient';
import { calcularComissaoForecast, type LeadClassification } from '@/features/forecast/utils/comissao';

const PAGE_SIZE = 1000;
const LEADS_BATCH = 200;
const FUSO = 'America/Sao_Paulo';

export interface VendaAssinada {
  id: string;
  /** Lead de origem — permite contar leads convertidos sem reabrir `proposals`. */
  leadId: string | null;
  agentUserId: string | null;
  /** Nome como veio da proposta; vazio quando a venda não tem corretor. */
  agentNome: string;
  /** `proposals.value` — o valor do negócio. */
  vgv: number;
  /** Override `commission_total` quando > 0; senão 3,5% (lançamento) ou 6%. */
  vgc: number;
  /** Data de assinatura em America/Sao_Paulo, 'YYYY-MM-DD'. */
  dataAssinatura: string;
  /** 1..12, no mesmo fuso — o mês que o gestor enxerga. */
  mes: number;
  ano: number;
}

interface PropostaAssinadaRow {
  id: string;
  value: number | string | null;
  commission_total: number | string | null;
  signed_at: string | null;
  agent_user_id: string | null;
  agent_name: string | null;
  lead_id: string | null;
}

/**
 * Data local em São Paulo. O bucket do mês precisa ser o do fuso do escritório:
 * uma venda assinada dia 31 às 22h BRT é 1º do mês seguinte em UTC e mudaria de
 * mês no relatório.
 */
function dataLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO });
}

function toNumero(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Vendas assinadas no intervalo (datas ISO 'YYYY-MM-DD', ambas inclusivas).
 *
 * `signed_at` é timestamptz: a janela é fechada em -03:00 porque o Brasil não
 * tem horário de verão desde 2019 — o bucket por mês, esse sim, usa `Intl`.
 */
export async function buscarVendasAssinadas(
  tenantId: string,
  inicio: string,
  fim: string,
): Promise<VendaAssinada[]> {
  const linhas: PropostaAssinadaRow[] = [];
  let page = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('proposals')
      .select('id, value, commission_total, signed_at, agent_user_id, agent_name, lead_id')
      .eq('tenant_id', tenantId)
      .eq('stage_id', 'proposta-assinada')
      .not('signed_at', 'is', null)
      .gte('signed_at', `${inicio}T00:00:00-03:00`)
      .lte('signed_at', `${fim}T23:59:59.999-03:00`)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`Falha ao buscar vendas assinadas: ${error.message}`);

    const rows = (data ?? []) as PropostaAssinadaRow[];
    linhas.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page += 1;
  }

  const classificacoes = await buscarClassificacoes(linhas);

  return linhas
    .filter((row) => row.signed_at)
    .map((row) => {
      const vgv = toNumero(row.value);
      const override = toNumero(row.commission_total);
      // Ruling do motor do espelho (server/reportMirror/motor.js): comissão 0
      // conta como "sem override" e cai na derivação por classificação.
      const vgc = override > 0
        ? override
        : calcularComissaoForecast(vgv, row.lead_id ? classificacoes.get(row.lead_id) : null).valor;
      const dataAssinatura = dataLocal(row.signed_at as string);
      const [ano, mes] = dataAssinatura.split('-').map(Number);

      return {
        id: row.id,
        leadId: row.lead_id,
        agentUserId: row.agent_user_id,
        agentNome: row.agent_name?.trim() || '',
        vgv,
        vgc,
        dataAssinatura,
        mes,
        ano,
      };
    })
    // O recorte fino fica aqui: a query usa -03:00 e o bucket usa o fuso real.
    .filter((venda) => venda.dataAssinatura >= inicio && venda.dataAssinatura <= fim);
}

/** Classificação dos leads das propostas sem override de comissão. */
async function buscarClassificacoes(
  linhas: PropostaAssinadaRow[],
): Promise<Map<string, LeadClassification>> {
  const ids = [
    ...new Set(
      linhas
        .filter((row) => toNumero(row.commission_total) <= 0 && row.lead_id)
        .map((row) => row.lead_id as string),
    ),
  ];
  const mapa = new Map<string, LeadClassification>();
  if (ids.length === 0) return mapa;

  for (let i = 0; i < ids.length; i += LEADS_BATCH) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, classification')
      .in('id', ids.slice(i, i + LEADS_BATCH));

    // Sem a classificação a comissão cai em 6% (terceiros) — o pior caso é
    // superestimar um lançamento, nunca sumir com a venda do relatório.
    if (error) {
      console.warn('[vendasAssinadas] classificação indisponível:', error.message);
      return mapa;
    }
    for (const lead of (data ?? []) as Array<{ id: string; classification: LeadClassification }>) {
      mapa.set(lead.id, lead.classification);
    }
  }

  return mapa;
}

export interface TotaisVendas {
  vgv: number;
  vgc: number;
  vendas: number;
}

/** Soma simples — usada pelos KPIs e pelas metas. */
export function somarVendas(vendas: VendaAssinada[]): TotaisVendas {
  return vendas.reduce(
    (acc, venda) => ({ vgv: acc.vgv + venda.vgv, vgc: acc.vgc + venda.vgc, vendas: acc.vendas + 1 }),
    { vgv: 0, vgc: 0, vendas: 0 },
  );
}

/** Totais por mês (1..12) do ano corrente da consulta. */
export function agruparPorMes(vendas: VendaAssinada[]): Map<number, TotaisVendas> {
  const meses = new Map<number, TotaisVendas>();
  for (const venda of vendas) {
    const atual = meses.get(venda.mes) || { vgv: 0, vgc: 0, vendas: 0 };
    atual.vgv += venda.vgv;
    atual.vgc += venda.vgc;
    atual.vendas += 1;
    meses.set(venda.mes, atual);
  }
  return meses;
}

export interface TotaisCorretor extends TotaisVendas {
  agentUserId: string | null;
  agentNome: string;
}

/**
 * Agrupa por corretor. A chave é `agent_user_id` quando existe — nome só entra
 * como chave nas vendas antigas que ficaram sem usuário resolvido (Eduardo,
 * Nathalia Lobo, "Flávia e Humberto"), e aí o nome da planilha é tudo que há.
 */
export function agruparPorCorretor(vendas: VendaAssinada[]): TotaisCorretor[] {
  const porCorretor = new Map<string, TotaisCorretor>();

  for (const venda of vendas) {
    const chave = venda.agentUserId || `nome:${normalizarNome(venda.agentNome)}`;
    const atual = porCorretor.get(chave) || {
      agentUserId: venda.agentUserId,
      agentNome: venda.agentNome,
      vgv: 0,
      vgc: 0,
      vendas: 0,
    };
    atual.vgv += venda.vgv;
    atual.vgc += venda.vgc;
    atual.vendas += 1;
    porCorretor.set(chave, atual);
  }

  return [...porCorretor.values()];
}

export function normalizarNome(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
