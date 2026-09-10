-- Fecha a tabela de arquivo do Eneagrama, criada aberta por engano.
--
-- A migration 20260910_eneagrama_invalidar_escala_antiga criou
-- `eneagrama_resultados_escala_antiga` sem habilitar RLS. Como o schema public
-- tem GRANT default de SELECT/INSERT/UPDATE/DELETE para `anon`, a tabela ficou
-- legível (e gravável) por qualquer pessoa com a chave publicada no bundle —
-- verificado: 7 linhas retornavam sem autenticação nenhuma, com nome do corretor
-- e tenant_id.
--
-- É tabela de auditoria: ninguém no app lê, então a postura correta é negar
-- para todo mundo e deixar só o service_role (que ignora RLS por definição).
--
-- ⚠️ APLICAR MANUALMENTE no Supabase.

BEGIN;

ALTER TABLE public.eneagrama_resultados_escala_antiga ENABLE ROW LEVEL SECURITY;

-- Sem policy nenhuma + RLS ligado = negado para anon e authenticated.
-- O REVOKE é cinto e suspensório: mesmo que alguém crie uma policy permissiva
-- por engano no futuro, sem privilégio de tabela não há acesso.
REVOKE ALL ON public.eneagrama_resultados_escala_antiga FROM anon;
REVOKE ALL ON public.eneagrama_resultados_escala_antiga FROM authenticated;

COMMIT;

-- Conferência (deve devolver 0 linhas usando a ANON key, e erro de permissão):
--   curl "$SUPABASE_URL/rest/v1/eneagrama_resultados_escala_antiga?select=*" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
