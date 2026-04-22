/**
 * Serviço para buscar corretor na tabela Corretores pelo email do usuário logado.
 * Resolve o problema de identidade: o auth retorna email, mas precisamos do ID numérico
 * e do nome (nm_corretor) para toda a trilha de testes comportamentais.
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

export interface CorretorIdentidade {
  id: number;
  nome: string;
  email?: string;
}

/**
 * Busca o corretor na tabela Corretores usando o email do usuário logado.
 * Tenta primeiro por email, depois por nome parcial (fallback).
 */
export async function buscarCorretorPorEmail(
  userEmail: string,
  userName?: string
): Promise<CorretorIdentidade | null> {
  try {
    if (!userEmail || userEmail.trim() === '') {
      console.warn('⚠️ Email do usuário vazio');
      return null;
    }


    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    // 1. Tentar buscar por email na tabela Corretores (eq = exact match)
    let response = await fetch(
      `${config.url}/rest/v1/Corretores?email=eq.${encodeURIComponent(userEmail)}&select=id,nm_corretor,email&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );

    // 1b. Se não encontrou com exact match, tentar ilike com wildcards
    if (response.ok) {
      const dataExact = await response.json();
      if (dataExact && dataExact.length > 0) {
        const corretor = dataExact[0];
        return {
          id: corretor.id,
          nome: corretor.nm_corretor,
          email: corretor.email
        };
      }
    }

    // 1c. Tentar ilike com wildcards (case-insensitive)
    response = await fetch(
      `${config.url}/rest/v1/Corretores?email=ilike.*${encodeURIComponent(userEmail)}*&select=id,nm_corretor,email&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const corretor = data[0];
        return {
          id: corretor.id,
          nome: corretor.nm_corretor,
          email: corretor.email
        };
      }
    }

    // 2. Fallback: buscar pelo nome do usuário (se disponível e não for um email)
    if (userName && userName !== userEmail && !userName.includes('@')) {
      response = await fetch(
        `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(userName)}&select=id,nm_corretor,email&limit=1`,
        {
          method: 'GET',
          headers: headers
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const corretor = data[0];
          return {
            id: corretor.id,
            nome: corretor.nm_corretor,
            email: corretor.email
          };
        }
      }
    }

    // 3. Fallback: extrair parte do email antes do @ e buscar por nome parcial
    const nomeFromEmail = userEmail.split('@')[0]?.replace(/[._-]/g, ' ');
    if (nomeFromEmail && nomeFromEmail.length > 2) {
      response = await fetch(
        `${config.url}/rest/v1/Corretores?nm_corretor=ilike.*${encodeURIComponent(nomeFromEmail)}*&select=id,nm_corretor,email&limit=1`,
        {
          method: 'GET',
          headers: headers
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const corretor = data[0];
          return {
            id: corretor.id,
            nome: corretor.nm_corretor,
            email: corretor.email
          };
        }
      }
    }

    console.warn('⚠️ Corretor não encontrado para email:', userEmail);
    return null;

  } catch (error) {
    console.error('❌ Erro ao buscar corretor por email:', error);
    return null;
  }
}
