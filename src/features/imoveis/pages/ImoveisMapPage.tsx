/**
 * 🗺️ Mapa de Imóveis — Leaflet + OpenStreetMap
 *
 * Carregado lazy (não pesa o resto do app). Resolve coordenadas de cada
 * imóvel via cadeia de fallback (XML → cache → ViaCEP → Nominatim).
 *
 * P2.6 — o mapa passou a ser INTERLIGADO: além dos imóveis, mostra lançamentos
 * e condomínios, com coordenada gravada na linha de cada um (`mapa_pontos`).
 * O agrupamento de pinos, que este cabeçalho prometia desde sempre e não
 * existia — `leaflet.markercluster` estava instalado e sem um único import —
 * agora existe, em PinosDoMapa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  resolveImoveisBatch,
  loadTenantGeoCache,
  batchSaveGeoResults,
  batchSavePending,
} from '../services/geocodingService';
import { fetchMyMapsMid } from '../services/imoveisXmlService';
import type { Imovel } from '../services/kenloService';
import type { GeoCoords } from '../services/geocodingService';
import { ImoveisMapHeaderFilters } from '../components/ImoveisMapHeaderFilters';
import { PinosDoMapa } from '../components/PinosDoMapa';
import { carregarPontos, salvarPino } from '../services/mapaPontosService';
import {
  COR_DO_TIPO, ROTULO_DO_TIPO, contar, filtrarPontos, textoDoContador,
  type PontoDoMapa, type TipoDePonto, type TotaisDoMapa,
} from '../utils/mapaPontos';

// Fix dos ícones default do Leaflet ao usar com bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Ícone customizado por tipo (pin grande estilo Google Maps)
const makeIcon = (color: string) =>
  L.divIcon({
    className: 'custom-pin',
    html: `<div style="
      background:${color};
      width:42px;height:42px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid white;
      box-shadow:0 4px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    "><div style="
      width:16px;height:16px;border-radius:50%;background:white;
      transform:rotate(45deg);
    "></div></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -42],
  });

const ICON_BY_TIPO: Record<string, L.DivIcon> = {
  apartamento: makeIcon('#2563eb'), // azul
  casa: makeIcon('#16a34a'), // verde
  terreno: makeIcon('#ca8a04'), // amarelo escuro
  comercial: makeIcon('#9333ea'), // roxo
  rural: makeIcon('#65a30d'), // verde escuro
  outro: makeIcon('#64748b'), // cinza
};

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

function ImovelMarker({ imovel, coords }: { imovel: Imovel; coords: GeoCoords }) {
  const icon = ICON_BY_TIPO[imovel.tipoSimplificado] || ICON_BY_TIPO.outro;
  const valor =
    imovel.finalidade === 'venda' || imovel.finalidade === 'venda_locacao'
      ? imovel.valor_venda
      : imovel.valor_locacao;
  const finalidadeLabel = imovel.finalidade === 'locacao' ? 'Locação' : 'Venda';
  const sourceLabel =
    coords.source === 'xml'
      ? '📍 GPS exato'
      : coords.source === 'cache'
      ? '🗂 Cache'
      : coords.source === 'viacep'
      ? '📮 Via CEP'
      : '🔍 Aproximado';

  return (
    <Marker position={[coords.lat, coords.lng]} icon={icon}>
      <Popup maxWidth={260}>
        <div style={{ minWidth: 220, fontFamily: 'inherit' }}>
          {imovel.fotos?.[0] && (
            <img
              src={imovel.fotos[0]}
              alt=""
              style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
            />
          )}
          <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
            {imovel.titulo || imovel.referencia}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
            {imovel.bairro} · {imovel.cidade}/{imovel.estado}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#475569', marginBottom: 6 }}>
            {imovel.quartos ? <span>🛏 {imovel.quartos}</span> : null}
            {imovel.banheiro ? <span>🚿 {imovel.banheiro}</span> : null}
            {imovel.garagem ? <span>🚗 {imovel.garagem}</span> : null}
            {imovel.area_util ? <span>📐 {imovel.area_util}m²</span> : null}
          </div>
          <div style={{ fontWeight: 700, color: '#1a5276', fontSize: 14 }}>
            {valor > 0 ? formatBRL(valor) : 'Sob consulta'}
            <span style={{ fontWeight: 400, color: '#64748b', fontSize: 11 }}> · {finalidadeLabel}</span>
          </div>
          <a
            href={`/imovel/${encodeURIComponent(imovel.referencia)}`}
            style={{
              display: 'block',
              marginTop: 8,
              textAlign: 'center',
              padding: '6px 0',
              background: '#1a5276',
              color: 'white',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Ver detalhes →
          </a>
          <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
            {sourceLabel}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// Centro padrão (São Paulo)
const DEFAULT_CENTER: [number, number] = [-23.55, -46.633];

// Mapa curado no Google My Maps (regiões/pins desenhados à mão pela imobiliária).
// O mid vem de tenant_xml_config.my_maps_mid — cada imobiliária tem o seu, e sem
// mid cadastrado o alternador nem aparece. Exige o mapa compartilhado como
// "qualquer pessoa com o link".

interface ImoveisMapPageProps {
  /**
   * O catálogo do tenant (XML + `imoveis_locais`, rascunho de fora), vindo da
   * ImoveisPage — o Mapa é uma ABA dela, e ela já fez esse merge.
   *
   * Antes esta tela lia só o catálogo XML por conta própria. Medido em
   * 18/09/2026: a Lotus Brokers tem `tenant_xml_config.xml_url` vazio e
   * `backup_data` nulo, então a lista chegava vazia e o rodapé dizia "0 de 0
   * imóveis no mapa" — por falta de imóvel, não de coordenada. Os 27 imóveis
   * dela estão em `imoveis_locais`, que esta tela não consultava.
   *
   * Recebe por prop, e não busca sozinha, porque baixar de novo o que a
   * página-mãe já tem em memória custaria 223 KB na Lotus e uma segunda
   * leitura do `backup_data` de 2,86 MB na Imobiliária Japi.
   */
  imoveis: Imovel[];
  isLoading: boolean;
}

