-- ============================================================================
-- Pipeline de Marca d'Água Multi-Tenant
-- ============================================================================
-- Arquitetura: MASTER imutável + DERIVADO versionado por logo_version,
-- gerado de forma assíncrona por uma fila lastreada em tabela
-- (FOR UPDATE SKIP LOCKED) e servido via CDN do Supabase Storage.
--
-- Princípio central: a imagem com marca d'água é um ARTEFATO DERIVADO,
-- descartável e regenerável. Trocar o logo = bump de `logo_version`, o que
-- invalida logicamente milhões de derivados sem tocar em nenhum arquivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Branding por tenant: logo + versionamento + parâmetros da marca d'água
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  -- Caminho da máscara branca pré-computada no Storage (logos/{tenant}/mask_v{n}.png).
  ADD COLUMN IF NOT EXISTS logo_mask_path      TEXT,
  -- Incrementado a cada troca de logo. É a CHAVE da invalidação em massa.
  ADD COLUMN IF NOT EXISTS logo_version        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watermark_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  -- 0..1 — opacidade global da marca d'água (default 0.35).
  ADD COLUMN IF NOT EXISTS watermark_opacity   NUMERIC(3,2) NOT NULL DEFAULT 0.35,
  -- Fração da largura da foto ocupada pelo logo (default 0.30).
  ADD COLUMN IF NOT EXISTS watermark_scale     NUMERIC(3,2) NOT NULL DEFAULT 0.30;

-- ----------------------------------------------------------------------------
-- 2. property_photos: registro do MASTER + estado do processamento
-- ----------------------------------------------------------------------------
-- Uma linha por foto original. O master nunca muda. `processed_logo_version`
-- diz para qual versão de logo os derivados foram gerados; se for menor que
-- tenants.logo_version, os derivados estão obsoletos e devem ser regerados.
CREATE TABLE IF NOT EXISTS public.property_photos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- ID lógico do imóvel (imoveis_locais / condominios). Mantido como TEXT por
  -- compatibilidade com os diferentes esquemas de origem.
  property_id             TEXT,
  -- Caminho do MASTER no bucket privado (property-photos-master).
  master_path             TEXT NOT NULL,
  content_hash            TEXT,                -- sha256 do master (dedup/idempotência)
  position                INTEGER NOT NULL DEFAULT 0,
  is_cover                BOOLEAN NOT NULL DEFAULT FALSE,
  caption                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','ready','error')),
  processed_logo_version  INTEGER,             -- versão para a qual os derivados existem
  -- Mapa { "<size>": "<path no bucket público>" } dos derivados gerados.
  derivatives             JSONB NOT NULL DEFAULT '{}'::jsonb,
  error                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_photos_tenant   ON public.property_photos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_property_photos_property ON public.property_photos(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_photos_status   ON public.property_photos(status);

-- ----------------------------------------------------------------------------
-- 3. watermark_jobs: a FILA (DB-backed, consumida com SKIP LOCKED)
-- ----------------------------------------------------------------------------
-- Sem Redis no stack, usamos o Postgres como fila. Workers reservam jobs com
-- SELECT ... FOR UPDATE SKIP LOCKED, garantindo que cada job é processado por
-- um único worker mesmo com várias instâncias concorrentes.
CREATE TABLE IF NOT EXISTS public.watermark_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id      UUID NOT NULL REFERENCES public.property_photos(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_version  INTEGER NOT NULL,             -- versão-alvo (idempotência)
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','processing','done','error')),
  priority      INTEGER NOT NULL DEFAULT 100, -- menor = mais urgente; batch usa 200
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- backoff: não rodar antes disso
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotência: no máximo um job ATIVO por (foto, versão).
  UNIQUE (photo_id, logo_version)
);

-- Índice que casa exatamente com o claim do worker (fila pronta para rodar).
CREATE INDEX IF NOT EXISTS idx_watermark_jobs_claim
  ON public.watermark_jobs (priority, run_after)
  WHERE status = 'queued';

-- ----------------------------------------------------------------------------
-- 4. RPC de claim atômico — encapsula o SKIP LOCKED para o worker (Node)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_watermark_jobs(
  p_worker TEXT,
  p_limit  INTEGER DEFAULT 5
)
RETURNS SETOF public.watermark_jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.watermark_jobs j
     SET status     = 'processing',
         locked_at  = NOW(),
         locked_by  = p_worker,
         attempts   = j.attempts + 1,
         updated_at = NOW()
   WHERE j.id IN (
     SELECT id FROM public.watermark_jobs
      WHERE status = 'queued'
        AND run_after <= NOW()
      ORDER BY priority, run_after
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING j.*;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Buckets de Storage
-- ----------------------------------------------------------------------------
-- master  → PRIVADO  (nunca exposto; acessível só via service_role/signed URL)
-- public  → PÚBLICO  (derivados com marca d'água, servidos pela CDN do Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos-master', 'property-photos-master', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. RLS — leitura por membros do tenant; escrita só pelo servidor (service_role)
-- ----------------------------------------------------------------------------
ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watermark_jobs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members read photos" ON public.property_photos;
CREATE POLICY "tenant members read photos" ON public.property_photos
  FOR SELECT USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
    )
  );

-- watermark_jobs é detalhe de infraestrutura: nenhuma policy de cliente.
-- O servidor Express usa service_role e bypassa RLS.
