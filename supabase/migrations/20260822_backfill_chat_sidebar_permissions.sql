-- Migration: 'chat' (WhatsApp) vira aba editável no modal de Equipe
-- Data: 2026-08-22
-- Descrição: até aqui 'chat' ficava fora de SIDEBAR_PERMISSIONS_EDITAVEIS e era
--            devolvido na leitura pelo padrão do cargo (comPermissoesNaoEditaveis).
--            Com checkbox próprio, a cura-na-leitura deixa de valer e as listas já
--            gravadas sem 'chat' (89 de 119 em 22/ago) esconderiam a aba. Este
--            backfill grava 'chat' nelas — todo cargo tem 'chat' no padrão.
--            Membros sem lista salva seguem o padrão do cargo e não precisam de nada.
--
-- Aplicar ANTES do deploy do front. Idempotente.

UPDATE public.tenant_memberships
SET permissions = jsonb_set(
  permissions,
  '{sidebar_permissions}',
  (permissions->'sidebar_permissions') || '["chat"]'::jsonb
)
WHERE jsonb_typeof(permissions->'sidebar_permissions') = 'array'
  AND NOT (permissions->'sidebar_permissions' @> '["chat"]'::jsonb);
