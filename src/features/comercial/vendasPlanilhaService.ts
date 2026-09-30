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
 *
 * FILTROS EM CIMA — 29/09. Equipe, pronto/lançamento, construtora e
 * empreendimento voltam como RECORTE, não como coluna: a tela continua
 * mostrando só o que a planilha tem. Saíram Área, R$/m² e Total (-3%), e
 * entrou a situação (pago / parcelado / pendente), lida da própria planilha.
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
  /** De onde veio o lead: "Santa", "Dejoy", "Permuta". Como foi escrito. */
  origem: string | null;
  /** "Total Unidade" na planilha. Zerado nas linhas de parcela, de propósito. */
  total_unidade: number | null;
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
  /** Lida da própria planilha pelo banco — ver a migration de 29/09. */
  situacao: SituacaoDaPlanilha;
  /** Do cadastro. Diz à tela se a célula mostra Qd · Un ou o código. */
  tipo_negocio: 'lancamento' | 'terceiros' | null;
  /** O código do imóvel das vendas de terceiros, digitado na Dash. */
  codigo_imovel: string | null;
}

export type SituacaoDaPlanilha = 'pago' | 'parcelado' | 'pendente';

export const ROTULO_DA_SITUACAO: Record<SituacaoDaPlanilha, string> = {
  pago: 'Pago',
  parcelado: 'Parcelado',
  pendente: 'Pendente',
};

export interface ConferenciaDaPlanilha {
  linhas: VendaDaPlanilha[];
  total_linhas: number;
  total_unidade: number;
  total_comissao: number;
  total_imobiliaria: number;
  total_recebido: number;
}

export interface FiltrosDaPlanilha {
  de?: string | null;
  ate?: string | null;
  corretor?: string | null;
  equipeId?: string | null;
  /** 'lancamento' | 'terceiros' — os prontos. */
  tipo?: string | null;
  construtoraId?: string | null;
  lancamentoId?: string | null;
  situacao?: string | null;
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
    p_equipe_id: f.equipeId || null,
    p_tipo: f.tipo || null,
    p_construtora_id: f.construtoraId || null,
    p_lancamento_id: f.lancamentoId || null,
    p_situacao: f.situacao || null,
  });

  // Lança em vez de devolver vazio: lista vazia por falha de leitura é
  // indistinguível de "não houve venda no período", e as duas frases levam a
  // conclusões opostas sobre o mês.
  if (error) throw error;
  return (data as ConferenciaDaPlanilha) ?? null;
}

/**
 * Grava o código do imóvel de uma venda de terceiros. Vazio apaga.
 *
 * Recebe o id da LINHA, mas o banco guarda pela venda (cliente + assinatura +
 * empreendimento): as parcelas da mesma venda passam a mostrar o mesmo código.
 */
export async function gravarCodigoDaVenda(vendaPlanilhaId: string, codigo: string) {
  const { error } = await supabase.rpc('venda_planilha_gravar_codigo', {
    p_venda_planilha_id: vendaPlanilhaId,
    p_codigo: codigo.trim() || null,
  });
  if (error) throw error;
}
