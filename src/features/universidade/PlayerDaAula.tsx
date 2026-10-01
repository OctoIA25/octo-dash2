/**
 * A.7 · O player da aula — o YouTube (vídeo não listado da casa) pela API
 * oficial, para medir o que tocou. Uma leitura por segundo enquanto toca; a
 * cada 10 s, ao pausar e ao sair, o total vai para o banco, que confere pelo
 * relógio e marca a aula concluída aos 90%.
 */
import { useEffect, useRef, useState } from 'react';
import { comecar, lerPosicao, pausar, percentual, type Assistido } from './assistido';
import { carregarYouTube, type YTPlayer } from './youtube';
import { registrarProgresso, type Aula } from './universidadeService';

const ENVIO_A_CADA_MS = 10_000;

export function PlayerDaAula({ aula, onRegistrou }: { aula: Aula; onRegistrou: (r: { segundos_vistos: number; concluida: boolean }) => void }) {
  const alvo = useRef<HTMLDivElement>(null);
  const assistido = useRef<Assistido>(comecar(aula.segundos_vistos));
  const [vistos, setVistos] = useState(aula.segundos_vistos);
  const [concluida, setConcluida] = useState(aula.concluida);
  const [falhou, setFalhou] = useState(false);
  const avisar = useRef(onRegistrou);
  avisar.current = onRegistrou;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let leitura: ReturnType<typeof setInterval> | null = null;
    let envio: ReturnType<typeof setInterval> | null = null;
    let enviado = assistido.current.total;
    let vivo = true;

    const enviar = () => {
      const total = assistido.current.total;
      if (Math.floor(total) <= Math.floor(enviado)) return;
      enviado = total;
      registrarProgresso(aula.id, total)
        .then((r) => {
          if (!vivo) return;
          setVistos(r.segundos_vistos);
          setConcluida(r.concluida);
          avisar.current(r);
        })
        .catch(() => { if (vivo) setFalhou(true); });
    };
    const parar = () => {
      if (leitura) clearInterval(leitura);
      if (envio) clearInterval(envio);
      leitura = envio = null;
      assistido.current = pausar(assistido.current);
      enviar();
    };

    carregarYouTube().then((YT) => {
      if (!vivo || !alvo.current) return;
      player = new YT.Player(alvo.current, {
        videoId: aula.youtube_id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              if (leitura) return;
              leitura = setInterval(() => {
                if (player) assistido.current = lerPosicao(assistido.current, player.getCurrentTime());
              }, 1000);
              envio = setInterval(enviar, ENVIO_A_CADA_MS);
            } else {
              parar();
            }
          },
        },
      });
    });

    return () => {
      parar();
      vivo = false;
      player?.destroy();
    };
  }, [aula.id, aula.youtube_id]);

  const pct = percentual(vistos, aula.duracao_seg);
  return (
    <div className="space-y-2">
      <div className="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black">
        <div ref={alvo} className="h-full w-full" />
      </div>
      <div className="flex items-center gap-2 text-[12.5px]">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-label={`${pct}% assistido`}>
          <div className={`h-full ${concluida ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">{concluida ? 'Concluída ✓' : `${pct}% assistido`}</span>
      </div>
      <p className="text-[12px] text-slate-500">Conta o que o vídeo tocou: pular para o fim não conclui. A aula conclui com 90% assistidos.</p>
      {falhou && <p role="alert" className="text-[12px] text-rose-600">Não deu para registrar o progresso agora — ele volta a ser enviado enquanto o vídeo toca.</p>}
    </div>
  );
}
