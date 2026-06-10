-- ============================================================================
-- Correções do pipeline de marca d'água (pós-review de segurança/correção)
-- ============================================================================

-- 1) Merge ATÔMICO de uma entrada no mapa derivatives (corrige condição de corrida).
-- Substitui o read-modify-write não-atômico do ensureDerivative: duas requisições
-- concorrentes (ex.: feed pedindo 'portal' e 'card' ao mesmo tempo) deixavam de
-- perder entradas do mapa. jsonb concat (||) é aplicado no próprio Postgres.
-- p_processed_version NULL = mantém o valor atual (caminho com marca desligada).
CREATE OR REPLACE FUNCTION public.set_photo_derivative(
  p_id uuid,
  p_size text,
  p_key text,
  p_processed_version integer
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.property_photos
     SET derivatives = COALESCE(derivatives, '{}'::jsonb) || jsonb_build_object(p_size, p_key),
         processed_logo_version = COALESCE(p_processed_version, processed_logo_version),
         status = 'ready',
         error = NULL,
         updated_at = now()
   WHERE id = p_id;
$$;

-- 2) Dedup do master por conteúdo (idempotência do ingest): índice único parcial
-- por (tenant_id, property_id, content_hash). Evita N masters para a mesma foto
-- em retry/double-submit. Antes de criar o índice, remove duplicatas já
-- existentes, mantendo a linha mais completa/pronta de cada grupo.
WITH ranked_photos AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, property_id, content_hash
      ORDER BY
        CASE status
          WHEN 'ready' THEN 0
          WHEN 'processing' THEN 1
          WHEN 'pending' THEN 2
          ELSE 3
        END,
        CASE WHEN derivatives <> '{}'::jsonb THEN 0 ELSE 1 END,
        CASE WHEN is_cover THEN 0 ELSE 1 END,
        position ASC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.property_photos
  WHERE content_hash IS NOT NULL
)
DELETE FROM public.property_photos p
USING ranked_photos r
WHERE p.id = r.id
  AND r.rn > 1;

-- Parcial para não conflitar com linhas sem hash.
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_photos_dedup
  ON public.property_photos (tenant_id, property_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- 3) Progresso DURÁVEL do reprocessamento (regenerar derivados + reapontar URLs).
-- Em memória o progresso se perde em restart/multi-instância e a notificação
-- mentiria. Aqui ele é persistido: qualquer aba/instância lê o estado real.
CREATE TABLE IF NOT EXISTS public.watermark_reprocess (
  tenant_id  uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'idle'   -- idle | running | done | error
             CHECK (status IN ('idle', 'running', 'done', 'error')),
  done       integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  error      text,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.watermark_reprocess ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant members read reprocess" ON public.watermark_reprocess;
CREATE POLICY "tenant members read reprocess" ON public.watermark_reprocess
  FOR SELECT USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );