/** A.7 · A API do player do YouTube, carregada uma vez para a página inteira. */
export interface YTPlayer { getCurrentTime(): number; destroy(): void }
interface YTEvento { data: number }
interface YTGlobal {
  Player: new (el: HTMLElement, opts: {
    videoId: string; host?: string; playerVars?: Record<string, number>;
    events?: { onStateChange?: (e: YTEvento) => void };
  }) => YTPlayer;
  PlayerState: { PLAYING: number };
}
declare global {
  interface Window { YT?: YTGlobal; onYouTubeIframeAPIReady?: () => void }
}

let carregando: Promise<YTGlobal> | null = null;
/** Carrega a API do player uma vez só, para a página inteira. */
export function carregarYouTube(): Promise<YTGlobal> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  carregando ??= new Promise((resolve) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { anterior?.(); resolve(window.YT!); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return carregando;
}
