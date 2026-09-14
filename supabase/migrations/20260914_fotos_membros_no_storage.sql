-- Migration: foto do membro sai de tenant_memberships.permissions para o Storage
-- Data: 2026-09-14
--
-- Problema: a foto do membro era gravada como data-URI em permissions.photo.
-- Medido em 14/set na Lótus: 17 membros, 6,2 MB de permissions — 13 KB de dados
-- e o resto foto (a maior com 2 MB). get_tenant_members devolvia os 6,2 MB para
-- as 11 telas que listam membros (só 3 usam foto): EXPLAIN (SERIALIZE) 108 ms e
-- output=6186kB com o banco ocioso, contra 5,6 ms e 15 kB sem a foto. Sob carga
-- as leituras de tenant_memberships chegavam a ~8 s (pg_stat_statements) e
-- estouravam o statement timeout (57014) — a lista de membros falhava na tela.
--
-- O que esta migration faz (tudo aditivo — nada é alterado em tenant_memberships):
--   1) bucket público `membros-fotos` (mesmo modelo de `condominios-fotos`);
--   2) escrita no bucket só na pasta do tenant, por admin do tenant ou owner da
--      plataforma — a mesma regra do UPDATE em tenant_memberships
--      (is_tenant_admin_or_owner / owner). Só INSERT: o front envia com
--      upsert=false e nunca apaga;
--   3) cópia de segurança das fotos atuais em data-URI, ANTES de qualquer troca;
--   4) migrar_foto_membro(): troca UMA foto pelo link, só se a foto no banco ainda
--      for a mesma que foi enviada (md5) — edição concorrente vence o script.
--
-- Quem troca as fotos: scripts/migrar-fotos-membros-storage.mjs (dry-run por
-- padrão). O front novo (memberPhotoService) já grava link; o antigo continua
-- funcionando — link em permissions.photo serve de <img src> igual a data-URI.
--
-- ROLLBACK das fotos (devolve o data-URI de quem ainda está com o link migrado):
--   UPDATE public.tenant_memberships tm
--      SET permissions = jsonb_set(tm.permissions, '{photo}', to_jsonb(b.photo))
--     FROM public.tenant_memberships_fotos_backup b
--    WHERE b.membership_id = tm.id AND tm.permissions->>'photo' = b.url;
-- Os objetos no bucket podem ficar: nada os lê depois do rollback.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Bucket. 5 MB: o formulário aceita até 2 MB; a folga cobre foto antiga
-- gravada antes desse limite existir.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('membros-fotos', 'membros-fotos', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 2) Escrita. A pasta [1] é o tenant; comparação como texto para um caminho
-- malformado ser recusado em vez de estourar num cast para uuid.
DROP POLICY IF EXISTS "membros fotos upload" ON storage.objects;
CREATE POLICY "membros fotos upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'membros-fotos'
    AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

-- 3) Cópia de segurança. RLS ligada sem policy: só service_role lê.
CREATE TABLE IF NOT EXISTS public.tenant_memberships_fotos_backup (
  membership_id uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  user_id       uuid,
  photo         text NOT NULL,
  url           text,
  copiado_em    timestamptz NOT NULL DEFAULT now(),
  migrado_em    timestamptz
);
ALTER TABLE public.tenant_memberships_fotos_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_memberships_fotos_backup FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.tenant_memberships_fotos_backup IS
  'Cópia das fotos de membro em data-URI antes da migração para o bucket membros-fotos (20260914). Fonte do rollback. Só service_role.';

INSERT INTO public.tenant_memberships_fotos_backup (membership_id, tenant_id, user_id, photo)
SELECT tm.id, tm.tenant_id, tm.user_id, tm.permissions->>'photo'
  FROM public.tenant_memberships tm
 WHERE tm.permissions->>'photo' LIKE 'data:image/%'
ON CONFLICT (membership_id) DO NOTHING;

-- 4) Troca de UMA foto, com trava. jsonb_set mexe só na chave photo: as outras
-- permissões do membro ficam como estiverem no momento do UPDATE.
CREATE OR REPLACE FUNCTION public.migrar_foto_membro(p_membership_id uuid, p_url text, p_md5 text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trocou boolean;
BEGIN
  IF p_url IS NULL OR p_url NOT LIKE 'https://%/storage/v1/object/public/membros-fotos/%' THEN
    RAISE EXCEPTION 'url fora do bucket membros-fotos: %', p_url;
  END IF;

  UPDATE public.tenant_memberships
     SET permissions = jsonb_set(permissions, '{photo}', to_jsonb(p_url))
   WHERE id = p_membership_id
     AND md5(permissions->>'photo') = p_md5;
  v_trocou := FOUND;

  IF v_trocou THEN
    UPDATE public.tenant_memberships_fotos_backup
       SET url = p_url, migrado_em = now()
     WHERE membership_id = p_membership_id;
  END IF;

  RETURN v_trocou;
END;
$$;

REVOKE ALL ON FUNCTION public.migrar_foto_membro(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrar_foto_membro(uuid, text, text) TO service_role;

DO $$
DECLARE
  v_copias int;
  v_data_uri int;
BEGIN
  SELECT count(*) INTO v_copias FROM public.tenant_memberships_fotos_backup;
  SELECT count(*) INTO v_data_uri FROM public.tenant_memberships WHERE permissions->>'photo' LIKE 'data:image/%';
  IF v_copias < v_data_uri THEN
    RAISE EXCEPTION 'backup incompleto: % cópias para % fotos em data-URI', v_copias, v_data_uri;
  END IF;
  RAISE NOTICE 'fotos em data-URI: %, cópias de segurança: %', v_data_uri, v_copias;
END $$;

COMMIT;
