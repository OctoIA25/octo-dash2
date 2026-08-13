-- ⚠️ ORDEM DE DEPLOY: rodar ANTES do deploy do código novo (prod E dev).
-- Sem survey_comments, o submit quebra ao gravar o comentário (42P01) e a
-- agregação devolve comentários vazios.
--
-- MUDANÇA DE PRIVACIDADE (decisão de produto, 2026-08-12). O eNPS deixa de ser
-- anônimo. A partir daqui:
--   survey_responses  — IDENTIFICADA: respondent_user_id SEMPRE preenchido
--                       (é o que habilita o filtro por corretor no relatório)
--   survey_comments   — ANÔNIMA e SEPARADA: o texto livre é a ÚNICA informação anônima
--
-- Por que TABELA SEPARADA e não uma coluna em survey_responses: se o texto ficasse
-- em answers, estaria na MESMA LINHA do respondent_user_id — atribuível a uma
-- pessoa por definição. Anonimato do texto = o vínculo não existir no banco.
-- Mantido o padrão do design original: SEM created_at (instante fino correlaciona
-- com envio/resposta e vira oráculo de de-anonimização) e SEM respondent_user_id.
-- subject_leader_user_id fica porque é granularidade de EQUIPE, não de pessoa —
-- é o que faz o filtro de equipe continuar valendo para os comentários.
-- ============================================================

-- ------------------------------------------------------------
-- 1) survey_comments — texto livre ANÔNIMO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_comments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- uuid v4: não vaza ordem de inserção
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id               uuid NOT NULL REFERENCES public.survey_cycles(id) ON DELETE RESTRICT,  -- dado coletado
  subject_leader_user_id uuid,                        -- equipe avaliada (SEM FK); NUNCA o autor
  text                   text NOT NULL CHECK (btrim(text) <> '')
);

-- A agregação lê todos os comentários do ciclo (mesmo motivo do survey_responses_cycle).
CREATE INDEX IF NOT EXISTS survey_comments_cycle
  ON public.survey_comments (cycle_id);

-- RLS ligado + ZERO policy de SELECT = inacessível a anon/authenticated (mesmo
-- padrão de survey_responses). Toda leitura passa pelo endpoint service_role,
-- que aplica o N-mínimo antes de devolver qualquer texto.
ALTER TABLE public.survey_comments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.survey_comments FROM anon, authenticated;

COMMENT ON TABLE  public.survey_comments IS 'Texto livre ANÔNIMO do survey — a única informação anônima do eNPS. SEM respondent_user_id e SEM created_at de propósito. Leitura só via endpoint service_role (N-mínimo).';
COMMENT ON COLUMN public.survey_comments.subject_leader_user_id IS 'Equipe avaliada (granularidade de equipe, nunca de pessoa) — mantém o filtro por equipe funcionando sem identificar o autor.';

-- ------------------------------------------------------------
-- 2) Migra os comentários que hoje moram dentro de survey_responses.answers
--    e os APAGA de lá (do contrário, ficariam colados a uma linha que passa a
--    ser identificada). Guarda de idempotência: só roda com a tabela vazia.
-- ------------------------------------------------------------
INSERT INTO public.survey_comments (tenant_id, cycle_id, subject_leader_user_id, text)
SELECT tenant_id, cycle_id, subject_leader_user_id, btrim(answers->>'q_comentario')
  FROM public.survey_responses
 WHERE btrim(coalesce(answers->>'q_comentario', '')) <> ''
   AND NOT EXISTS (SELECT 1 FROM public.survey_comments);

UPDATE public.survey_responses
   SET answers = answers - 'q_comentario'
 WHERE answers ? 'q_comentario';

COMMENT ON COLUMN public.survey_responses.respondent_user_id IS 'Corretor que respondeu (auth.users.id), SEMPRE preenchido desde 2026-08-12 — habilita o filtro por corretor. SEM FK: não acoplar retenção ao ciclo de vida da conta. O texto livre anônimo mora em survey_comments.';

-- ------------------------------------------------------------
-- 3) Rótulo da pergunta aberta: agora é explicitamente sobre a experiência na
--    equipe e é o único campo anônimo. Só o template global (tenant_id NULL).
-- ------------------------------------------------------------
UPDATE public.surveys
   SET questions = '[
    {"key":"q_empresa","type":"nps_0_10","label":"O quanto você recomendaria esta imobiliária para outro corretor trabalhar?"},
    {"key":"q_gestor","type":"nps_0_10","label":"O quanto você recomendaria seu gestor imediato?"},
    {"key":"q_comentario","type":"open_text","required":false,"label":"Como está sendo sua experiência na equipe? Deixe sugestões ou críticas (anônimo)"}
  ]'::jsonb
 WHERE kind = 'enps' AND tenant_id IS NULL;

-- ROLLBACK (se necessário):
--   DROP TABLE IF EXISTS public.survey_comments;
--   (os comentários migrados se perdem — exportar antes se importar)

-- ============================================================
-- VERIFICAÇÃO (rodar manualmente após aplicar):
--
-- (a) Texto vazio é barrado pelo CHECK
--     INSERT INTO public.survey_comments (tenant_id, cycle_id, text)
--     VALUES ('<tenant-uuid>','<cycle-uuid>','   ');
--     -- expected: ERROR: violates check constraint
--
-- (b) Nenhum comentário sobrou colado à resposta identificada
--     SELECT count(*) FROM public.survey_responses WHERE answers ? 'q_comentario';
--     -- expected: 0
--
-- (c) RLS: membro não lê comentário direto (só o endpoint service_role)
--     SET ROLE anon;
--     SELECT * FROM public.survey_comments LIMIT 1;   -- expected: 0 rows / permission denied
--     RESET ROLE;
-- ============================================================
