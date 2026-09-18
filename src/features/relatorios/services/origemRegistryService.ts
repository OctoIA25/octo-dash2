import { supabase } from '@/integrations/supabase/client';
import { chaveOrigem, type OrigemCadastrada, type TabelaDeConversao } from '../utils/origemRegistry';

// ============================================================
// Cadastro de origem de lead (P0.4).
//
// Duas tabelas, com papéis distintos:
//   tenant_lead_origins     -> as origens que a imobiliária reconhece,
//                              com cor, ordem e as duas chaves (mídia paga,
//                              orgânica).
//   tenant_lead_origin_map  -> "este texto cru é aquela origem". Só as
//                              decisões manuais; o resto usa a sugestão
//                              mecânica de origemRegistry.
//
// O mesmo desenho de leadSourceChannelsService: o banco guarda a escolha,
// o código guarda a sugestão.
// ============================================================

interface LinhaOrigem {
  id: string;
  codigo: string;
  nome: string;
  cor: string;
  ordem: number;
  midia_paga: boolean;
  organica: boolean;
  ativo: boolean;
}

function paraOrigem(l: LinhaOrigem): OrigemCadastrada {
  return {
    id: l.id,
    codigo: l.codigo,
    nome: l.nome,
    cor: l.cor,
    ordem: l.ordem,
    midiaPaga: l.midia_paga,
    organica: l.organica,
    ativo: l.ativo,
  };
}

/** As origens cadastradas do tenant, já na ordem definida pelo admin. */
export async function fetchOrigens(tenantId: string): Promise<OrigemCadastrada[]> {
  if (!tenantId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('tenant_lead_origins')
      .select('id, codigo, nome, cor, ordem, midia_paga, organica, ativo')
      .eq('tenant_id', tenantId)
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true });

    if (error) {
      console.error('[OrigemRegistry] Erro ao buscar origens:', error.message);
      return [];
    }
    return (data ?? []).map(paraOrigem);
  } catch (e) {
    console.error('[OrigemRegistry] Exceção ao buscar origens:', e);
    return [];
  }
}

/** Mapa { chave do texto cru -> código da origem } com as decisões salvas. */
export async function fetchConversoes(tenantId: string): Promise<TabelaDeConversao> {
  if (!tenantId) return {};
  try {
    const { data, error } = await (supabase as any)
      .from('tenant_lead_origin_map')
      .select('texto_bruto, origem_codigo')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[OrigemRegistry] Erro ao buscar conversões:', error.message);
      return {};
    }

    const mapa: TabelaDeConversao = {};
    (data ?? []).forEach((row: { texto_bruto: string; origem_codigo: string }) => {
      const k = chaveOrigem(row.texto_bruto);
      if (k && row.origem_codigo) mapa[k] = row.origem_codigo;
    });
    return mapa;
  } catch (e) {
    console.error('[OrigemRegistry] Exceção ao buscar conversões:', e);
    return {};
  }
}

export type EntradaDeOrigem = Omit<OrigemCadastrada, 'id'>;

/**
 * Cria ou atualiza uma origem. O `codigo` é a identidade: mudar o `nome`
 * renomeia em todo lugar sem quebrar as conversões que apontam para ele.
 */
export async function saveOrigem(
  tenantId: string,
  origem: EntradaDeOrigem
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };

  const codigo = (origem.codigo || '').trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(codigo)) {
    return { success: false, error: 'código deve ter apenas letras minúsculas, números e _' };
  }
  const nome = (origem.nome || '').trim();
  if (!nome) return { success: false, error: 'nome é obrigatório' };

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_origins')
      .upsert(
        {
          tenant_id: tenantId,
          codigo,
          nome,
          cor: origem.cor,
          ordem: origem.ordem,
          midia_paga: origem.midiaPaga,
          organica: origem.organica,
          ativo: origem.ativo,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,codigo' }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

/**
 * Apaga uma origem. As conversões que apontavam para ela caem junto (ON
 * DELETE CASCADE) — os leads voltam para a sugestão mecânica, nunca somem.
 */
export async function deleteOrigem(
  tenantId: string,
  codigo: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !codigo) return { success: false, error: 'parâmetros inválidos' };
  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_origins')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

/**
 * Diz que um texto cru pertence a uma origem cadastrada. O texto é
 * normalizado para garantir UMA linha por origem — "Santa Angela" e
 * "santa angela" gravam na mesma chave.
 */
export async function saveConversao(
  tenantId: string,
  textoBruto: string,
  origemCodigo: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };
  const k = chaveOrigem(textoBruto);
  if (!k) return { success: false, error: 'texto de origem inválido' };
  if (!origemCodigo) return { success: false, error: 'origem inválida' };

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_origin_map')
      .upsert(
        { tenant_id: tenantId, texto_bruto: k, origem_codigo: origemCodigo, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,texto_bruto' }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

/** Desfaz a conversão: o texto cru volta para a sugestão mecânica. */
export async function deleteConversao(
  tenantId: string,
  textoBruto: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };
  const k = chaveOrigem(textoBruto);
  if (!k) return { success: false, error: 'texto de origem inválido' };

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_origin_map')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('texto_bruto', k);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}
