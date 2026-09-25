/**
 * A planilha comercial na Conferência de vendas — item 5 do chefe, 24/09.
 *
 * Fonte: `commercial_sales`, a cópia congelada da importação da planilha (o
 * sync de hora em hora foi desligado em 01/09). É outra coisa da tabela
 * `vendas`, que nasce das propostas assinadas do CRM — por isso as duas
 * convivem na tela com um seletor, e não somadas: somar inventaria vendas.
 *
 * SÓ AS COLUNAS DA PLANILHA — 25/09. "Nas conferências de vendas deixe apenas
 * as informações da planilha que enviei". Saíram daqui o gerente (derivado da
 * equipe do corretor), o tipo do negócio (derivado do cadastro de
 * empreendimentos) e a forma de pagamento (campo da Dash) — nenhum dos três
 * existe no arquivo. Saíram junto os três contadores de "quantas linhas estão
 * sem cada um": eles existiam para explicar coluna vazia, e sem a coluna não
 * explicam nada.
 *
 * A tabela `venda_pagamento` e a função `venda_pagamento_gravar` continuam no
 * banco, com o que já estiver preenchido. O que saiu foi a tela e a leitura.
 */

import { supabase } from '@/lib/supabaseClient';

export interface VendaDaPlanilha {
  id: string;
  data_assinatura: string | null;
  empreendimento: string | null;
  /** Quadra · unidade. A planilha não tem código de imóvel. */
  unidade_codigo: string | null;
  cliente_nome: string | null;
  corretor_nome: string | null;
  /** "Tipo" na planilha: o nível do corretor (PL, Tropa, TL, ES, Estagiário). */
  nivel_corretor: string | null;
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
}

export interface ConferenciaDaPlanilha {
  linhas: VendaDaPlanilha[];
  total_linhas: number;
  total_vgv: number;
  total_comissao: number;
  total_imobiliaria: number;
  total_recebido: number;
}

export interface FiltrosDaPlanilha {
  de?: string | null;
  ate?: string | null;
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
    p_corretor: f.corretor || null,
  });

  // Lança em vez de devolver vazio: lista vazia por falha de leitura é
  // indistinguível de "não houve venda no período", e as duas frases levam a
  // conclusões opostas sobre o mês.
  if (error) throw error;
  return (data as ConferenciaDaPlanilha) ?? null;
}
