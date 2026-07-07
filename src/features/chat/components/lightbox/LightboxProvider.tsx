import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { MediaLightbox } from './MediaLightbox';

interface LightboxApi {
  open: (url: string) => void;
}
const Ctx = createContext<LightboxApi | null>(null);

export function useLightbox(): LightboxApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLightbox precisa estar dentro de <LightboxProvider>');
  return ctx;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const open = useCallback((u: string) => setUrl(u), []);
  const close = useCallback(() => setUrl(null), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {url && <MediaLightbox url={url} onClose={close} />}
    </Ctx.Provider>
  );
}
