/**
 * Quem é gente na imobiliária, com o nome do cadastro (`pessoas_da_casa`,
 * 20261017). A regra é do banco (`conta_de_pessoa`): sem a Lia, sem conta de
 * teste, sem o dono da plataforma. A tela não sabe — e não deve saber — qual
 * conta é a da Lia.
 *
 * Ranking que soma por pessoa usa isto em vez do nome escrito no lead: o nome
 * escrito varia ("FERNANDA SOUZA" × "Fernanda Souza") e a mesma pessoa virava
 * duas linhas.
 */
import { supabase } from '@/integrations/supabase/client';

/** user_id → nome do cadastro. */
export type PessoasDaCasa = Map<string, string>;

export async function carregarPessoasDaCasa(tenantId: string): Promise<PessoasDaCasa> {
  const { data, error } = await supabase.rpc('pessoas_da_casa', { p_tenant_id: tenantId });
  if (error) throw new Error('Não deu para carregar quem é da equipe.');
  return new Map(((data ?? []) as { user_id: string; nome: string }[]).map((p) => [p.user_id, p.nome]));
}
