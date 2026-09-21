/**
 * Os pinos de lançamento, condomínio e imóvel — agrupados por proximidade (P2.6).
 *
 * `leaflet.markercluster` já estava no `package.json` e NUNCA tinha sido usado:
 * o cabeçalho do Mapa dizia "renderiza pins clusterizados" e não havia import.
 * Com os três tipos juntos são 175 pinos só na Lotus, e sem agrupar o mapa da
 * cidade vira uma mancha.
 *
 * Os marcadores são criados na mão, e não por componente React, porque o
 * `markerClusterGroup` gerencia a camada por conta própria — misturar os dois
 * faz o React remontar pinos que o cluster acabou de posicionar.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { COR_DO_TIPO, linhasDoCard, type PontoDoMapa, type TipoDePonto } from '../utils/mapaPontos';

/** Escapa o que vem do cadastro: o popup é HTML montado à mão. */
function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function icone(tipo: TipoDePonto, aproximado: boolean): L.DivIcon {
  const cor = COR_DO_TIPO[tipo];
  return L.divIcon({
    className: 'ponto-do-mapa',
    html: `<div style="
      background:${cor};
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid white;
      ${aproximado ? 'border-style:dashed;opacity:.75;' : ''}
      box-shadow:0 3px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
}

/** O card que o plano pede: foto, nome/código, "a partir de", bairro e link. */
function cardDoPino(p: PontoDoMapa): string {
  const foto = p.foto
    ? `<img src="${escapar(p.foto)}" alt="" style="width:100%;height:96px;object-fit:cover;border-radius:6px;margin-bottom:6px" />`
    : '';
  const linhas = linhasDoCard(p)
    .map((l) => `<div style="font-size:11px;color:#475569">${escapar(l)}</div>`)
    .join('');
  const link = p.link
    ? `<a href="${escapar(p.link)}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:600;color:#2563eb">Abrir cadastro →</a>`
    : '';
  return `<div style="min-width:180px;max-width:220px">
    ${foto}
    <div style="font-weight:600;font-size:12px;margin-bottom:2px">${escapar(p.nome ?? 'sem nome')}</div>
    ${linhas}${link}
  </div>`;
}

interface Props {
  pontos: PontoDoMapa[];
  /** Quando presente, o pino pode ser arrastado e a posição nova é gravada. */
  aoArrastar?: (p: PontoDoMapa, lat: number, lng: number) => void;
}

export function PinosDoMapa({ pontos, aoArrastar }: Props) {
  const map = useMap();
  const grupoRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const grupo = L.markerClusterGroup({
      // Perto do zoom máximo o agrupamento atrapalha: o gestor quer ver o
      // prédio, não uma bolinha dizendo "3".
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    });
    grupoRef.current = grupo;
    map.addLayer(grupo);
    return () => {
      map.removeLayer(grupo);
      grupoRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;
    grupo.clearLayers();

    for (const p of pontos) {
      if (p.latitude == null || p.longitude == null) continue;
      const marcador = L.marker([p.latitude, p.longitude], {
        icon: icone(p.tipo, p.geo_precisao === 'aproximada'),
        draggable: Boolean(aoArrastar),
        title: p.nome ?? undefined,
      });
      marcador.bindPopup(cardDoPino(p));
      if (aoArrastar) {
        marcador.on('dragend', () => {
          const { lat, lng } = marcador.getLatLng();
          aoArrastar(p, lat, lng);
        });
      }
      grupo.addLayer(marcador);
    }
  }, [pontos, aoArrastar]);

  return null;
}
