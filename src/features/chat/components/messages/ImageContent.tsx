import { useState } from 'react';
import { useLightbox } from '../lightbox/LightboxProvider';
import type { MessageContentProps } from '../../types';

export function ImageContent({ message }: MessageContentProps) {
  const { open } = useLightbox();
  const [loaded, setLoaded] = useState(false);

  if (!message.media_url) {
    return <p className="italic opacity-80">[image] indisponível</p>;
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => open(message.media_url!)}
        className="relative block overflow-hidden rounded"
        aria-label="Ampliar imagem"
      >
        {/* Skeleton sobreposto enquanto carrega — NÃO escondemos a <img> (display:none
            com loading=lazy trava o load e o onLoad nunca dispara). */}
        {!loaded && (
          <div className="absolute inset-0 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        )}
        <img
          src={message.media_url}
          alt={message.body ?? 'imagem'}
          onLoad={() => setLoaded(true)}
          className="max-h-[280px] max-w-full cursor-zoom-in rounded object-cover"
        />
      </button>
      {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
    </div>
  );
}
