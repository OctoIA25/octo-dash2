/**
 * Telefones dos corretores já cadastrados na dash, em forma canônica.
 *
 * Serve para a conversa com um corretor da equipe aparecer categorizada sem
 * ninguém marcar nada: quem já está no cadastro não precisa ser etiquetado de
 * novo. A categoria gravada à mão continua vencendo (ver `categoriaEfetiva`),
 * que é o que permite marcar como Corretor um parceiro de FORA da imobiliária.
 *
 * Fonte: `tenant_brokers` — mesma tabela de contato que server/enps/roster.js
 * usa como primária. O fallback `user_profiles` de lá NÃO é replicado aqui: no
 * cliente ele esbarraria na RLS de perfis de terceiros. Sem telefone, a
 * conversa apenas não ganha a categoria automática.
 *
 * ponytail: sem filtro por status e sem cruzar com tenant_memberships — o
 * objetivo é reconhecer QUEM é o número, e um corretor inativo (ou herdado de
 * outra base, como os 70 da Japi) continua sendo corretor. Se um dia isso
 * incomodar, é um .eq('status', 'active') — ou um merge por auth_user_id com
 * os membros reais, como faz useCaptadores.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { normalizePhone } from '../services/chatService';

export async function fetchCorretorPhones(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tenant_brokers')
    .select('phone')
    .eq('tenant_id', tenantId);

  if (error) {
    // Falha aqui só custa a categoria automática — nunca esconde conversa.
    console.error('[chat] não foi possível carregar telefones dos corretores:', error.message);
    return new Set();
  }

  const phones = new Set<string>();
  for (const row of (data ?? []) as { phone: string | null }[]) {
    const phone = normalizePhone(row.phone);
    if (phone.length >= 10) phones.add(phone);
  }
  return phones;
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
