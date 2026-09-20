/**
 * Os quatro gráficos de leads (P1.10).
 *
 * UMA chamada traz os quatro, com os mesmos filtros — o plano define o item
 * como pronto quando "os totais do gráfico batem com os contadores", e quatro
 * consultas com quatro cópias do filtro divergem no primeiro ajuste.
 */

import { supabase } from '@/lib/supabaseClient';

export interface PontoPorDia { dia: string; total: number }

export interface LinhaPorEquipe {
  equipe: string;
  com_corretor: number;
  aguardando_corretor: number;
  com_lia: number;
  sem_ninguem: number;
  total: number;
}

export interface LinhaDoBolsao { equipe: string; total: number }

export interface Conversao {
  /** MEDIANA, e não média: a média aqui é dominada por um lead de 2019. */
  mediana_dias: number | null;
  media_dias: number | null;
  amostras: number;
  /** Vendas que não dá para medir, porque a proposta não aponta para lead. */
  vendas_sem_lead: number;
}

export interface LinhaPorEtapa { etapa: string; mediana_dias: number | null; observacoes: number }

export interface GraficosDeLeads {
  total: number;
  por_dia: PontoPorDia[];
  por_equipe: LinhaPorEquipe[];
  bolsao_por_equipe: LinhaDoBolsao[];
  conversao: Conversao;
  por_etapa: LinhaPorEtapa[];
  /** Desde quando há registro de mudança de etapa. A tela avisa com isto. */
  etapa_desde: string | null;
}

export interface FiltrosDosGraficos {
  desde?: string | null;
  ate?: string | null;
  equipeId?: string | null;
  corretorId?: string | null;
  origem?: string | null;
}

export async function buscarGraficosDeLeads(
  tenantId: string,
  f: FiltrosDosGraficos = {}
): Promise<GraficosDeLeads> {
  if (!tenantId || tenantId === 'owner') {
    throw new Error('sem imobiliária selecionada');
  }

  const { data, error } = await supabase.rpc('leads_graficos', {
    p_tenant_id: tenantId,
    p_desde: f.desde || null,
    p_ate: f.ate || null,
    p_equipe: f.equipeId || null,
    p_corretor: f.corretorId || null,
    p_origem: f.origem || null,
  });

  // Erro NÃO vira gráfico vazio: "nenhum lead no período" e "não consegui
  // ler" desenham a mesma tela em branco e significam o oposto.
  if (error) throw error;

  const r = (data ?? {}) as Partial<GraficosDeLeads>;
  return {
    total: Number(r.total ?? 0),
    por_dia: Array.isArray(r.por_dia) ? r.por_dia : [],
    por_equipe: Array.isArray(r.por_equipe) ? r.por_equipe : [],
    bolsao_por_equipe: Array.isArray(r.bolsao_por_equipe) ? r.bolsao_por_equipe : [],
    conversao: (r.conversao ?? { mediana_dias: null, media_dias: null, amostras: 0, vendas_sem_lead: 0 }) as Conversao,
    por_etapa: Array.isArray(r.por_etapa) ? r.por_etapa : [],
    etapa_desde: (r.etapa_desde as string | null) ?? null,
  };
}

/**
 * A média móvel de 7 dias que o plano pede na linha do gráfico por dia.
 *
 * Só há média quando há sete dias de janela: começar a linha no primeiro dia
 * com a média de um dia só desenharia um pico que não existe.
 */
export function mediaMovel(pontos: PontoPorDia[], janela = 7): Array<PontoPorDia & { media: number | null }> {
  return pontos.map((p, i) => {
    if (i + 1 < janela) return { ...p, media: null };
    const fatia = pontos.slice(i + 1 - janela, i + 1);
    const soma = fatia.reduce((s, x) => s + Number(x.total || 0), 0);
    return { ...p, media: Math.round((soma / janela) * 10) / 10 };
  });
}
