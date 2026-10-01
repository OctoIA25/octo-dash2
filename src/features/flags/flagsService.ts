/**
 * A.3 · Flags — o banco classifica (flags_do_mes) e guarda a régua
 * (flag_reguas: a casa lê, a diretoria grava — regra do próprio banco).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Atuacao, Caminho, PessoaComFlag } from './flags';

export type Nivel = 'verde' | 'amarelo';
/** Chave "atuacao:nivel" → caminhos. Nível ausente = sem régua. */
export type Reguas = Partial<Record<`${Atuacao}:${Nivel}`, Caminho[]>>;

export interface FlagsDoMes {
  mes: string;
  reguas: Reguas;
  pessoas: PessoaComFlag[];
}

export async function carregarFlags(tenantId: string, mes: string): Promise<FlagsDoMes> {
  const { data, error } = await supabase.rpc('flags_do_mes', { p_tenant_id: tenantId, p_mes: `${mes}-01` });
  if (error) {
    throw new Error(error.message === 'sem_permissao'
      ? 'As flags são da gestão: diretoria e líderes de equipe.'
      : 'Não deu para carregar as flags. Tente de novo.');
  }
  return data as FlagsDoMes;
}

export async function buscarReguas(tenantId: string): Promise<Reguas> {
  const { data, error } = await supabase.from('flag_reguas').select('atuacao, nivel, caminhos').eq('tenant_id', tenantId);
  if (error) throw new Error('Não deu para carregar a régua. Tente de novo.');
  const reguas: Reguas = {};
  for (const r of (data ?? []) as Array<{ atuacao: Atuacao; nivel: Nivel; caminhos: Caminho[] }>) {
    reguas[`${r.atuacao}:${r.nivel}`] = r.caminhos;
  }
  return reguas;
}

/** Lista vazia apaga o nível: vermelho é "não alcançou o amarelo" e não se cadastra. */
export async function salvarRegua(tenantId: string, atuacao: Atuacao, nivel: Nivel, caminhos: Caminho[]): Promise<void> {
  const consulta = caminhos.length === 0
    ? supabase.from('flag_reguas').delete().eq('tenant_id', tenantId).eq('atuacao', atuacao).eq('nivel', nivel)
    : supabase.from('flag_reguas').upsert(
        { tenant_id: tenantId, atuacao, nivel, caminhos, atualizado_em: new Date().toISOString() },
        { onConflict: 'tenant_id,atuacao,nivel' },
      );
  const { error } = await consulta;
  if (error) throw new Error('Não deu para salvar a régua. Só a diretoria muda a régua da casa.');
}
