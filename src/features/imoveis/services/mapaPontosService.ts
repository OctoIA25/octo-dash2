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

/** A posição gravada agora — depois de "Localizar", que grava no servidor e não devolve a coordenada. */
export async function lerPino(tipo: TipoDePonto, id: string): Promise<[number, number] | null> {
  const tabela = TABELA_DO_TIPO[tipo];
  if (!tabela) throw new Error('tipo inválido');
  const { data, error } = await supabase.from(tabela).select('latitude, longitude').eq('id', id).maybeSingle();
  if (error) throw error;
  return data && typeof data.latitude === 'number' && typeof data.longitude === 'number'
    ? [data.latitude, data.longitude]
    : null;
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

export interface CandidatoDeEndereco {
  lat: number;
  lng: number;
  nome: string;
  /** O OSM achou a rua, não a porta: falta o clique no ponto exato. */
  aproximado: boolean;
}

/**
 * A rua que o corretor procura no mini-mapa. Passa pelo servidor pelo mesmo
 * motivo da geocodificação: uma fila só para o OpenStreetMap. Não grava nada.
 */
export async function buscarEnderecos(tenantId: string | null | undefined, texto: string): Promise<CandidatoDeEndereco[]> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('sessão expirada');

  const params = new URLSearchParams({ q: texto });
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);
  const r = await fetch(`/api/v1/mapa/buscar?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) throw new Error(json?.error ?? `falhou (${r.status})`);
  return json.candidatos as CandidatoDeEndereco[];
}
