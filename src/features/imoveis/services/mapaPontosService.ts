/**
 * Mapa interligado (P2.6) — os pontos dos três tipos.
 *
 * Uma chamada só devolve lançamentos, condomínios e imóveis com a coordenada
 * que está gravada na LINHA de cada um. O cache por endereço
 * (`geocoded_addresses`) continua existindo para não geocodificar duas vezes o
 * mesmo endereço, mas ele não manda no pino: pino é por registro, e é o que
 * permite arrastar um sem mover o outro do mesmo prédio.
 */

import { supabase } from '@/lib/supabaseClient';
import type { PontoDoMapa, TipoDePonto, TotaisDoMapa } from '../utils/mapaPontos';

export interface MapaPontos {
  pontos: PontoDoMapa[];
  totais: TotaisDoMapa;
}

const TABELA_DO_TIPO: Record<TipoDePonto, string> = {
  lancamento: 'lancamentos',
  condominio: 'condominios',
  imovel: 'imoveis_locais',
};

export async function carregarPontos(tenantId: string): Promise<MapaPontos | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('mapa_pontos', { p_tenant_id: tenantId });
  // Erro não vira mapa vazio: a tela diria "nada cadastrado" onde houve falha.
  if (error) throw error;
  return (data as MapaPontos) ?? null;
}

/**
 * Grava a posição arrastada à mão.
 *
 * `geo_origem = 'manual'` é o que impede a próxima geocodificação de desfazer
 * isso — é a regra que o plano chama de pronta. E `geo_erro` é limpo junto: um
 * pino posto à mão não está mais com problema de endereço.
 */
export async function salvarPino(
  tipo: TipoDePonto,
  id: string,
  lat: number,
  lng: number
): Promise<void> {
  const tabela = TABELA_DO_TIPO[tipo];
  if (!tabela) throw new Error('tipo inválido');
  const { error } = await supabase
    .from(tabela)
    .update({
      latitude: lat,
      longitude: lng,
      geo_origem: 'manual',
      // Arrastado à mão é sempre exato: alguém apontou o lugar.
      geo_precisao: 'exata',
      geo_em: new Date().toISOString(),
      geo_erro: null,
    })
    .eq('id', id);
  if (error) throw error;
}

export interface RelatorioDeGeocodificacao {
  ok: boolean;
  tentados: number;
  achados: number;
  aproximados: number;
  na_fila: number;
  falhas: Array<{ tipo: string; id: string; endereco: string; erro: string }>;
}

/**
 * Pede ao servidor que geocodifique o que falta.
 *
 * Passa pelo servidor porque a política do OpenStreetMap pede identificação e
 * no máximo 1 requisição por segundo — no navegador, cada aba aberta seria uma
 * fila própria.
 */
export async function geocodificarPendentes(
  tenantId: string,
  opts: { tipo?: TipoDePonto; id?: string; limite?: number; comErro?: boolean } = {}
): Promise<RelatorioDeGeocodificacao> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('sessão expirada');

  const r = await fetch(`/api/v1/mapa/geocodificar?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(opts),
  });
  const json = await r.json();
  if (!r.ok || !json?.ok) throw new Error(json?.error ?? `falhou (${r.status})`);
  return json as RelatorioDeGeocodificacao;
}
