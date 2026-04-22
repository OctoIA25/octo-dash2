/**
 * 🗺️ GEOCODING SERVICE
 *
 * Resolve `{lat, lng}` para um imóvel a partir de múltiplas fontes:
 *  1. XML (lat/lng vindos do feed Kenlo) — direto, sem chamada externa
 *  2. Cache (Supabase `geocoded_addresses`) — evita re-geocodificar
 *  3. ViaCEP → Nominatim (endereço completo via CEP)
 *  4. Nominatim (busca livre por nome do condomínio + cidade/estado)
 *
 * Sempre escreve no cache pra reduzir custo nas próximas execuções.
 *
 * Nominatim tem rate-limit de 1 req/s — usamos uma fila simples.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Imovel } from './kenloService';

export interface GeoCoords {
  lat: number;
  lng: number;
  source: 'xml' | 'viacep' | 'nominatim' | 'cache' | 'manual';
  confidence: 'high' | 'medium' | 'low';
}

interface GeocodedRow {
  cache_key: string;
  latitude: number;
  longitude: number;
  source: 'xml' | 'viacep' | 'nominatim' | 'manual';
  confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Cache local em memória (duração da sessão)
// ---------------------------------------------------------------------------
const memoryCache = new Map<string, GeoCoords | null>();

// ---------------------------------------------------------------------------
// Fila de requests para respeitar rate-limit do Nominatim (1 req/s)
// ---------------------------------------------------------------------------
let nominatimQueue: Promise<unknown> = Promise.resolve();
function enqueueNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const next = nominatimQueue.then(async () => {
    const result = await fn();
    await new Promise((r) => setTimeout(r, 1100));
    return result;
  });
  nominatimQueue = next.catch(() => {});
  return next as Promise<T>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCacheKey(parts: Array<string | undefined | null>): string {
  return parts
    .filter(Boolean)
    .map((p) => (p as string).trim().toLowerCase())
    .join('|');
}

function isValidCoord(lat: number | undefined, lng: number | undefined): boolean {
  if (lat === undefined || lng === undefined) return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Cache no Supabase
// ---------------------------------------------------------------------------
async function readCache(cacheKey: string): Promise<GeoCoords | null> {
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  const { data } = await (supabase as any)
    .from('geocoded_addresses')
    .select('latitude, longitude, source, confidence')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (data && isValidCoord(data.latitude, data.longitude)) {
    const coords: GeoCoords = {
      lat: data.latitude,
      lng: data.longitude,
      source: 'cache',
      confidence: data.confidence ?? 'medium',
    };
    memoryCache.set(cacheKey, coords);
    return coords;
  }
  return null;
}

async function writeCache(
  tenantId: string | null,
  cacheKey: string,
  coords: GeoCoords,
  metadata: {
    condominio_nome?: string;
    endereco?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
  }
): Promise<void> {
  memoryCache.set(cacheKey, coords);
  try {
    await (supabase as any).from('geocoded_addresses').upsert(
      {
        tenant_id: tenantId,
        cache_key: cacheKey,
        condominio_nome: metadata.condominio_nome ?? null,
        endereco: metadata.endereco ?? null,
        bairro: metadata.bairro ?? null,
        cidade: metadata.cidade ?? null,
        estado: metadata.estado ?? null,
        cep: metadata.cep ?? null,
        latitude: coords.lat,
        longitude: coords.lng,
        source: coords.source === 'cache' ? 'manual' : coords.source,
        confidence: coords.confidence,
      },
      { onConflict: 'cache_key' }
    );
  } catch (e) {
    console.warn('[geocoding] erro ao gravar cache:', e);
  }
}

// ---------------------------------------------------------------------------
// Provedores externos
// ---------------------------------------------------------------------------
interface ViaCepResult {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  const cleaned = cep.replace(/\D/g, '');
  if (cleaned.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResult;
    if (data?.erro) return null;
    return data;
  } catch {
    return null;
  }
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  importance?: number;
}

async function nominatimSearch(query: string): Promise<NominatimResult | null> {
  return enqueueNominatim(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(
        query
      )}`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR',
          // Nominatim recomenda User-Agent identificável
          // Browsers não permitem setar User-Agent diretamente — Referer já basta.
        },
      });
      if (!res.ok) return null;
      const list = (await res.json()) as NominatimResult[];
      return list?.[0] ?? null;
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Resolver coordenadas para um imóvel
// ---------------------------------------------------------------------------
export async function resolveImovelCoords(
  imovel: Imovel,
  tenantId: string | null
): Promise<GeoCoords | null> {
  // 1. Lat/lng diretos do XML
  if (isValidCoord(imovel.latitude, imovel.longitude)) {
    return {
      lat: imovel.latitude!,
      lng: imovel.longitude!,
      source: 'xml',
      confidence: 'high',
    };
  }

  // Construir chaves de cache (várias chances de hit)
  const candidateKeys: string[] = [];
  if (imovel.nome_condominio && imovel.cidade) {
    candidateKeys.push(makeCacheKey(['condo', imovel.nome_condominio, imovel.cidade, imovel.estado]));
  }
  if (imovel.cep) candidateKeys.push(makeCacheKey(['cep', imovel.cep, imovel.numero]));
  if (imovel.endereco && imovel.cidade) {
    candidateKeys.push(makeCacheKey(['addr', imovel.endereco, imovel.numero, imovel.cidade, imovel.estado]));
  }

  // 2. Cache hit
  for (const key of candidateKeys) {
    const cached = await readCache(key);
    if (cached) return cached;
  }

  const metadata = {
    condominio_nome: imovel.nome_condominio,
    endereco: imovel.endereco,
    bairro: imovel.bairro,
    cidade: imovel.cidade,
    estado: imovel.estado,
    cep: imovel.cep,
  };

  // 3. ViaCEP → completa endereço → Nominatim
  if (imovel.cep) {
    const cep = await fetchViaCep(imovel.cep);
    if (cep) {
      const enrichedAddr =
        [cep.logradouro, imovel.numero, cep.bairro, cep.localidade, cep.uf].filter(Boolean).join(', ');
      if (enrichedAddr) {
        const result = await nominatimSearch(enrichedAddr);
        if (result) {
          const coords: GeoCoords = {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            source: 'viacep',
            confidence: 'high',
          };
          if (isValidCoord(coords.lat, coords.lng)) {
            const key = makeCacheKey(['cep', imovel.cep, imovel.numero]);
            await writeCache(tenantId, key, coords, metadata);
            return coords;
          }
        }
      }
    }
  }

  // 4. Nominatim por nome do condomínio
  if (imovel.nome_condominio && imovel.cidade) {
    const query = `${imovel.nome_condominio}, ${imovel.bairro}, ${imovel.cidade}, ${imovel.estado}, Brasil`;
    const result = await nominatimSearch(query);
    if (result) {
      const coords: GeoCoords = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        source: 'nominatim',
        confidence: 'medium',
      };
      if (isValidCoord(coords.lat, coords.lng)) {
        const key = makeCacheKey(['condo', imovel.nome_condominio, imovel.cidade, imovel.estado]);
        await writeCache(tenantId, key, coords, metadata);
        return coords;
      }
    }
  }

  // 5. Último fallback — bairro/cidade (centro aproximado)
  if (imovel.bairro && imovel.cidade) {
    const query = `${imovel.bairro}, ${imovel.cidade}, ${imovel.estado}, Brasil`;
    const result = await nominatimSearch(query);
    if (result) {
      const coords: GeoCoords = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        source: 'nominatim',
        confidence: 'low',
      };
      if (isValidCoord(coords.lat, coords.lng)) {
        const key = makeCacheKey(['bairro', imovel.bairro, imovel.cidade, imovel.estado]);
        await writeCache(tenantId, key, coords, metadata);
        return coords;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Persistência por imóvel (imoveis_geolocalizacao)
// ---------------------------------------------------------------------------

/**
 * Carrega TODAS as coordenadas resolvidas do tenant de uma vez.
 * Chamado na abertura do mapa — permite renderizar todos os pins
 * imediatamente sem geocodificar nada.
 */
