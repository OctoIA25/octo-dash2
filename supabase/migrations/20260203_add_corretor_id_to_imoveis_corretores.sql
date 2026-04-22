-- Add missing corretor_id column to imoveis_corretores
-- Some environments were created from an older migration that didn't include corretor_id.

ALTER TABLE IF EXISTS public.imoveis_corretores
ADD COLUMN IF NOT EXISTS corretor_id uuid;

-- Optional: index for faster lookups by broker
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_corretor_id
ON public.imoveis_corretores (corretor_id);