export default function ImoveisMapPage({ imoveis, isLoading }: ImoveisMapPageProps) {
  const { tenantId } = useAuth();
  const [searchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const tipoFiltro = searchParams.get('tipo') ?? 'todos';
  const finalidadeFiltro = searchParams.get('finalidade') ?? 'todas';

  const [modo, setModo] = useState<'imoveis' | 'curado'>('imoveis');
  // Os três tipos ligados por padrão: o item se chama "mapa interligado", e
  // abrir mostrando só um deles esconderia justamente o que ele entrega.
  const [tiposLigados, setTiposLigados] = useState<Set<TipoDePonto>>(
    () => new Set<TipoDePonto>(['lancamento', 'condominio', 'imovel'])
  );
  const [pontos, setPontos] = useState<PontoDoMapa[]>([]);
  const [totais, setTotais] = useState<TotaisDoMapa | null>(null);
  const [myMapsMid, setMyMapsMid] = useState<string | null>(null);
  const [coordsByRef, setCoordsByRef] = useState<Map<string, GeoCoords>>(new Map());
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Indica que o carregamento inicial do BD terminou — só aí o geocoding pode rodar
  const [dbLoaded, setDbLoaded] = useState(false);

  // Carrega coordenadas persistidas do banco — renderiza todos os pins de uma vez
  useEffect(() => {
    if (!tenantId) {
      setDbLoaded(true);
      return;
    }
    loadTenantGeoCache(tenantId).then((dbCoords) => {
      if (dbCoords.size > 0) {
        setCoordsByRef((prev) => {
          const next = new Map(prev);
          dbCoords.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
      setDbLoaded(true); // libera o geocoding apenas após o BD ser consultado
    });
  }, [tenantId]);

  // Os pontos dos três tipos, com a coordenada gravada em cada linha.
  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    let cancelado = false;
    carregarPontos(tenantId)
      .then((r) => {
        if (cancelado || !r) return;
        setPontos(r.pontos ?? []);
        setTotais(r.totais ?? null);
      })
      .catch((e) => console.error('[mapa] não deu para ler os pontos:', e?.message));
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  // Mapa curado do tenant (opcional)
  useEffect(() => {
    if (!tenantId) return;
    fetchMyMapsMid(tenantId).then(setMyMapsMid);
  }, [tenantId]);

  // Filtragem antes de geocodificar (otimização)
  const imoveisFiltrados = useMemo(() => {
    return imoveis.filter((i) => {
      if (tipoFiltro !== 'todos' && i.tipoSimplificado !== tipoFiltro) return false;
      if (finalidadeFiltro !== 'todas') {
        if (finalidadeFiltro === 'venda' && i.finalidade === 'locacao') return false;
        if (finalidadeFiltro === 'locacao' && i.finalidade === 'venda') return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${i.titulo} ${i.bairro} ${i.cidade} ${i.referencia} ${i.nome_condominio ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [imoveis, search, tipoFiltro, finalidadeFiltro]);

  // Pins aparecem progressivamente conforme coordenadas são resolvidas
  const markers = useMemo(() => {
    const out: Array<{ imovel: Imovel; coords: GeoCoords }> = [];
    for (const i of imoveisFiltrados) {
      const c = coordsByRef.get(i.referencia);
      if (c) out.push({ imovel: i, coords: c });
    }
    return out;
  }, [imoveisFiltrados, coordsByRef]);

  // A coordenada gravada na LINHA do imóvel vence o cache de endereço: se
  // alguém arrastou o pino, é ela que vale. Sem esta precedência, o cache —
  // que é por endereço, e portanto compartilhado entre imóveis do mesmo
  // prédio — devolveria o pino para a posição automática na recarga seguinte.
  useEffect(() => {
    const doBanco = pontos.filter((p) => p.tipo === 'imovel' && p.ref && p.latitude != null);
    if (doBanco.length === 0) return;
    setCoordsByRef((prev) => {
      const next = new Map(prev);
      for (const p of doBanco) {
        next.set(p.ref as string, {
          lat: p.latitude as number,
          lng: p.longitude as number,
          source: p.geo_origem === 'manual' ? 'manual' : 'cache',
          confidence: p.geo_precisao === 'aproximada' ? 'low' : 'high',
        });
      }
      return next;
    });
  }, [pontos]);

  // Lançamentos e condomínios: pinos próprios, que não passam pela lista de
  // imóveis. Os imóveis continuam vindo por `markers`, já com a precedência
  // acima aplicada.
  const pontosVisiveis = useMemo(
    () => filtrarPontos(pontos.filter((p) => p.tipo !== 'imovel'), { tipos: tiposLigados, busca: search }),
    [pontos, tiposLigados, search]
  );

  const contagem = useMemo(
    () => contar(totais, tiposLigados, [
      ...pontosVisiveis,
      ...(tiposLigados.has('imovel') ? pontos.filter((p) => p.tipo === 'imovel' && p.latitude != null) : []),
    ]),
    [totais, tiposLigados, pontosVisiveis, pontos]
  );

  const arrastarPino = useCallback(
    (p: PontoDoMapa, lat: number, lng: number) => {
      salvarPino(p.tipo, p.id, lat, lng)
        .then(() =>
          setPontos((antes) =>
            antes.map((x) =>
              x.id === p.id && x.tipo === p.tipo
                ? { ...x, latitude: lat, longitude: lng, geo_origem: 'manual', geo_precisao: 'exata' }
                : x
            )
          )
        )
        .catch((e) => console.error('[mapa] não deu para gravar o pino:', e?.message));
    },
    []
  );

  // 1) XML — coordenadas válidas aparecem INSTANTANEAMENTE (síncrono)
  useEffect(() => {
    setCoordsByRef((prev) => {
      const next = new Map(prev);
      let added = 0;
      for (const i of imoveisFiltrados) {
        if (next.has(i.referencia)) continue;
        const lat = i.latitude;
        const lng = i.longitude;
        const valid =
          typeof lat === 'number' && typeof lng === 'number' &&
          !Number.isNaN(lat) && !Number.isNaN(lng) &&
          !(lat === 0 && lng === 0) &&
          lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        if (valid) {
          next.set(i.referencia, { lat: lat!, lng: lng!, source: 'xml', confidence: 'high' });
          added++;
        }
      }
      if (added === 0) return prev;
      return next;
    });
  }, [imoveisFiltrados]);

  // 2) Background — só geocodifica os SEM lat/lng (ou 0,0), após o BD ser carregado
  useEffect(() => {
    if (!dbLoaded) return; // aguarda o cache do BD antes de geocodificar
    let cancelled = false;
    const semCoords = imoveisFiltrados.filter((i) => !coordsByRef.has(i.referencia));
    if (semCoords.length === 0) {
      setIsGeocoding(false);
      return;
    }

    setIsGeocoding(true);
    setProgress({ current: 0, total: semCoords.length });

    // Salva imóveis sem coords como 'pending' para resolução futura
    if (tenantId) {
      batchSavePending(tenantId, semCoords);
    }

    // Mapa de metadados para persistir junto às coordenadas resolvidas
    const metaMap = new Map(
      semCoords.map((i) => [
        i.referencia,
        { cep: i.cep, endereco: i.endereco, numero: i.numero, bairro: i.bairro, cidade: i.cidade, estado: i.estado, nome_condominio: i.nome_condominio },
      ])
    );

    (async () => {
      const allResolved = new Map<string, GeoCoords>();

      await resolveImoveisBatch(
        semCoords,
        tenantId ?? null,
        (current, total) => {
          if (!cancelled) setProgress({ current, total });
        },
        (batch) => {
          if (!cancelled) {
            batch.forEach((v, k) => allResolved.set(k, v));
            setCoordsByRef((prev) => {
              const next = new Map(prev);
              batch.forEach((v, k) => next.set(k, v));
              return next;
            });
          }
        }
      );
      if (cancelled) return;

      // Persiste tudo que foi resolvido para carregamento instantâneo na próxima visita
      if (tenantId && allResolved.size > 0) {
        batchSaveGeoResults(tenantId, allResolved, metaMap);
      }

      setIsGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoaded, imoveisFiltrados.length, tenantId]);

  const center = useMemo<[number, number]>(() => {
    if (markers.length > 0) {
      return [markers[0].coords.lat, markers[0].coords.lng];
    }
    return DEFAULT_CENTER;
  }, [markers]);

  const totalPendentes = imoveisFiltrados.length - markers.length;
  const mostrandoCurado = modo === 'curado' && Boolean(myMapsMid);

  return (
    <div className="w-full h-[calc(100vh-56px)] flex flex-col">
      {/* Barra de filtros do mapa (no corpo, para não cobrir as abas do header) */}
      <div className="shrink-0 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        {!mostrandoCurado ? (
          <ImoveisMapHeaderFilters />
        ) : (
          <span className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            Mapa curado
          </span>
        )}

        {!mostrandoCurado && (
          <div className="shrink-0 flex gap-1">
            {(['lancamento', 'condominio', 'imovel'] as TipoDePonto[]).map((t) => {
              const ligado = tiposLigados.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTiposLigados((antes) => {
                      const proximo = new Set(antes);
                      if (proximo.has(t)) proximo.delete(t);
                      else proximo.add(t);
                      return proximo;
                    })
                  }
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                    ligado
                      ? 'border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
                      : 'border-slate-200 text-slate-400 dark:border-slate-800'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: ligado ? COR_DO_TIPO[t] : 'transparent', border: `1.5px solid ${COR_DO_TIPO[t]}` }}
                  />
                  {ROTULO_DO_TIPO[t]}
                </button>
              );
            })}
          </div>
        )}

        {myMapsMid && (
        <div className="shrink-0 flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(['imoveis', 'curado'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`px-2.5 py-1 text-[12px] rounded-md transition-colors ${
                modo === m
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {m === 'imoveis' ? 'Imóveis' : 'Curado'}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Mapa */}
      <div className="flex-1 relative bg-slate-100 dark:bg-slate-950">
        {mostrandoCurado ? (
          <iframe
            title="Mapa curado"
            src={`https://www.google.com/maps/d/embed?mid=${encodeURIComponent(myMapsMid)}&ehbc=2E312F`}
            style={{ height: '100%', width: '100%', border: 0 }}
            allowFullScreen
          />
        ) : isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carregando imóveis…
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={11}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {tiposLigados.has('imovel') &&
              markers.map(({ imovel, coords }) => (
                <ImovelMarker key={imovel.referencia} imovel={imovel} coords={coords} />
              ))}
            {/* Lançamentos e condomínios, agrupados por proximidade. O pino é
                arrastável aqui também: é onde o gestor VÊ que está errado. */}
            <PinosDoMapa pontos={pontosVisiveis} aoArrastar={arrastarPino} />
          </MapContainer>
        )}

        {/* Badge de progresso não-bloqueante */}
        {!mostrandoCurado && isGeocoding && (
          <div className="absolute top-3 right-3 z-[1001] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow px-3 py-1.5 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />
            Localizando {progress.current}/{progress.total}…
          </div>
        )}

        {!mostrandoCurado && (
          <>
        {/* Legenda */}
        <div className="absolute bottom-4 left-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-3 text-[11px] z-[1000]">
          <div className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Legenda</div>
          <div className="space-y-1">
            {(['lancamento', 'condominio', 'imovel'] as TipoDePonto[]).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: COR_DO_TIPO[t] }} />
                {ROTULO_DO_TIPO[t]}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 text-slate-500 dark:text-slate-400">
              <span className="w-3 h-3 rounded-full border-2 border-dashed border-slate-400" />
              Pino aproximado (bairro)
            </div>
          </div>
        </div>

        {/* Contagem de imóveis */}
        <div className="absolute bottom-4 right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow px-3 py-1.5 text-[11px] z-[1000] text-slate-600 dark:text-slate-300">
          {/* A frase separa quem NUNCA vai aparecer (sem endereço) de quem
              ainda não foi geocodificado — senão o gestor espera pinos que não
              existem. Na Lotus são 18 lançamentos sem endereço nenhum. */}
          {textoDoContador(contagem)}
          {isGeocoding && <span className="ml-1 text-blue-600 dark:text-blue-400">· processando…</span>}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
