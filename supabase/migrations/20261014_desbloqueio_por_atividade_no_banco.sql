-- ============================================================
-- O desbloqueio por atividade sai da tela e vai para o banco.
--
-- O defeito (achado em 01/10): quem BLOQUEIA é o banco
-- (processar_atividades_pendentes, SECURITY DEFINER, pg_cron de hora em hora).
-- Quem DESBLOQUEAVA era a tela, com o login do próprio corretor, gravando em
-- tenant_memberships.permissions — e a RLS dessa tabela só deixa admin, gestao
-- e o dono fazerem UPDATE. O UPDATE do corretor pegava 0 linhas,
-- updateMemberPermissions devolvia success:false e as 4 telas ignoravam.
-- Quem concluía tudo continuava fora do bolsão até um admin liberar na mão:
-- na Lotus, Samir Said com 0 atividades vencidas e Humberto Martinez sem
-- nenhuma atividade cobrada no nome dele.
--
-- O bloqueio passa a ser uma condição, não um evento: bloqueado por
-- atividade ⇔ existe atividade bloqueante aberta cobrada há mais de 24h. O
-- gatilho reavalia a condição sempre que uma atividade já cobrada muda ou
-- some — concluída por qualquer tela, pela LIA, apagada ou passada para outro
-- corretor. Não depende de quem está logado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_libera_bloqueio_por_atividade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só toca bloqueio com motivo 'atividade_pendente', o único que o laço 3 de
  -- processar_atividades_pendentes grava. A condição abaixo é a daquele laço:
  -- mudou lá, muda aqui.
  UPDATE public.tenant_memberships tm
  SET permissions = tm.permissions || jsonb_build_object(
        'bolsao_blocked_enabled', false,
        'bolsao_blocked_until', NULL,
        'bolsao_blocked_reason', NULL,
        'bolsao_blocked_duration', NULL)
  FROM auth.users u
  WHERE u.id = tm.user_id
    AND lower(u.email) = lower(OLD.corretor_email)
    AND tm.tenant_id = OLD.tenant_id
    AND tm.permissions->>'bolsao_blocked_reason' = 'atividade_pendente'
    AND NOT EXISTS (
      SELECT 1 FROM public.agenda_eventos ae
      WHERE ae.tenant_id = tm.tenant_id
        AND lower(ae.corretor_email) = lower(u.email)
        AND ae.status IN ('pendente', 'confirmado')
        AND ae.tipo IN ('retornar_cliente', 'visita_agendada')
        AND ae.pending_notified_at < now() - interval '24 hours'
    );
  RETURN NULL;
END $$;

-- Atividade que nunca foi cobrada não bloqueou ninguém: não há o que reavaliar.
DROP TRIGGER IF EXISTS tr_agenda_libera_bloqueio ON public.agenda_eventos;
CREATE TRIGGER tr_agenda_libera_bloqueio
  AFTER UPDATE OR DELETE ON public.agenda_eventos
  FOR EACH ROW
  WHEN (OLD.pending_notified_at IS NOT NULL)
  EXECUTE FUNCTION public.tg_libera_bloqueio_por_atividade();

-- ------------------------------------------------------------
-- Uma vez, 01/10 — pedido do usuário: "desbloqueia todos os que foram
-- bloqueados devidamente e indevidamente".
--
-- 1) Quem está bloqueado e ainda tem cobrança aberta (Fábio, 4 retornos; a
--    conta do dono, 1 de teste) ganha prazo novo: a cobrança volta a zero, a
--    rotina manda o aviso de 24h na próxima hora e só bloqueia de novo se não
--    concluir. Zerar dispara o gatilho acima, que libera. TEM que vir antes
--    do passo 2: depois dele ninguém mais tem o motivo gravado.
UPDATE public.agenda_eventos ae
SET pending_notified_at = NULL, updated_at = now()
WHERE ae.status IN ('pendente', 'confirmado')
  AND ae.tipo IN ('retornar_cliente', 'visita_agendada')
  AND ae.pending_notified_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
    WHERE tm.tenant_id = ae.tenant_id
      AND lower(u.email) = lower(ae.corretor_email)
      AND tm.permissions->>'bolsao_blocked_reason' = 'atividade_pendente'
  );

-- 2) Quem ficou preso sem pendência nenhuma — o defeito — sai agora.
UPDATE public.tenant_memberships
SET permissions = permissions || jsonb_build_object(
      'bolsao_blocked_enabled', false,
      'bolsao_blocked_until', NULL,
      'bolsao_blocked_reason', NULL,
      'bolsao_blocked_duration', NULL)
WHERE permissions->>'bolsao_blocked_reason' = 'atividade_pendente';