export async function loadTenantGeoCache(tenantId: string): Promise<Map<string, GeoCoords>> {
  const result = new Map<string, GeoCoords>();
  try {
    const { data, error } = await (supabase as any)
      .from('imoveis_geolocalizacao')
      .select('referencia, latitude, longitude, source, confidence')
      .eq('tenant_id', tenantId)
      .eq('geo_status', 'resolved');

    if (error) {
      console.warn('[geocoding] loadTenantGeoCache error:', error.message);
      return result;
    }

    for (const row of data ?? []) {
      if (isValidCoord(row.latitude, row.longitude)) {
        result.set(row.referencia, {
          lat: row.latitude,
          lng: row.longitude,
          source: row.source ?? 'cache',
          confidence: row.confidence ?? 'low',
        });
        // Preenche também o memoryCache para evitar re-consulta
        const key = `ref:${tenantId}:${row.referencia}`;
        memoryCache.set(key, result.get(row.referencia)!);
      }
    }
  } catch (e) {
    console.warn('[geocoding] loadTenantGeoCache failed:', e);
  }
  return result;
}

type ImovelMeta = {
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  nome_condominio?: string | null;
};

/**
 * Salva em lote as coordenadas resolvidas no banco.
 * Chamado após geocodificar — persiste para carregamento instantâneo
 * nas próximas visitas.
 */
