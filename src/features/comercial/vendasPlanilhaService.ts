/**
 * A planilha comercial na Conferência de vendas — item 5 do chefe, 24/09.
 *
 * Fonte: `commercial_sales`, a cópia congelada da importação da planilha (o
 * sync de hora em hora foi desligado em 01/09). É outra coisa da tabela
 * `vendas`, que nasce das propostas assinadas do CRM — por isso as duas
 * convivem na tela com um seletor, e não somadas: somar inventaria vendas.
 *
 * Três colunas que o chefe pediu NÃO existem na planilha, e por isso a função
 * do banco devolve, junto, quantas linhas ficaram sem cada uma. A tela mostra
 * esse número: coluna vazia sem explicação parece defeito da tela.
 */

import { supabase } from '@/lib/supabaseClient';

/** 'lancamento' | 'terceiros' | '' (todas) */
export type TipoDoNegocio = 'lancamento' | 'terceiros' | '';

export interface VendaDaPlanilha {
  id: string;
  data_assinatura: string | null;
  empreendimento: string | null;
  /** Quadra · unidade. A planilha não tem código de imóvel. */
  unidade_codigo: string | null;
  cliente_nome: string | null;
  corretor_nome: string | null;
  nivel_corretor: string | null;
  /** Quem lidera a equipe do corretor. Vem do cadastro, não da planilha. */
  gerente: string | null;
  /** Do cadastro de empreendimentos. `null` = ninguém classificou ainda. */
  tipo_negocio: 'lancamento' | 'terceiros' | null;
  /* As colunas da planilha do Drive, na ordem dela. */
  origem: string | null;
  area_m2: number | null;
  valor_m2: number | null;
  /** "Total Unidade" na planilha. */
  total_unidade: number | null;
  /** "Total (-3%)" na planilha — é o VGV. */
  valor_vgv: number | null;
  /** "Comissão Total" na planilha — a bruta. */
  comissao_total_venda: number | null;
  /** Os quatro percentuais somados: cada venda usa um só. */
  repasse_corretor: number | null;
  /** "Team Leader" na planilha: é VALOR, não nome. */
  team_leader_valor: number | null;
  /** "Comissão Imobiliária" — o que sobra para a casa. */
  comissao_imobiliaria: number | null;
  data_recebimento: string | null;
  /** Texto livre na planilha: "ok", "ver na Caixa", "pagou mais 252 em 14/03". */
  status_recebimento: string | null;
  pagamento_forma: 'a_vista' | 'parcelado' | null;
  parcelas_total: number | null;
  parcelas_pagas: number | null;
}

export interface ConferenciaDaPlanilha {
  linhas: VendaDaPlanilha[];
  total_linhas: number;
  total_vgv: number;
  total_comissao: number;
  total_imobiliaria: number;
  total_recebido: number;
  /** Quantas linhas ainda não têm cada um dos três. */
  sem_gerente: number;
  sem_tipo: number;
  sem_pagamento: number;
}

export interface FiltrosDaPlanilha {
  de?: string | null;
  ate?: string | null;
  tipo?: TipoDoNegocio;
  corretor?: string | null;
}

export async function carregarPlanilha(
  tenantId: string,
  f: FiltrosDaPlanilha = {},
): Promise<ConferenciaDaPlanilha | null> {
  if (!tenantId || tenantId === 'owner') return null;

  const { data, error } = await supabase.rpc('vendas_planilha_conferencia', {
    p_tenant_id: tenantId,
    p_de: f.de || null,
    p_ate: f.ate || null,
    p_tipo: f.tipo || null,
    p_corretor: f.corretor || null,
  });

  // Lança em vez de devolver vazio: lista vazia por falha de leitura é
  // indistinguível de "não houve venda no período", e as duas frases levam a
  // conclusões opostas sobre o mês.
  if (error) throw error;
  return (data as ConferenciaDaPlanilha) ?? null;
}

export interface PagamentoParaGravar {
  forma: 'a_vista' | 'parcelado' | null;
  parcelasTotal?: number | null;
  parcelasPagas?: number | null;
}

/**
 * Grava a forma de pagamento. `forma: null` LIMPA — e limpar é diferente de
 * gravar "à vista": um diz "ninguém preencheu ainda", o outro afirma que a
 * venda foi paga de uma vez.
 */
export async function gravarPagamento(
  vendaPlanilhaId: string,
  p: PagamentoParaGravar,
): Promise<{ success: boolean; error?: string }> {
  if (p.forma === 'parcelado') {
    const total = Number(p.parcelasTotal);
    if (!Number.isInteger(total) || total < 1) {
      return { success: false, error: 'diga em quantas parcelas' };
    }
    const pagas = Number(p.parcelasPagas ?? 0);
    if (!Number.isInteger(pagas) || pagas < 0 || pagas > total) {
      return { success: false, error: `as parcelas pagas vão de 0 a ${total}` };
    }
  }

  const { error } = await supabase.rpc('venda_pagamento_gravar', {
    p_venda_planilha_id: vendaPlanilhaId,
    p_forma: p.forma,
    p_parcelas_total: p.forma === 'parcelado' ? p.parcelasTotal : null,
    p_parcelas_pagas: p.forma === 'parcelado' ? (p.parcelasPagas ?? 0) : 0,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** "3 de 5 parcelas", "à vista", ou null quando ninguém preencheu. */
export function rotuloDoPagamento(v: VendaDaPlanilha): string | null {
  if (v.pagamento_forma === 'a_vista') return 'à vista';
  if (v.pagamento_forma === 'parcelado') {
    const total = v.parcelas_total ?? 0;
    const pagas = v.parcelas_pagas ?? 0;
    return `${pagas} de ${total} parcelas`;
  }
  return null;
}
