/**
 * A.4 · Metas diárias — três funções do banco (20261009_metas_diarias.sql).
 * A tela não lê a tabela: o corretor só vê e lança o próprio dia, e o placar
 * é da gestão — quem decide é o banco.
 */
import { supabase } from '@/integrations/supabase/client';
import type { LeadDoCorretor } from './filaDeResgate';

export type Campo = 'captacoes' | 'visitas' | 'propostas' | 'retornos';
export type Numeros = Partial<Record<Campo, number>>;

export const ROTULO_DO_CAMPO: Record<Campo, string> = {
  captacoes: 'Captações',
  visitas: 'Visitas',
  propostas: 'Propostas',
  retornos: 'Retornos',
};

export interface Compromisso { prometido: Numeros; lancado_em: string; atrasado: boolean }
export interface ItemDaAgenda { id: string; horario: string | null; tipo: string | null; titulo: string; status: string | null; lead_id: string | null; lead_nome: string | null; imovel: string | null }
export interface Vencida { id: string; data: string; horario: string | null; titulo: string; lead_id: string | null; lead_nome: string | null }
export interface Parado { lead_id: string; nome: string; etapa: string | null; dias: number }
export interface DuvidaDaLia { id: string; pergunta: string; lead_id: string | null; criado_em: string }

export interface MeuDia {
  data: string;
  corte: string;
  campos: Campo[];
  compromisso: Compromisso | null;
  realizado: Required<Numeros>;
  agenda: ItemDaAgenda[];
  tarefas: { id: string; titulo: string; prioridade: string | null }[];
  vencidas: Vencida[];
  parados: Parado[];
  lia: DuvidaDaLia[];
  meus_leads: Array<{ id: string; nome: string; etapa: string | null; temperatura: string | null; origem: string | null }>;
}

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Você não faz parte desta imobiliária.',
  campo_invalido: 'Esse campo não faz parte do seu compromisso.',
  compromisso_invalido: 'Use números inteiros de 0 a 99.',
};
const traduz = (msg?: string) => (msg && MENSAGENS[msg]) || 'Não deu para concluir. Tente de novo.';

export async function carregarMeuDia(tenantId: string): Promise<MeuDia> {
  const { data, error } = await supabase.rpc('meu_dia', { p_tenant_id: tenantId });
  if (error) throw new Error(traduz(error.message));
  return data as MeuDia;
}

export async function lancarCompromisso(tenantId: string, prometido: Numeros): Promise<Compromisso> {
  const { data, error } = await supabase.rpc('lancar_meta_diaria', { p_tenant_id: tenantId, p_prometido: prometido });
  if (error) throw new Error(traduz(error.message));
  return data as Compromisso;
}

export interface PessoaDoPlacar {
  user_id: string; nome: string; equipe: string; campos: Campo[];
  lancou: boolean; atrasado: boolean; prometido: Numeros | null; realizado: Required<Numeros>; bateu: boolean;
}
export interface Placar {
  data: string;
  equipes: { equipe: string; corretores: number; lancaram: number; bateram: number; aproveitamento: number | null }[];
  pessoas: PessoaDoPlacar[];
}

export async function carregarPlacar(tenantId: string): Promise<Placar> {
  const { data, error } = await supabase.rpc('placar_metas_diarias', { p_tenant_id: tenantId });
  if (error) throw new Error(traduz(error.message));
  return data as Placar;
}

export const leadsDoCorretor = (dia: MeuDia): LeadDoCorretor[] => dia.meus_leads ?? [];
