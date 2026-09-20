/**
 * A lista de leads com abas de ação (P1.8).
 *
 * UMA chamada traz a página, os contadores das seis abas e os três números do
 * rodapé. É de propósito: o plano define o item como pronto quando "os
 * contadores das abas batem com a lista", e duas consultas separadas — cada
 * uma com sua cópia do filtro — divergem no primeiro ajuste.
 */

import { supabase } from '@/lib/supabaseClient';

export const ABAS = [
  { id: 'todos', rotulo: 'Todos', legenda: 'Todos os leads ativos da imobiliária.' },
  { id: 'novos', rotulo: 'Novos', legenda: 'Ainda na etapa de entrada, esperando o primeiro atendimento.' },
  { id: 'atendimento', rotulo: 'Em atendimento', legenda: 'Já saíram da entrada e estão andando no funil.' },
  { id: 'atividade', rotulo: 'Atividade agendada', legenda: 'Têm compromisso marcado na agenda para hoje ou depois.' },
  { id: 'parados', rotulo: 'Parados', legenda: 'Sem nenhuma movimentação registrada há sete dias ou mais.' },
  { id: 'sem-corretor', rotulo: 'Sem corretor', legenda: 'Ninguém é responsável por estes leads agora.' },
] as const;

export type AbaId = (typeof ABAS)[number]['id'];

export interface LinhaDaLista {
  id: string;
  nome: string | null;
  telefone: string | null;
  etapa: string | null;
  origem: string | null;
  imovel: string | null;
  corretor: string | null;
  corretor_id: string | null;
  criado_em: string;
  ultima_movimentacao: string | null;
  tem_atividade: boolean;
}

export interface ResultadoDaLista {
  linhas: LinhaDaLista[];
  contadores: Record<string, number>;
  total_na_aba: number;
  total_na_base: number;
  /** Quantos leads do filtro ainda não têm nenhum movimento registrado. */
  sem_historico: number;
}

export interface FiltrosDaLista {
  aba?: AbaId;
  busca?: string;
  corretorId?: string | null;
  origem?: string | null;
  desde?: string | null;
  ate?: string | null;
  limite?: number;
  offset?: number;
}

const VAZIO: ResultadoDaLista = {
  linhas: [], contadores: {}, total_na_aba: 0, total_na_base: 0, sem_historico: 0,
};

export async function buscarListaDeLeads(
  tenantId: string,
  f: FiltrosDaLista = {}
): Promise<ResultadoDaLista> {
  if (!tenantId || tenantId === 'owner') return VAZIO;

  const { data, error } = await supabase.rpc('leads_lista_por_aba', {
    p_tenant_id: tenantId,
    p_aba: f.aba ?? 'todos',
    p_busca: f.busca?.trim() || null,
    p_corretor: f.corretorId || null,
    p_origem: f.origem || null,
    p_desde: f.desde || null,
    p_ate: f.ate || null,
    p_limite: f.limite ?? 50,
    p_offset: f.offset ?? 0,
  });

  // Erro NÃO vira lista vazia: "nenhum lead" e "não consegui ler" se parecem
  // na tela e significam o oposto. Quem chama decide o que dizer.
  if (error) throw error;

  const r = (data ?? {}) as Partial<ResultadoDaLista>;
  return {
    linhas: Array.isArray(r.linhas) ? r.linhas : [],
    contadores: (r.contadores ?? {}) as Record<string, number>,
    total_na_aba: Number(r.total_na_aba ?? 0),
    total_na_base: Number(r.total_na_base ?? 0),
    sem_historico: Number(r.sem_historico ?? 0),
  };
}
