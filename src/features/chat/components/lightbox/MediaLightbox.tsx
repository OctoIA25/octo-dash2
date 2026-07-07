import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

export function MediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(5, s + 0.25));
      if (e.key === '-') setScale((s) => Math.max(1, s - 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(1, s - 0.25)); }}
          aria-label="Diminuir zoom"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(5, s + 0.25)); }}
          aria-label="Aumentar zoom"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img
        src={url}
        alt="imagem ampliada"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => setScale((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.002)))}
        style={{ transform: `scale(${scale})` }}
        className="max-h-[90vh] max-w-[90vw] cursor-zoom-in object-contain transition-transform"
      />
    </div>
  );
}
