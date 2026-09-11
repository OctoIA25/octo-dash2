/**
 * Anúncio do portal que manda lead e não bate com imóvel nenhum.
 *
 * A lista e a gravação passam pelo SERVIDOR (não pelo Supabase direto) por dois
 * motivos: a tabela do de-para tem RLS sem policy — o navegador não a lê nem a
 * escreve —, e o reprocessamento dos leads já recebidos precisa da mesma função
 * de classificação que o trigger de entrada usa. Mesmo desenho do
 * zapIntegrationService.
 */
import { supabase } from '@/lib/supabaseClient';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface AnuncioPendente {
  originListingId: string;
  /** O código que o portal mandou — é ele que aparece hoje no card do lead. */
  codigoNoPortal: string | null;
  totalLeads: number;
  ultimoLeadEm: string;
  /** Endereço/preço que veio na mensagem do lead. Clique-no-WhatsApp não tem. */
  dica: string | null;
}

export interface OpcaoDeCodigo {
  codigo: string;
  rotulo: string;
  grupo: 'Imóveis do cadastro' | 'Lançamentos já conhecidos';
}

export async function fetchAnunciosPendentes(
  tenantId: string,
): Promise<{ anuncios: AnuncioPendente[]; codigosConhecidos: string[]; error?: string }> {
  const res = await fetch('/api/v1/zap/anuncios/desconhecidos', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return {
    anuncios: json.anuncios || [],
    codigosConhecidos: json.codigosConhecidos || [],
    error: json.error,
  };
}

export async function amarrarAnuncio(
  tenantId: string, originListingId: string, codigo: string,
): Promise<{ ok: boolean; leadsAtualizados?: number; error?: string }> {
  const res = await fetch('/api/v1/zap/anuncios', {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ tenantId, originListingId, codigo }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok, leadsAtualizados: json.leadsAtualizados, error: json.error };
}

/**
 * Opções da escolha: imóveis do catálogo (o navegador lê, é o tenant dele) +
 * os códigos de lançamento que o servidor devolveu. Digitar um código novo
 * continua valendo — lançamento recém-numerado ainda não está em lugar nenhum.
 */
export async function fetchOpcoesDeCodigo(
  tenantId: string, codigosConhecidos: string[],
): Promise<OpcaoDeCodigo[]> {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .select('codigo_imovel, titulo, bairro')
    .eq('tenant_id', tenantId)
    .order('codigo_imovel');

  if (error) {
    console.error('[anunciosPendentes] erro ao ler imoveis_locais:', error.code, error.message);
  }

  const imoveis: OpcaoDeCodigo[] = (data ?? [])
    .filter((i) => i.codigo_imovel)
    .map((i) => ({
      codigo: String(i.codigo_imovel),
      rotulo: [i.codigo_imovel, i.titulo || i.bairro].filter(Boolean).join(' — '),
      grupo: 'Imóveis do cadastro' as const,
    }));

  const lancamentos: OpcaoDeCodigo[] = codigosConhecidos.map((codigo) => ({
    codigo, rotulo: codigo, grupo: 'Lançamentos já conhecidos' as const,
  }));

  return [...imoveis, ...lancamentos];
}
