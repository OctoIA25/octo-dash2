/**
 * Mini-mapa com pino arrastável, dentro do formulário (P2.6).
 *
 * Responde a pergunta que o endereço digitado não responde: *o pino caiu no
 * lugar certo?*. Endereço de cadastro brasileiro erra muito — rua sem número,
 * bairro escrito de três jeitos, condomínio sem logradouro — e o mapa só
 * mostra o resultado depois, quando já é tarde.
 *
 * ARRASTOU, MANDOU. A posição arrastada vira `geo_origem = 'manual'` e a
 * geocodificação automática nunca mais a toca. É o que o plano chama de pronto:
 * "pino arrastado não volta para a posição automática".
 *
 * No cadastro NOVO não há pino: o registro ainda não existe para receber a
 * coordenada. O componente diz isso em vez de mostrar um mapa que não salva.
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin } from 'lucide-react';
import { geocodificarPendentes, salvarPino } from '../services/mapaPontosService';
import type { TipoDePonto } from '../utils/mapaPontos';

/** Jundiaí, onde está a maior parte do cadastro. Só enquadra o mapa vazio. */
const CENTRO_PADRAO: [number, number] = [-23.1857, -46.8978];

interface Props {
  tipo: TipoDePonto;
  /** Ausente = cadastro novo: o pino só existe depois de salvar. */
  id?: string | null;
  tenantId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  precisao?: 'exata' | 'aproximada' | null;
  origem?: 'automatica' | 'manual' | null;
  /** Avisa o formulário para ele atualizar o que mostra. */
  aoMover?: (lat: number, lng: number) => void;
}

export function MiniMapaDoEndereco({
  tipo, id, tenantId, latitude, longitude, precisao, origem, aoMover,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const pinoRef = useRef<L.Marker | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(
    typeof latitude === 'number' && typeof longitude === 'number' ? [latitude, longitude] : null
  );
  const [manual, setManual] = useState(origem === 'manual');
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (typeof latitude === 'number' && typeof longitude === 'number') setPos([latitude, longitude]);
  }, [latitude, longitude]);

  useEffect(() => {
    if (!divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current, { attributionControl: false, zoomControl: true }).setView(
      pos ?? CENTRO_PADRAO,
      pos ? 16 : 12
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
    mapaRef.current = mapa;
    // O contêiner nasce com altura zero dentro de um diálogo que ainda está
    // animando; sem isto o Leaflet desenha um mapa cinza de 0px.
    setTimeout(() => mapa.invalidateSize(), 250);
    return () => {
      mapa.remove();
      mapaRef.current = null;
      pinoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !pos) return;
    if (!pinoRef.current) {
      pinoRef.current = L.marker(pos, { draggable: Boolean(id) }).addTo(mapa);
      pinoRef.current.on('dragend', () => {
        const { lat, lng } = pinoRef.current!.getLatLng();
        setPos([lat, lng]);
        setManual(true);
        setAviso(null);
        if (id) {
          salvarPino(tipo, id, lat, lng)
            .then(() => aoMover?.(lat, lng))
            .catch((e) => setAviso(`Não deu para gravar: ${(e as Error).message}`));
        }
      });
    } else {
      pinoRef.current.setLatLng(pos);
    }
    mapa.setView(pos, Math.max(mapa.getZoom(), 16));
  }, [pos, id, tipo, aoMover]);

  const localizar = async () => {
    if (!id || !tenantId) return;
    setBuscando(true);
    setAviso(null);
    try {
      const r = await geocodificarPendentes(tenantId, { tipo, id, comErro: true });
      if (r.achados === 0) {
        setAviso(
          r.falhas[0]?.erro === 'nao_encontrado'
            ? 'O endereço não foi encontrado. Confira rua, número e cidade — ou arraste o pino à mão.'
            : `Não deu para localizar: ${r.falhas[0]?.erro ?? 'sem endereço para buscar'}`
        );
      } else {
        // A rota gravou; recarregar a página do formulário não é necessário —
        // o próximo `latitude`/`longitude` chega pela prop.
        setAviso('Encontrado. Confira o pino e arraste se precisar.');
        aoMover?.(0, 0);
      }
    } catch (e) {
      setAviso(`Não deu para localizar: ${(e as Error).message}`);
    } finally {
      setBuscando(false);
    }
  };

  if (!id) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-[12px] text-slate-500 dark:text-slate-400">
        <MapPin className="h-4 w-4 shrink-0" />
        O pino no mapa é definido depois de salvar, a partir do endereço.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={divRef} className="h-48 w-full overflow-hidden rounded-md border" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        {pos ? (
          <>
            <span>
              {manual
                ? 'Pino posto à mão — a busca automática não mexe mais nele.'
                : precisao === 'aproximada'
                  ? 'Pino aproximado: veio do bairro, não do endereço. Arraste para corrigir.'
                  : 'Arraste o pino para corrigir a posição.'}
            </span>
            <button
              type="button"
              onClick={localizar}
              disabled={buscando}
              className="ml-auto rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50"
            >
              {buscando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buscar de novo pelo endereço'}
            </button>
          </>
        ) : (
          <>
            <span>Ainda sem posição no mapa.</span>
            <button
              type="button"
              onClick={localizar}
              disabled={buscando}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50"
            >
              {buscando && <Loader2 className="h-3 w-3 animate-spin" />}
              Localizar pelo endereço
            </button>
          </>
        )}
      </div>
      {aviso && <p className="text-[11px] text-amber-600 dark:text-amber-400">{aviso}</p>}
    </div>
  );
}
