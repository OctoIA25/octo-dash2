-- ============================================================
-- Ninguém grava notificação pelo navegador.
-- Spec: docs/superpowers/specs/2026-09-30-comunicados-e-alertas-design.md
--
-- RESTRITIVA. Ordem de produção: 20261001_comunicados.sql → ESTA → deploy.
-- O gatilho de Demandas (na anterior) já cobre o único insert legítimo que o
-- navegador fazia; o insert antigo que sobrar até o deploy falha calado (a
-- tela já engolia o erro) e o gatilho avisa no lugar dele.
--
-- Quem grava: funções security definer (publicar_comunicado, cron, gatilhos)
-- e o servidor (service_role). As policies de SELECT/UPDATE/DELETE das
-- próprias linhas continuam.
-- ============================================================

drop policy if exists notifications_insert_tenant on public.notifications;

-- Defesa em profundidade: sem policy o RLS já barra, mas a permissão também sai.
revoke insert on public.notifications from anon, authenticated;
-- anon nunca precisou desta tabela (tinha SELECT/UPDATE/DELETE, segurados só pela policy).
revoke all on public.notifications from anon;
