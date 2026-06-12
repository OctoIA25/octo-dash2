-- ============================================================================
-- Posição configurável da marca d'água (5 presets por tenant)
-- ============================================================================
-- 'center' é o default e preserva o comportamento (e as chaves de derivado)
-- existentes; os 4 cantos geram chaves novas → derivados regenerados sob demanda.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS watermark_position TEXT NOT NULL DEFAULT 'center';

-- Allowlist das posições válidas (mesma lista de WATERMARK_POSITIONS no server).
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_watermark_position_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_watermark_position_check
  CHECK (watermark_position IN ('center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'));