export async function batchSaveGeoResults(
  tenantId: string,
  results: Map<string, GeoCoords>,
  metaMap: Map<string, ImovelMeta>
): Promise<void> {
  if (results.size === 0) return;

  const rows: object[] = [];
  for (const [referencia, coords] of results) {
    const meta = metaMap.get(referencia) ?? {};
    rows.push({
      tenant_id: tenantId,
      referencia,
      latitude: coords.lat,
      longitude: coords.lng,
      geo_status: 'resolved',
      source: coords.source === 'cache' ? 'nominatim' : coords.source,
      confidence: coords.confidence,
      cep: meta.cep ?? null,
      endereco: meta.endereco ?? null,
      numero: meta.numero ?? null,
      bairro: meta.bairro ?? null,
      cidade: meta.cidade ?? null,
      estado: meta.estado ?? null,
      nome_condominio: meta.nome_condominio ?? null,
      tentativas: 1,
      ultima_tentativa: new Date().toISOString(),
    });
  }

  // Insere em lotes de 200 para não estourar o limite do Supabase
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      await (supabase as any)
        .from('imoveis_geolocalizacao')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'tenant_id,referencia' });
    } catch (e) {
      console.warn('[geocoding] batchSaveGeoResults partial error:', e);
    }
  }
}

/**
 * Registra imóveis SEM coordenadas como 'pending' no banco.
 * Preserva os metadados do XML (CEP, endereço, bairro, etc.) para
 * que uma rotina futura consiga tentar a geocodificação por outros parâmetros.
 * Usa ignoreDuplicates=true para não sobrescrever entradas já 'resolved'.
 */
export async function batchSavePending(tenantId: string, imoveis: Imovel[]): Promise<void> {
  if (imoveis.length === 0) return;

  const rows = imoveis.map((i) => ({
    tenant_id: tenantId,
    referencia: i.referencia,
    geo_status: 'pending',
    cep: i.cep ?? null,
    endereco: i.endereco ?? null,
    numero: i.numero ?? null,
    bairro: i.bairro ?? null,
    cidade: i.cidade ?? null,
    estado: i.estado ?? null,
    nome_condominio: i.nome_condominio ?? null,
  }));

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      await (supabase as any)
        .from('imoveis_geolocalizacao')
        .upsert(rows.slice(i, i + BATCH), {
          onConflict: 'tenant_id,referencia',
          ignoreDuplicates: true, // não sobrescreve 'resolved'
        });
    } catch (e) {
      console.warn('[geocoding] batchSavePending partial error:', e);
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Pequeno jitter aleatório (~80m) para que vários imóveis no mesmo bairro
 * não fiquem empilhados no mesmo pixel.
 */
function jitter(coord: number) {
  return coord + (Math.random() - 0.5) * 0.0015;
}

/**
 * Processa um lote AGRUPANDO por bairro+cidade+estado.
 * Em vez de geocodificar 500 imóveis (= 500 requests), geocodifica
 * apenas os bairros únicos (ex: 15 requests) e replica o resultado para
 * todos os imóveis daquele bairro com um pequeno jitter pra não empilhar.
 *
 * Isso reduz 9 minutos para ~15 segundos.
 */
export async function resolveImoveisBatch(
  imoveis: Imovel[],
  tenantId: string | null,
  onProgress?: (current: number, total: number) => void,
  onGroupResolved?: (batch: Map<string, GeoCoords>) => void
): Promise<Map<string, GeoCoords>> {
  const out = new Map<string, GeoCoords>();

  // 1) Agrupa por (bairro|cidade|estado)
  const groups = new Map<string, Imovel[]>();
  for (const i of imoveis) {
    if (!i.bairro || !i.cidade) continue;
    const key = makeCacheKey(['bairro', i.bairro, i.cidade, i.estado]);
    const arr = groups.get(key) ?? [];
    arr.push(i);
    groups.set(key, arr);
  }

  const groupKeys = Array.from(groups.keys());
  let processed = 0;
  const totalImoveis = imoveis.length;

  // 2) Resolve cada bairro UMA VEZ (cache + Nominatim)
  for (const groupKey of groupKeys) {
    const groupImoveis = groups.get(groupKey)!;
    const sample = groupImoveis[0];

    // 2a) tenta cache do bairro
    let baseCoords = await readCache(groupKey);

    // 2b) sem cache → Nominatim
    if (!baseCoords) {
      const query = `${sample.bairro}, ${sample.cidade}, ${sample.estado}, Brasil`;
      const result = await nominatimSearch(query);
      if (result) {
        const coords: GeoCoords = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          source: 'nominatim',
          confidence: 'low',
        };
        if (isValidCoord(coords.lat, coords.lng)) {
          await writeCache(tenantId, groupKey, coords, {
            bairro: sample.bairro,
            cidade: sample.cidade,
            estado: sample.estado,
          });
          baseCoords = coords;
        }
      }
    }

    // 3) Replica nos imóveis do grupo (com jitter) e emite batch imediatamente
    if (baseCoords) {
      const batchResult = new Map<string, GeoCoords>();
      for (const imovel of groupImoveis) {
        const coords: GeoCoords = {
          lat: jitter(baseCoords.lat),
          lng: jitter(baseCoords.lng),
          source: baseCoords.source,
          confidence: 'low',
        };
        out.set(imovel.referencia, coords);
        batchResult.set(imovel.referencia, coords);
      }
      onGroupResolved?.(batchResult);
    }
    processed += groupImoveis.length;
    onProgress?.(processed, totalImoveis);
  }

  return out;
}
