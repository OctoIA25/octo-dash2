/**
 * Mini-mapa com pino, dentro do formulário (P2.6).
 *
 * Responde a pergunta que o endereço digitado não responde: *o pino caiu no
 * lugar certo?*. Endereço de cadastro brasileiro erra muito — rua sem número,
 * bairro escrito de três jeitos, condomínio sem logradouro — e o mapa só
 * mostra o resultado depois, quando já é tarde.
 *
 * O CORRETOR MARCA (pedido de 02/10): procura a rua, o mapa vai até ela, e ele
 * clica no ponto exato. A busca automática só acha a RUA em Jundiaí — o número
 * quase nunca está no OpenStreetMap —, então o clique é o único pino certeiro.
 *
 * CLICOU, ARRASTOU OU COLOU, MANDOU. A posição posta à mão vira
 * `geo_origem = 'manual'` e a geocodificação automática nunca mais a toca.
 *
 * Com `id`, grava na hora. Sem `id` (cadastro novo), entrega o pino a
 * `aoMarcar` e quem chama grava junto com o registro. Sem `id` e sem
 * `aoMarcar`, não há onde guardar: o componente diz isso em vez de mostrar um
 * mapa que não salva.
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { Loader2, MapPin, Search } from 'lucide-react';
import {
  buscarEnderecos, geocodificarPendentes, lerPino, salvarPino, type CandidatoDeEndereco,
} from '../services/mapaPontosService';
import type { TipoDePonto } from '../utils/mapaPontos';
import { lerCoordenadas } from '../utils/lerCoordenadas';

/** Jundiaí, onde está a maior parte do cadastro. Só enquadra o mapa vazio. */
const CENTRO_PADRAO: [number, number] = [-23.1857, -46.8978];

/**
 * O ícone padrão do Leaflet acha a imagem por um caminho que o bundler quebra:
 * até 02/10 o pino aparecia como imagem quebrada ("Mark") — o conserto só
 * existia na página do Mapa, que o formulário não carrega.
 */
const ICONE_DO_PINO = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
});

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Rua Tiradentes" sozinha acha a do Brasil inteiro; a cidade do cadastro desempata. */
function consultaDaRua(texto: string, cidade?: string | null): string {
  const t = texto.trim();
  const c = cidade?.trim();
  return c && !semAcento(t).includes(semAcento(c)) ? `${t}, ${c}` : t;
}

interface Props {
  tipo: TipoDePonto;
  /** Ausente = cadastro novo: o pino vai por `aoMarcar`. */
  id?: string | null;
  tenantId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  precisao?: 'exata' | 'aproximada' | null;
  origem?: 'automatica' | 'manual' | null;
  /** Cidade do formulário — entra na busca da rua quando a pessoa não diz outra. */
  cidade?: string | null;
  /** Avisa o formulário para ele atualizar o que mostra. */
  aoMover?: (lat: number, lng: number) => void;
  /** Sem `id`: o pino posto à mão fica com quem chama, que o grava junto com o registro. */
  aoMarcar?: (lat: number, lng: number) => void;
}

