/**
 * Telefones dos corretores em forma canônica, para o filtro/categoria
 * "Corretores" do chat.
 *
 * Fonte ÚNICA: `tenant_memberships.permissions.whatsapp_phones` — os números
 * definidos por membro no Gerenciador de Permissões (EquipeSection). Só conta
 * quem foi setado lá; o telefone de cadastro em `tenant_brokers` deixou de
 * valer para esta categoria (decisão de produto: o admin escolhe explicitamente
 * quais números são "de corretor"). A categoria gravada à mão continua vencendo
 * (ver `categoriaEfetiva`), o que permite marcar como Corretor um parceiro de
 * fora da imobiliária.
 *
 * A seleção usa o caminho JSON (`permissions->whatsapp_phones`) para não
 * trafegar o JSONB inteiro — `permissions.photo` pode ser um data-URI de até
 * 2MB por membro.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { normalizePhone } from '../services/chatService';

/** Achata as linhas de membership num Set de telefones canônicos. */
export function phonesFromMemberships(rows: ReadonlyArray<{ phones: unknown }>): Set<string> {
  const phones = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.phones)) continue;
    for (const raw of row.phones) {
      if (typeof raw !== 'string') continue;
      const phone = normalizePhone(raw);
      if (phone.length >= 10) phones.add(phone);
    }
  }
  return phones;
}

export async function fetchCorretorPhones(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('phones:permissions->whatsapp_phones')
    .eq('tenant_id', tenantId)
    .not('permissions->whatsapp_phones', 'is', null);

  if (error) {
    // Falha aqui só custa a categoria automática — nunca esconde conversa.
    console.error('[chat] não foi possível carregar telefones dos corretores:', error.message);
    return new Set();
  }

  return phonesFromMemberships((data ?? []) as unknown as { phones: unknown }[]);
}

export function useCorretorPhones(tenantId: string | undefined): Set<string> {
  const [phones, setPhones] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') {
      setPhones(new Set());
      return;
    }
    let ativo = true;
    fetchCorretorPhones(tenantId)
      .then((result) => {
        if (ativo) setPhones(result);
      })
      .catch((err) => console.error('[chat] erro ao carregar corretores:', err));
    return () => {
      ativo = false;
    };
  }, [tenantId]);

  return phones;
}
