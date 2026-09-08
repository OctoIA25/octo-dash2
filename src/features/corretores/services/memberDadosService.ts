/**
 * Dados cadastrais do corretor (RG, CPF, nascimento, endereço, CNPJ, recebimento).
 *
 * Tabela separada de `tenant_memberships` de propósito: aquela é legível com a
 * anon key (que vai no bundle), esta tem RLS restrita ao próprio corretor e a
 * admin/owner do tenant. Ver 20260907_corretor_dados_cadastrais.sql.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ServiceResult } from './tenantMembersService';

export interface MemberDados {
  rg: string;
  cpf: string;
  data_nascimento: string; // yyyy-mm-dd (input type="date")
  endereco: string;
  cnpj: string;
  pix_chave: string;
  banco: string;
  agencia: string;
  conta: string;
  titular: string;
}

export const EMPTY_MEMBER_DADOS: MemberDados = {
  rg: '', cpf: '', data_nascimento: '', endereco: '', cnpj: '',
  pix_chave: '', banco: '', agencia: '', conta: '', titular: '',
};

/** Vazio vira NULL no banco — evita distinguir '' de ausente na leitura. */
const nullIfBlank = (v: string) => {
  const t = v.trim();
  return t === '' ? null : t;
};

export async function fetchMemberDados(
  tenantId: string,
  userId: string,
): Promise<MemberDados> {
  const { data, error } = await supabase
    .from('tenant_member_dados')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Tabela ausente (migration pendente) ou RLS negando: form em branco + aviso.
    console.warn('⚠️ Não foi possível carregar dados cadastrais:', error.message, error.code);
    return { ...EMPTY_MEMBER_DADOS };
  }
  if (!data) return { ...EMPTY_MEMBER_DADOS };

  const row = data as Record<string, string | null>;
  return Object.fromEntries(
    Object.keys(EMPTY_MEMBER_DADOS).map((k) => [k, row[k] ?? '']),
  ) as unknown as MemberDados;
}

export async function saveMemberDados(
  tenantId: string,
  userId: string,
  dados: MemberDados,
): Promise<ServiceResult> {
  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    ...Object.fromEntries(
      (Object.keys(EMPTY_MEMBER_DADOS) as (keyof MemberDados)[])
        .map((k) => [k, nullIfBlank(dados[k])]),
    ),
    updated_at: new Date().toISOString(),
    updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  };

  const { error } = await supabase
    .from('tenant_member_dados')
    .upsert(payload as never, { onConflict: 'tenant_id,user_id' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
