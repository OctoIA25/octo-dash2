import { Pause, Play } from 'lucide-react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import type { MessageContentProps } from '../../types';

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function AudioContent({ message, isOutbound }: MessageContentProps) {
  if (!message.media_url) {
    return <p className="italic opacity-80">[audio] indisponível</p>;
  }
  const { playing, currentTime, duration, rate, toggle, seek, cycleRate } = useAudioPlayer(
    message.media_url,
  );
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const accent = isOutbound ? 'bg-white' : 'bg-emerald-500';
  const track = isOutbound ? 'bg-emerald-200/40' : 'bg-gray-300 dark:bg-slate-600';

  return (
    <div className="flex min-w-[200px] max-w-[280px] items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
          isOutbound ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="Progresso do áudio"
          aria-valuenow={Math.round(pct)}
          tabIndex={0}
          onClick={onBarClick}
          className={`h-1.5 w-full cursor-pointer rounded-full ${track}`}
        >
          <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`mt-1 flex justify-between text-[10px] ${isOutbound ? 'text-emerald-50' : 'text-gray-500'}`}>
          <span>{fmt(currentTime)} / {fmt(duration)}</span>
          <button type="button" onClick={cycleRate} className="font-medium hover:underline">
            {rate}x
          </button>
        </div>
      </div>
    </div>
  );
}
