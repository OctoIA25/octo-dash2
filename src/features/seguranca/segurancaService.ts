/**
 * Kit de segurança — senha pelas funções do banco (20261013_kit_de_seguranca.sql),
 * que são a única cópia da regra; MFA (TOTP) e recuperação pelo Supabase Auth.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MinhaSeguranca { kit_ativo: boolean; precisa_trocar: boolean; mfa_exigido: boolean; mfa_ativo: boolean; aal: string }
export interface Resultado { success: boolean; error?: string }

/** null = não deu para saber; o portão deixa passar (cair a tela de todos é pior). */
export async function minhaSeguranca(): Promise<MinhaSeguranca | null> {
  const { data, error } = await supabase.rpc('minha_seguranca');
  if (error) { console.warn('[seguranca] minha_seguranca falhou — o portão deixa passar', error.message); return null; }
  return (data as MinhaSeguranca) ?? null;
}

async function rpcResultado(nome: string, args: Record<string, unknown>): Promise<Resultado> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) return { success: false, error: 'Não deu para concluir. Tente de novo.' };
  return data as Resultado;
}
export const trocarMinhaSenha = (atual: string, nova: string) => rpcResultado('trocar_minha_senha', { p_atual: atual, p_nova: nova });
export const redefinirPorRecuperacao = (nova: string) => rpcResultado('redefinir_senha_por_recuperacao', { p_nova: nova });
export const adminRemoverMfa = (userId: string) => rpcResultado('admin_remover_mfa', { p_user_id: userId });
/** A virada da reunião: todos trocam a senha no próximo acesso; dono, admin e líder cadastram o MFA. */
export const ativarKit = () => rpcResultado('ativar_kit_de_seguranca', {});

/** Sempre a mesma resposta, exista ou não a conta — não se descobre quem tem cadastro pelo "esqueci". */
export async function pedirRecuperacao(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  });
  if (error) console.warn('[seguranca] pedido de recuperação não saiu', error.message);
}

/** O segundo fator já foi pedido nesta sessão? */
export async function precisaDoCodigo(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export async function fatorTotp(): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp?.find((f) => f.status === 'verified')?.id ?? null;
}

/**
 * Começa o cadastro do autenticador. Cadastro abandonado antes é descartado.
 * null = o MFA por app está desligado no Supabase: o portão deixa passar em
 * vez de prender o admin num cadastro impossível.
 */
export async function iniciarCadastroMfa(): Promise<{ factorId: string; qr: string; segredo: string } | null> {
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  for (const f of fatores?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Octo Dash' });
  if (error?.code === 'mfa_totp_enroll_not_enabled') {
    console.warn('[seguranca] MFA por app desligado no Supabase — o cadastro foi pulado');
    return null;
  }
  if (error || !data) throw new Error('Não deu para começar o cadastro do autenticador. Tente de novo.');
  return { factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function confirmarCodigo(factorId: string, codigo: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, '') });
  if (error) throw new Error('Código inválido ou vencido. Confira o relógio do celular e digite o código atual.');
}

export const sair = () => supabase.auth.signOut();