export function MiniMapaDoEndereco({
  tipo, id, tenantId, latitude, longitude, precisao, origem, cidade, aoMover, aoMarcar,
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
  const [colado, setColado] = useState('');
  const [rua, setRua] = useState('');
  const [procurando, setProcurando] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoDeEndereco[] | null>(null);
  const semOndeGuardar = !id && !aoMarcar;

  useEffect(() => {
    if (typeof latitude === 'number' && typeof longitude === 'number') setPos([latitude, longitude]);
  }, [latitude, longitude]);

  useEffect(() => {
    if (semOndeGuardar || !divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current, { attributionControl: false, zoomControl: true }).setView(
      pos ?? CENTRO_PADRAO,
      pos ? 16 : 12
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapa);
    // O clique no mapa é o pino certeiro: é a pessoa apontando a porta.
    mapa.on('click', (e: L.LeafletMouseEvent) => gravarRef.current(e.latlng.lat, e.latlng.lng));
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
  }, [semOndeGuardar]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !pos) return;
    if (!pinoRef.current) {
      pinoRef.current = L.marker(pos, { draggable: true, icon: ICONE_DO_PINO }).addTo(mapa);
      pinoRef.current.on('dragend', () => {
        const { lat, lng } = pinoRef.current!.getLatLng();
        gravarRef.current(lat, lng);
      });
    } else {
      pinoRef.current.setLatLng(pos);
    }
    // Pino que a pessoa acabou de pôr com um clique já está na tela: recentrar
    // a cada clique faria o mapa "pular" debaixo do mouse.
    if (!mapa.getBounds?.()?.contains(pos)) mapa.setView(pos, Math.max(mapa.getZoom(), 16));
  }, [pos]);

  // Clicar, arrastar e colar coordenada gravam igual: posição posta à mão, exata.
  const gravar = (lat: number, lng: number) => {
    setPos([lat, lng]);
    setManual(true);
    setAviso(null);
    if (id) {
      salvarPino(tipo, id, lat, lng)
        .then(() => aoMover?.(lat, lng))
        .catch((e) => setAviso(`Não deu para gravar: ${(e as Error).message}`));
    } else {
      aoMarcar?.(lat, lng);
    }
  };
  // O mapa e o pino são criados uma vez; os ouvintes leem a versão atual de `gravar`.
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;

  const usarColado = () => {
    const c = lerCoordenadas(colado);
    if (!c) {
      setAviso('Não entendi a coordenada. Cole como o Google Maps copia: -23.18712, -46.88452');
      return;
    }
    setColado('');
    gravar(c[0], c[1]);
  };

  // Leva o mapa até a rua, sem marcar: o resultado é a rua, não a porta.
  const irPara = (c: CandidatoDeEndereco) => {
    setCandidatos(null);
    mapaRef.current?.setView([c.lat, c.lng], 18);
  };

  const procurarRua = async () => {
    if (rua.trim().length < 3) return;
    setProcurando(true);
    setAviso(null);
    setCandidatos(null);
    try {
      const achados = await buscarEnderecos(tenantId, consultaDaRua(rua, cidade));
      if (achados.length === 0) setAviso('Nada encontrado. Tente só o nome da rua, sem o número.');
      else if (achados.length === 1) irPara(achados[0]);
      // Mais de um: a mesma rua tem trechos em bairros diferentes — a pessoa escolhe.
      else setCandidatos(achados);
    } catch (e) {
      setAviso(`Não deu para procurar: ${(e as Error).message}`);
    } finally {
      setProcurando(false);
    }
  };

  const localizar = async () => {
    if (!id || !tenantId) return;
    setBuscando(true);
    setAviso(null);
    try {
      const r = await geocodificarPendentes(tenantId, { tipo, id, comErro: true });
      if (r.achados === 0) {
        setAviso(
          r.falhas[0]?.erro === 'nao_encontrado'
            ? 'O endereço não foi encontrado. Procure a rua acima e clique no ponto exato.'
            : `Não deu para localizar: ${r.falhas[0]?.erro ?? 'sem endereço para buscar'}`
        );
      } else {
        // A rota gravou, mas não devolve a coordenada: lê da linha. Antes
        // esperava a prop mudar — e o formulário do imóvel nunca a mudava.
        const achado = await lerPino(tipo, id);
        if (achado) setPos(achado);
        setAviso('Encontrado. Confira o pino e clique no ponto exato se precisar.');
        aoMover?.(0, 0);
      }
    } catch (e) {
      setAviso(`Não deu para localizar: ${(e as Error).message}`);
    } finally {
      setBuscando(false);
    }
  };

  if (semOndeGuardar) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-[12px] text-slate-500 dark:text-slate-400">
        <MapPin className="h-4 w-4 shrink-0" />
        O pino no mapa é definido depois de salvar, a partir do endereço.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={rua}
          onChange={(e) => setRua(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void procurarRua();
            }
          }}
          placeholder="Marcar eu mesmo: procure a rua (ex.: Rua Tiradentes)"
          aria-label="Procurar a rua no mapa"
          className="h-8 flex-1 rounded-md border bg-background px-2 text-[12px]"
        />
        <button
          type="button"
          onClick={() => void procurarRua()}
          disabled={procurando || rua.trim().length < 3}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
        >
          {procurando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          Procurar
        </button>
      </div>
      {candidatos && (
        <ul className="divide-y rounded-md border text-[11px]">
          {candidatos.map((c) => (
            <li key={`${c.lat},${c.lng}`}>
              <button type="button" onClick={() => irPara(c)} className="w-full px-2 py-1.5 text-left hover:bg-accent">
                {c.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={divRef} className="h-64 w-full cursor-crosshair overflow-hidden rounded-md border" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          {!pos
            ? 'Procure a rua e clique no mapa no ponto exato do imóvel.'
            : manual
              ? 'Pino marcado à mão — a busca automática não mexe mais nele. Clique em outro ponto para mudar.'
              : precisao === 'aproximada'
                ? 'Pino aproximado: caiu na rua ou no bairro, não na porta. Clique no ponto exato do imóvel.'
                : 'Confira o pino. Clique em outro ponto ou arraste para corrigir.'}
        </span>
        {/* Só com o registro salvo, e nunca sobre pino posto à mão: a busca automática não o toca. */}
        {id && !manual && (
          <button
            type="button"
            onClick={localizar}
            disabled={buscando}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50"
          >
            {buscando && <Loader2 className="h-3 w-3 animate-spin" />}
            {pos ? 'Buscar de novo pelo endereço' : 'Localizar pelo endereço'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={colado}
          onChange={(e) => setColado(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              usarColado();
            }
          }}
          placeholder="Ou cole as coordenadas do Google Maps (-23.18712, -46.88452)"
          aria-label="Coordenadas"
          className="h-8 flex-1 rounded-md border bg-background px-2 text-[12px]"
        />
        <button
          type="button"
          onClick={usarColado}
          disabled={!colado.trim()}
          className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
        >
          Usar
        </button>
      </div>
      {pos && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {pos[0].toFixed(6)}, {pos[1].toFixed(6)}
        </p>
      )}
      {aviso && <p className="text-[11px] text-amber-600 dark:text-amber-400">{aviso}</p>}
    </div>
  );
}
