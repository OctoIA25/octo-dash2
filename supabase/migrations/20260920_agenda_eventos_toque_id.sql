-- =============================================================================
-- `agenda_eventos.toque_id`: qual toque da cadência criou esta atividade.
--
-- POR QUE
-- O próximo toque marcado na cadência passa a virar atividade "Retornar para o
-- cliente" na agenda do corretor (server/leadToques/agenda.js), entrando na
-- regra das 24h. Para o toque seguinte fechar o compromisso do anterior — e
-- para desfazer um toque levar a atividade junto — é preciso saber qual
-- atividade veio de qual toque.
--
-- Sem a coluna, a alternativa seria casar por título e lead, que erra assim que
-- o corretor cria à mão uma atividade com o mesmo título.
--
-- ON DELETE CASCADE: desfazer o toque (rota DELETE, só o último e só de quem
-- registrou) apaga a atividade que nasceu dele. É o banco fazendo, então não há
-- caminho no código que deixe atividade órfã de um toque que não existe mais.
--
-- Atividade criada à mão pelo corretor continua com toque_id nulo — é isso que
-- distingue as duas, e por isso o índice é parcial.
--
-- GRANT não é necessário: agenda_eventos tem privilégio no nível da tabela
-- (SELECT/INSERT/UPDATE/DELETE para anon, authenticated e service_role), que
-- alcança coluna nova. Conferido em 20/09/2026 em information_schema.
-- =============================================================================

ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS toque_id uuid
  REFERENCES public.lead_toques(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_toque_id
  ON public.agenda_eventos (toque_id)
  WHERE toque_id IS NOT NULL;

COMMENT ON COLUMN public.agenda_eventos.toque_id IS
  'Toque da cadência que criou esta atividade (lead_toques.id). Nulo = atividade criada à mão.';
