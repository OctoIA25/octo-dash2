import { useCallback, useEffect, useRef, useState } from 'react';

// Controller de módulo: garante que apenas um áudio toca por vez (igual WhatsApp).
let current: HTMLAudioElement | null = null;
export const __audioController = {
  play(el: HTMLAudioElement) {
    if (current && current !== el) current.pause();
    current = el;
    void el.play();
  },
  pause(el: HTMLAudioElement) {
    el.pause();
    if (current === el) current = null;
  },
  current: () => current,
  reset() {
    current = null;
  },
};

const RATES = [1, 1.5, 2];

export function useAudioPlayer(url: string) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const el = new Audio(url);
    el.preload = 'metadata';
    ref.current = el;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
      __audioController.pause(el);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    return () => {
      __audioController.pause(el);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.src = '';
    };
  }, [url]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) __audioController.play(el);
    else __audioController.pause(el);
  }, []);

  const seek = useCallback((t: number) => {
    const el = ref.current;
    if (el) el.currentTime = t;
  }, []);

  const cycleRate = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    el.playbackRate = next;
    setRate(next);
  }, [rate]);

  return { playing, currentTime, duration, rate, toggle, seek, cycleRate };
}
