-- Migration: fecha o histórico de fila do bolsão (lead_queue_history)
-- Data: 2026-09-17
-- Descrição: a tabela guarda quem recebeu cada lead redistribuído pela fila por
-- equipe (1.930 linhas só da Lotus) e estava aberta para qualquer pessoa. Dois
-- problemas somados:
--
-- 1. A policy "Service role full access to queue history" é FOR ALL com
--    USING (true) / WITH CHECK (true) e roles = {public}. O nome diz
--    service_role, mas `public` inclui `anon` e `authenticated`. E o service_role
--    não precisava dela: rolbypassrls = true (conferido em pg_roles), ele ignora
--    RLS de qualquer forma. A policy não dava nada a quem devia e dava tudo a
--    quem não devia — inclusive anulando a policy de recorte por tenant, que já
--    existia logo ao lado e nunca teve efeito.
-- 2. `anon` e `authenticated` tinham DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--    TRUNCATE e UPDATE. A anon key vai no bundle do front, então qualquer
--    visitante podia ler, alterar e apagar o histórico de QUALQUER imobiliária.
--
-- Depois desta migration, `authenticated` fica só com SELECT e o recorte passa a
-- ser feito de verdade pela policy "Tenant members can view queue history".
--
-- O que continua funcionando (conferido antes de aplicar):
-- - Leitura do front: BolsaoTeamsPanel.tsx:56 e :95 fazem SELECT pelo PostgREST
--   como `authenticated`. É o único uso no front, e só lê.
-- - Escrita do servidor: proxy-production.js:3266 grava com service_role. Isso
--   foi confirmado, não suposto: `lead_events` só tem grant para service_role e
--   recebeu 1.102 linhas nos últimos 2 dias — se o servidor estivesse no
--   fallback da anon key, essa escrita não existiria.
-- - Escrita do banco: expire_bolsao_leads(), tg_fonte_corretor_to_bolsao() e as
--   demais que gravam aqui são SECURITY DEFINER, rodam como postgres e não
--   dependem de grant.
--
-- Rollback: recriar a policy com USING (true) e devolver os grants. Não fazer
-- sem entender o acima — é exatamente isso que reabre a tabela para a anon key.

DROP POLICY IF EXISTS "Service role full access to queue history" ON public.lead_queue_history;

REVOKE ALL ON public.lead_queue_history FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lead_queue_history FROM authenticated;
