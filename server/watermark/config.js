/**
 * Configuração central do pipeline de marca d'água.
 *
 * Os tamanhos-alvo cobrem os canais reais: portais exigem imagens grandes
 * (1280px no maior lado), o CRM usa "card" e "thumb". Gerar só o que é usado
 * controla custo de storage; tamanhos raros saem on-the-fly (ver routes.js).
 */
export const BUCKETS = {
  /** Privado — originais sem marca. Nunca expostos publicamente. */
  master: 'property-photos-master',
  /** Público — derivados com marca, servidos pela CDN do Supabase. */
  derived: 'property-photos',
};

/**
 * Perfis de tamanho. `width`/`height` definem o bounding box (fit: inside,
 * sem upscale). A marca d'água é dimensionada relativa à largura final.
 */
export const SIZES = {
  portal: { width: 1280, height: 1280, quality: 82 },
  card: { width: 640, height: 640, quality: 80 },
  thumb: { width: 240, height: 240, quality: 70, watermark: false }, // thumb sem marca: ilegível e desnecessária
};

/** Tamanhos pré-gerados no processamento assíncrono. */
export const DEFAULT_SIZES = ['portal', 'card', 'thumb'];

export const WATERMARK_DEFAULTS = {
  opacity: 0.35, // 0..1 — translúcida o suficiente para não atrapalhar a foto
  scale: 0.3, // logo ocupa ~30% da largura da foto
  position: 'center', // default histórico — preserva as chaves de derivado existentes
};

/** Posições válidas da marca (allowlist compartilhada por rotas/serviço/engine). */
export const WATERMARK_POSITIONS = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Worker / fila. */
export const WORKER = {
  /** Jobs processados em paralelo por tick (processamento de imagem é CPU-bound). */
  concurrency: Number(process.env.WATERMARK_CONCURRENCY || 4),
  /** Quantos jobs reservar por claim. */
  batchSize: Number(process.env.WATERMARK_BATCH || 8),
  /** Intervalo de polling da fila (ms). */
  pollIntervalMs: Number(process.env.WATERMARK_POLL_MS || 2000),
  /** Backoff exponencial entre tentativas (ms). */
  backoffBaseMs: 5000,
};
