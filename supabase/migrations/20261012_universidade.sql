-- ============================================================
-- A.7 · Universidade — curso é playlist, com prova e certificado.
--
-- Curso = vídeos não listados do YouTube da casa, em ordem. Zero hospedagem.
--
-- "Assistiu" deixa de ser autodeclaração: a tela manda os segundos que o
-- player de fato tocou (não a posição da barra), e o banco não deixa o
-- progresso subir mais rápido que o relógio — no máximo 2× o tempo real desde
-- o último registro (vídeo acelerado), com teto por registro. Arrastar até o
-- fim, ou mandar "vi tudo" de uma vez, não conclui. Concluída = 90% vistos.
--
-- Prova no fim: múltipla escolha, nota de corte por curso, toda tentativa
-- fica gravada. O gabarito não sai do banco — a tela recebe só as perguntas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 120),
  descricao text,
  categoria text,
  -- Cargos para quem o curso é obrigatório (cargos.id).
  obrigatorio_para uuid[] NOT NULL DEFAULT '{}',
  publicado boolean NOT NULL DEFAULT false,
  nota_corte integer NOT NULL DEFAULT 70 CHECK (nota_corte BETWEEN 0 AND 100),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curso_aulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem >= 1),
  titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 120),
  descricao text,
  youtube_id text NOT NULL CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  duracao_seg integer NOT NULL CHECK (duracao_seg BETWEEN 1 AND 6 * 3600),
  -- Adiável: reordenar as aulas troca ordens dentro da mesma gravação.
  UNIQUE (curso_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS public.curso_progresso (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aula_id uuid NOT NULL REFERENCES public.curso_aulas(id) ON DELETE CASCADE,
  segundos_vistos integer NOT NULL DEFAULT 0 CHECK (segundos_vistos >= 0),
  ultimo_registro timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  PRIMARY KEY (user_id, aula_id)
);

CREATE TABLE IF NOT EXISTS public.prova_questoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem >= 1),
  enunciado text NOT NULL CHECK (length(btrim(enunciado)) >= 1),
  -- ["alternativa A", "alternativa B", ...]; `correta` é o índice (0-based).
  alternativas jsonb NOT NULL CHECK (jsonb_typeof(alternativas) = 'array' AND jsonb_array_length(alternativas) BETWEEN 2 AND 6),
  correta integer NOT NULL CHECK (correta >= 0),
  UNIQUE (curso_id, ordem) DEFERRABLE INITIALLY DEFERRED,
  CHECK (correta < jsonb_array_length(alternativas))
);

CREATE TABLE IF NOT EXISTS public.prova_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  respostas jsonb NOT NULL,
  nota integer NOT NULL CHECK (nota BETWEEN 0 AND 100),
  aprovado boolean NOT NULL,
  feita_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prova_tentativas_por_pessoa ON public.prova_tentativas (curso_id, user_id);

-- Nada disso se lê nem se escreve pela tela: só pelas funções.
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_progresso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prova_questoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prova_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cursos, public.curso_aulas, public.curso_progresso, public.prova_questoes, public.prova_tentativas
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cursos, public.curso_aulas, public.curso_progresso, public.prova_questoes, public.prova_tentativas TO service_role;

-- A tentativa é registro: não se edita nem se apaga.
CREATE OR REPLACE FUNCTION public.tg_prova_tentativa_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tentativa_nao_se_edita';
END $$;
DROP TRIGGER IF EXISTS tr_prova_tentativa_imutavel ON public.prova_tentativas;
CREATE TRIGGER tr_prova_tentativa_imutavel BEFORE UPDATE ON public.prova_tentativas
  FOR EACH ROW EXECUTE FUNCTION public.tg_prova_tentativa_imutavel();

-- ------------------------------------------------------------
-- Assistir
-- ------------------------------------------------------------
-- p_segundos_vistos: quanto o player TOCOU desta aula, somado pela tela (não
-- a posição). O banco aceita no máximo 2× o tempo real desde o último
-- registro (+5 s de folga), e no máximo 4 minutos de avanço por registro.
CREATE OR REPLACE FUNCTION public.registrar_progresso_aula(p_aula_id uuid, p_segundos_vistos integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aula curso_aulas%ROWTYPE;
  v_curso cursos%ROWTYPE;
  v_prog curso_progresso%ROWTYPE;
  v_teto integer;
  v_novo integer;
BEGIN
  SELECT * INTO v_aula FROM curso_aulas WHERE id = p_aula_id;
  SELECT * INTO v_curso FROM cursos WHERE id = v_aula.curso_id;
  IF v_uid IS NULL OR v_curso.id IS NULL OR NOT v_curso.publicado
     OR NOT EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = v_curso.tenant_id AND tm.user_id = v_uid) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_segundos_vistos IS NULL OR p_segundos_vistos < 0 THEN RAISE EXCEPTION 'progresso_invalido'; END IF;

  INSERT INTO curso_progresso (user_id, aula_id, segundos_vistos, ultimo_registro)
  VALUES (v_uid, p_aula_id, 0, now())
  ON CONFLICT (user_id, aula_id) DO NOTHING;
  SELECT * INTO v_prog FROM curso_progresso WHERE user_id = v_uid AND aula_id = p_aula_id FOR UPDATE;

  v_teto := v_prog.segundos_vistos
            + least(240, ceil(2 * extract(epoch FROM (now() - v_prog.ultimo_registro)))::int + 5);
  v_novo := least(greatest(v_prog.segundos_vistos, p_segundos_vistos), v_teto, v_aula.duracao_seg);

  UPDATE curso_progresso
     SET segundos_vistos = v_novo,
         ultimo_registro = now(),
         concluida_em = coalesce(concluida_em, CASE WHEN v_novo >= ceil(0.9 * v_aula.duracao_seg) THEN now() END)
   WHERE user_id = v_uid AND aula_id = p_aula_id
  RETURNING * INTO v_prog;

  RETURN jsonb_build_object('segundos_vistos', v_prog.segundos_vistos, 'concluida', v_prog.concluida_em IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.registrar_progresso_aula(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_progresso_aula(uuid, integer) TO authenticated, service_role;

-- ------------------------------------------------------------
-- A prova
-- ------------------------------------------------------------
-- p_respostas: [índice escolhido por questão, na ordem]. Só depois de todas
-- as aulas concluídas. Toda tentativa fica gravada, aprovada ou não; a
-- primeira aprovação emite o certificado.
CREATE OR REPLACE FUNCTION public.responder_prova(p_curso_id uuid, p_respostas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_curso cursos%ROWTYPE;
  v_total integer;
  v_certas integer;
  v_nota integer;
  v_aprovado boolean;
  v_cert jsonb;
BEGIN
  SELECT * INTO v_curso FROM cursos WHERE id = p_curso_id;
  IF v_uid IS NULL OR v_curso.id IS NULL OR NOT v_curso.publicado
     OR NOT EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = v_curso.tenant_id AND tm.user_id = v_uid) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF EXISTS (SELECT 1 FROM curso_aulas a
               LEFT JOIN curso_progresso p ON p.aula_id = a.id AND p.user_id = v_uid
              WHERE a.curso_id = p_curso_id AND p.concluida_em IS NULL) THEN
    RAISE EXCEPTION 'aulas_pendentes';
  END IF;

  SELECT count(*) INTO v_total FROM prova_questoes WHERE curso_id = p_curso_id;
  IF v_total = 0 THEN RAISE EXCEPTION 'curso_sem_prova'; END IF;
  IF p_respostas IS NULL OR jsonb_typeof(p_respostas) <> 'array' OR jsonb_array_length(p_respostas) <> v_total THEN
    RAISE EXCEPTION 'responda_todas';
  END IF;

  SELECT count(*) INTO v_certas
    FROM (SELECT q.correta, row_number() OVER (ORDER BY q.ordem) AS n FROM prova_questoes q WHERE q.curso_id = p_curso_id) q
    JOIN jsonb_array_elements(p_respostas) WITH ORDINALITY r(valor, n) ON r.n = q.n
   WHERE jsonb_typeof(r.valor) = 'number' AND r.valor::text = q.correta::text;

  v_nota := round(100.0 * v_certas / v_total);
  v_aprovado := v_nota >= v_curso.nota_corte;
  INSERT INTO prova_tentativas (curso_id, user_id, respostas, nota, aprovado)
  VALUES (p_curso_id, v_uid, p_respostas, v_nota, v_aprovado);

  IF v_aprovado THEN v_cert := emitir_certificado(v_uid, p_curso_id); END IF;
  RETURN jsonb_build_object('nota', v_nota, 'aprovado', v_aprovado, 'nota_corte', v_curso.nota_corte,
                            'certas', v_certas, 'total', v_total, 'certificado', v_cert);
END $$;

REVOKE ALL ON FUNCTION public.responder_prova(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.responder_prova(uuid, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- O certificado — conferível pelo hash
-- ------------------------------------------------------------
-- O mesmo mecanismo do aceite de contrato (P4.3): SHA-256 de um texto
-- canônico com o que o certificado afirma. Quem tiver o hash confere em
-- /certificado/<hash>, sem login: o banco recalcula e diz se bate.
CREATE TABLE IF NOT EXISTS public.certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  curso_id uuid NOT NULL REFERENCES public.cursos(id),
  -- Como estava no dia: renomear a pessoa ou o curso depois não muda o certificado.
  nome text NOT NULL,
  curso_titulo text NOT NULL,
  nota integer,
  emitido_em timestamptz NOT NULL DEFAULT now(),
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (user_id, curso_id)
);
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificados FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificados TO service_role;

CREATE OR REPLACE FUNCTION public.tg_certificado_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certificado_nao_se_edita';
END $$;
DROP TRIGGER IF EXISTS tr_certificado_imutavel ON public.certificados;
CREATE TRIGGER tr_certificado_imutavel BEFORE UPDATE OR DELETE ON public.certificados
  FOR EACH ROW EXECUTE FUNCTION public.tg_certificado_imutavel();

CREATE OR REPLACE FUNCTION public.texto_do_certificado(p_id uuid, p_user_id uuid, p_curso_id uuid, p_nome text,
                                                       p_curso_titulo text, p_nota integer, p_emitido_em timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT concat_ws('|', 'certificado', p_id, p_user_id, p_curso_id, p_nome, p_curso_titulo, coalesce(p_nota::text, '-'),
                   to_char(p_emitido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

CREATE OR REPLACE FUNCTION public.emitir_certificado(p_user_id uuid, p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_c certificados%ROWTYPE;
  v_curso cursos%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_em timestamptz := now();
  v_nome text;
  v_nota integer;
BEGIN
  SELECT * INTO v_c FROM certificados WHERE user_id = p_user_id AND curso_id = p_curso_id;
  IF FOUND THEN RETURN jsonb_build_object('hash', v_c.hash, 'emitido_em', v_c.emitido_em, 'novo', false); END IF;
  SELECT * INTO v_curso FROM cursos WHERE id = p_curso_id;
  SELECT coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) INTO v_nome FROM auth.users u WHERE u.id = p_user_id;
  SELECT max(t.nota) INTO v_nota FROM prova_tentativas t WHERE t.curso_id = p_curso_id AND t.user_id = p_user_id AND t.aprovado;
  INSERT INTO certificados (id, tenant_id, user_id, curso_id, nome, curso_titulo, nota, emitido_em, hash)
  VALUES (v_id, v_curso.tenant_id, p_user_id, p_curso_id, v_nome, v_curso.titulo, v_nota, v_em,
          encode(extensions.digest(texto_do_certificado(v_id, p_user_id, p_curso_id, v_nome, v_curso.titulo, v_nota, v_em), 'sha256'), 'hex'))
  RETURNING * INTO v_c;
  RETURN jsonb_build_object('hash', v_c.hash, 'emitido_em', v_c.emitido_em, 'novo', true);
END $$;

-- Pública de propósito: só responde a quem já tem o hash (64 hex — não se adivinha).
CREATE OR REPLACE FUNCTION public.verificar_certificado(p_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'valido', encode(extensions.digest(texto_do_certificado(c.id, c.user_id, c.curso_id, c.nome, c.curso_titulo, c.nota, c.emitido_em), 'sha256'), 'hex') = c.hash,
      'nome', c.nome, 'curso', c.curso_titulo, 'nota', c.nota, 'emitido_em', c.emitido_em, 'imobiliaria', t.name)
      FROM certificados c JOIN tenants t ON t.id = c.tenant_id
     WHERE c.hash = lower(btrim(p_hash))), jsonb_build_object('valido', false))
$$;

REVOKE ALL ON FUNCTION public.texto_do_certificado(uuid, uuid, uuid, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emitir_certificado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verificar_certificado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_certificado(text) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Quem é gestor de quem
-- ------------------------------------------------------------
-- Diretoria (a mesma regra de quem gere os materiais) vê todo mundo; o líder,
-- a equipe dele.
CREATE OR REPLACE FUNCTION public.universidade_gere_pessoa(p_tenant_id uuid, p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.materiais_pode_gerir(p_tenant_id)
      OR EXISTS (SELECT 1 FROM tenant_memberships tm JOIN teams lt ON lt.id = tm.team_id
                  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id
                    AND (lt.leader_user_id = auth.uid() OR auth.uid() = ANY (lt.leader_user_ids)))
$$;
REVOKE ALL ON FUNCTION public.universidade_gere_pessoa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Situação de uma pessoa num curso: nao_abriu · no_meio · concluiu.
-- Concluir = certificado, ou todas as aulas quando o curso não tem prova.
CREATE OR REPLACE FUNCTION public.situacao_no_curso(p_curso_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH a AS (
    SELECT count(*) AS total, count(p.concluida_em) AS concluidas, count(p.user_id) AS abertas
      FROM curso_aulas ca LEFT JOIN curso_progresso p ON p.aula_id = ca.id AND p.user_id = p_user_id
     WHERE ca.curso_id = p_curso_id
  ),
  c AS (SELECT hash, emitido_em FROM certificados WHERE curso_id = p_curso_id AND user_id = p_user_id),
  t AS (SELECT count(*) AS tentativas, max(nota) AS melhor_nota FROM prova_tentativas WHERE curso_id = p_curso_id AND user_id = p_user_id),
  q AS (SELECT count(*) AS questoes FROM prova_questoes WHERE curso_id = p_curso_id)
  SELECT jsonb_build_object(
    'situacao', CASE
      WHEN (SELECT hash FROM c) IS NOT NULL OR (q.questoes = 0 AND a.total > 0 AND a.concluidas = a.total) THEN 'concluiu'
      WHEN a.abertas > 0 OR t.tentativas > 0 THEN 'no_meio'
      ELSE 'nao_abriu' END,
    'aulas', a.total, 'aulas_concluidas', a.concluidas, 'tem_prova', q.questoes > 0,
    'tentativas', t.tentativas, 'melhor_nota', t.melhor_nota,
    'certificado', (SELECT jsonb_build_object('hash', c.hash, 'emitido_em', c.emitido_em) FROM c))
  FROM a, t, q
$$;
REVOKE ALL ON FUNCTION public.situacao_no_curso(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- O que a casa vê
-- ------------------------------------------------------------
-- Lista de cursos. Quem não gere só vê os publicados.
CREATE OR REPLACE FUNCTION public.universidade_cursos(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gere boolean := public.materiais_pode_gerir(p_tenant_id);
  v_cargo uuid;
BEGIN
  IF NOT (v_gere OR EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  SELECT tm.cargo_id INTO v_cargo FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_uid;
  RETURN jsonb_build_object(
    'pode_gerir', v_gere,
    'cursos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'descricao', c.descricao, 'categoria', c.categoria, 'publicado', c.publicado,
        'nota_corte', c.nota_corte, 'obrigatorio', coalesce(v_cargo = ANY (c.obrigatorio_para), false),
        'duracao_seg', (SELECT coalesce(sum(a.duracao_seg), 0) FROM curso_aulas a WHERE a.curso_id = c.id),
        'meu', situacao_no_curso(c.id, v_uid))
      ORDER BY coalesce(v_cargo = ANY (c.obrigatorio_para), false) DESC, c.titulo), '[]'::jsonb)
      FROM cursos c WHERE c.tenant_id = p_tenant_id AND (c.publicado OR v_gere))
  );
END $$;

-- Um curso, para assistir: aulas com o meu progresso, a prova SEM gabarito,
-- minhas tentativas e o certificado.
CREATE OR REPLACE FUNCTION public.curso_ver(p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c cursos%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM cursos WHERE id = p_curso_id;
  IF v_c.id IS NULL OR NOT (
       public.materiais_pode_gerir(v_c.tenant_id)
    OR (v_c.publicado AND EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = v_c.tenant_id AND tm.user_id = v_uid))) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  RETURN jsonb_build_object(
    'id', v_c.id, 'titulo', v_c.titulo, 'descricao', v_c.descricao, 'categoria', v_c.categoria,
    'publicado', v_c.publicado, 'nota_corte', v_c.nota_corte,
    'aulas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', a.id, 'ordem', a.ordem, 'titulo', a.titulo, 'descricao', a.descricao,
                'youtube_id', a.youtube_id, 'duracao_seg', a.duracao_seg,
                'segundos_vistos', coalesce(p.segundos_vistos, 0), 'concluida', p.concluida_em IS NOT NULL)
              ORDER BY a.ordem), '[]'::jsonb)
                FROM curso_aulas a LEFT JOIN curso_progresso p ON p.aula_id = a.id AND p.user_id = v_uid
               WHERE a.curso_id = v_c.id),
    'questoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'ordem', q.ordem, 'enunciado', q.enunciado,
                   'alternativas', q.alternativas) ORDER BY q.ordem), '[]'::jsonb)
                   FROM prova_questoes q WHERE q.curso_id = v_c.id),
    'tentativas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nota', t.nota, 'aprovado', t.aprovado, 'feita_em', t.feita_em)
                     ORDER BY t.feita_em DESC), '[]'::jsonb)
                     FROM prova_tentativas t WHERE t.curso_id = v_c.id AND t.user_id = v_uid),
    'meu', situacao_no_curso(v_c.id, v_uid)
  );
END $$;

-- ------------------------------------------------------------
-- O que a diretoria faz
-- ------------------------------------------------------------
-- Para editar: o curso inteiro, com o gabarito.
CREATE OR REPLACE FUNCTION public.curso_para_editar(p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c cursos%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM cursos WHERE id = p_curso_id;
  IF v_c.id IS NULL OR NOT public.materiais_pode_gerir(v_c.tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  RETURN jsonb_build_object(
    'id', v_c.id, 'titulo', v_c.titulo, 'descricao', v_c.descricao, 'categoria', v_c.categoria,
    'obrigatorio_para', to_jsonb(v_c.obrigatorio_para), 'publicado', v_c.publicado, 'nota_corte', v_c.nota_corte,
    'aulas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
                'youtube_id', a.youtube_id, 'duracao_seg', a.duracao_seg) ORDER BY a.ordem), '[]'::jsonb)
                FROM curso_aulas a WHERE a.curso_id = v_c.id),
    'questoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'enunciado', q.enunciado,
                   'alternativas', q.alternativas, 'correta', q.correta) ORDER BY q.ordem), '[]'::jsonb)
                   FROM prova_questoes q WHERE q.curso_id = v_c.id)
  );
END $$;

-- Cria ou atualiza o curso inteiro. Aulas e questões vêm na ordem da tela;
-- quem tem id é mantido (o progresso da aula fica), quem sumiu sai.
CREATE OR REPLACE FUNCTION public.curso_salvar(p_tenant_id uuid, p_curso jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid := nullif(p_curso->>'id', '')::uuid;
  v_aula jsonb; v_q jsonb; v_n integer;
  v_ids_aulas uuid[] := '{}'; v_ids_q uuid[] := '{}'; v_aid uuid;
BEGIN
  IF NOT public.materiais_pode_gerir(p_tenant_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF jsonb_typeof(p_curso->'aulas') IS DISTINCT FROM 'array' OR jsonb_typeof(p_curso->'questoes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'curso_invalido';
  END IF;
  IF coalesce((p_curso->>'publicado')::boolean, false) AND jsonb_array_length(p_curso->'aulas') = 0 THEN
    RAISE EXCEPTION 'curso_sem_aula';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO cursos (tenant_id, titulo) VALUES (p_tenant_id, btrim(p_curso->>'titulo')) RETURNING id INTO v_id;
  ELSIF NOT EXISTS (SELECT 1 FROM cursos WHERE id = v_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'curso_nao_encontrado';
  END IF;

  UPDATE cursos SET
    titulo = btrim(p_curso->>'titulo'),
    descricao = nullif(btrim(p_curso->>'descricao'), ''),
    categoria = nullif(btrim(p_curso->>'categoria'), ''),
    obrigatorio_para = coalesce((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p_curso->'obrigatorio_para') x
                                  WHERE x::uuid IN (SELECT ca.id FROM cargos ca WHERE ca.tenant_id = p_tenant_id)), '{}'),
    nota_corte = coalesce((p_curso->>'nota_corte')::int, 70),
    publicado = coalesce((p_curso->>'publicado')::boolean, false),
    atualizado_em = now()
  WHERE id = v_id;

  v_n := 0;
  FOR v_aula IN SELECT * FROM jsonb_array_elements(p_curso->'aulas') LOOP
    v_n := v_n + 1;
    v_aid := nullif(v_aula->>'id', '')::uuid;
    IF v_aid IS NOT NULL AND EXISTS (SELECT 1 FROM curso_aulas WHERE id = v_aid AND curso_id = v_id) THEN
      UPDATE curso_aulas SET ordem = v_n, titulo = btrim(v_aula->>'titulo'), descricao = nullif(btrim(v_aula->>'descricao'), ''),
             youtube_id = v_aula->>'youtube_id', duracao_seg = (v_aula->>'duracao_seg')::int
       WHERE id = v_aid;
    ELSE
      INSERT INTO curso_aulas (curso_id, ordem, titulo, descricao, youtube_id, duracao_seg)
      VALUES (v_id, v_n, btrim(v_aula->>'titulo'), nullif(btrim(v_aula->>'descricao'), ''), v_aula->>'youtube_id', (v_aula->>'duracao_seg')::int)
      RETURNING id INTO v_aid;
    END IF;
    v_ids_aulas := v_ids_aulas || v_aid;
  END LOOP;
  DELETE FROM curso_aulas WHERE curso_id = v_id AND NOT (id = ANY (v_ids_aulas));

  v_n := 0;
  FOR v_q IN SELECT * FROM jsonb_array_elements(p_curso->'questoes') LOOP
    v_n := v_n + 1;
    v_aid := nullif(v_q->>'id', '')::uuid;
    IF v_aid IS NOT NULL AND EXISTS (SELECT 1 FROM prova_questoes WHERE id = v_aid AND curso_id = v_id) THEN
      UPDATE prova_questoes SET ordem = v_n, enunciado = btrim(v_q->>'enunciado'), alternativas = v_q->'alternativas',
             correta = (v_q->>'correta')::int
       WHERE id = v_aid;
    ELSE
      INSERT INTO prova_questoes (curso_id, ordem, enunciado, alternativas, correta)
      VALUES (v_id, v_n, btrim(v_q->>'enunciado'), v_q->'alternativas', (v_q->>'correta')::int)
      RETURNING id INTO v_aid;
    END IF;
    v_ids_q := v_ids_q || v_aid;
  END LOOP;
  DELETE FROM prova_questoes WHERE curso_id = v_id AND NOT (id = ANY (v_ids_q));
  RETURN v_id;
END $$;

-- Painel do time: quem concluiu, quem está no meio, quem não abriu — nominal.
-- A diretoria vê a casa; o líder, a equipe dele.
CREATE OR REPLACE FUNCTION public.curso_painel(p_curso_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c cursos%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_c FROM cursos WHERE id = p_curso_id;
  IF v_c.id IS NULL OR NOT (public.materiais_pode_gerir(v_c.tenant_id)
       OR EXISTS (SELECT 1 FROM teams lt WHERE lt.tenant_id = v_c.tenant_id AND (lt.leader_user_id = v_uid OR v_uid = ANY (lt.leader_user_ids)))) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  -- Quem não abriu primeiro: é a lista em que o gestor age.
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY CASE x->>'situacao' WHEN 'nao_abriu' THEN 0 WHEN 'no_meio' THEN 1 ELSE 2 END, x->>'nome'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
             'user_id', tm.user_id, 'nome', coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email),
             'equipe', coalesce(t.name, 'Sem equipe'), 'obrigatorio', coalesce(tm.cargo_id = ANY (v_c.obrigatorio_para), false))
           || situacao_no_curso(v_c.id, tm.user_id) AS x
      FROM tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
      LEFT JOIN teams t ON t.id = tm.team_id
     WHERE tm.tenant_id = v_c.tenant_id AND tm.role IN ('corretor', 'team_leader')
       AND NOT EXISTS (SELECT 1 FROM platform_owners po WHERE po.email = lower(u.email))
       AND universidade_gere_pessoa(v_c.tenant_id, tm.user_id)) s);
END $$;

-- ------------------------------------------------------------
-- Curso obrigatório chega no sino
-- ------------------------------------------------------------
-- Publicou (ou mudou os cargos de um publicado): avisa quem tem o cargo e
-- ainda não foi avisado deste curso. Uma vez por pessoa.
CREATE OR REPLACE FUNCTION public.tg_curso_obrigatorio_avisa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT NEW.publicado OR cardinality(NEW.obrigatorio_para) = 0 THEN RETURN NEW; END IF;
  INSERT INTO notifications (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
  SELECT NEW.tenant_id, m.uid, 'Curso obrigatório: ' || NEW.titulo,
         'Faz parte do seu cargo. Está na Universidade, em Materiais de estudo.',
         'curso_obrigatorio', 'curso', NEW.id::text, jsonb_build_object('curso_id', NEW.id)
    FROM membros_do_publico(NEW.tenant_id, 'cargos', NEW.obrigatorio_para) AS m(uid)
   WHERE NOT EXISTS (SELECT 1 FROM notifications n
                      WHERE n.user_id = m.uid AND n.link_type = 'curso' AND n.link_id = NEW.id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_curso_obrigatorio_avisa ON public.cursos;
CREATE TRIGGER tr_curso_obrigatorio_avisa AFTER INSERT OR UPDATE OF publicado, obrigatorio_para ON public.cursos
  FOR EACH ROW EXECUTE FUNCTION public.tg_curso_obrigatorio_avisa();

-- ------------------------------------------------------------
-- PDI: a trilha da pessoa
-- ------------------------------------------------------------
-- O gestor monta a fila ("até dezembro: curso X + ler o plano de carreira +
-- uma tarefa"). O status de curso e de material NÃO é gravado aqui: sai do
-- certificado e do aceite do material — uma fonte só. Os cursos obrigatórios
-- do cargo entram sozinhos, sem cadastro.
CREATE TABLE IF NOT EXISTS public.pdi_trilhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gestor_id uuid REFERENCES auth.users(id),
  prazo date,
  criada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.pdi_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id uuid NOT NULL REFERENCES public.pdi_trilhas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('curso', 'material', 'tarefa')),
  ref_id uuid,
  titulo text,
  feito_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'tarefa') = (ref_id IS NULL)),
  CHECK (tipo <> 'tarefa' OR length(btrim(coalesce(titulo, ''))) BETWEEN 1 AND 200),
  CHECK (tipo = 'tarefa' OR feito_em IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS pdi_itens_sem_repetir ON public.pdi_itens (trilha_id, tipo, ref_id) WHERE ref_id IS NOT NULL;
ALTER TABLE public.pdi_trilhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdi_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdi_trilhas, public.pdi_itens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdi_trilhas, public.pdi_itens TO service_role;

CREATE OR REPLACE FUNCTION public.trilha_ver(p_tenant_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tr pdi_trilhas%ROWTYPE; v_cargo uuid;
BEGIN
  IF NOT (p_user_id = auth.uid() OR universidade_gere_pessoa(p_tenant_id, p_user_id)) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_tr FROM pdi_trilhas WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  SELECT tm.cargo_id INTO v_cargo FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id;
  RETURN jsonb_build_object(
    'prazo', v_tr.prazo,
    'gestor', (SELECT coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email) FROM auth.users u WHERE u.id = v_tr.gestor_id),
    'pode_editar', universidade_gere_pessoa(p_tenant_id, p_user_id),
    'itens', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'criado_em'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('id', i.id, 'tipo', i.tipo, 'ref_id', i.ref_id, 'origem', 'gestor', 'criado_em', i.criado_em,
        'titulo', CASE i.tipo WHEN 'curso' THEN (SELECT c.titulo FROM cursos c WHERE c.id = i.ref_id)
                              WHEN 'material' THEN (SELECT m.titulo FROM materiais m WHERE m.id = i.ref_id)
                              ELSE i.titulo END,
        'concluido', CASE i.tipo
            WHEN 'curso' THEN situacao_no_curso(i.ref_id, p_user_id)->>'situacao' = 'concluiu'
            WHEN 'material' THEN EXISTS (SELECT 1 FROM materiais m JOIN materiais_leitura l
                                           ON l.material_id = m.id AND l.versao = m.versao AND l.user_id = p_user_id
                                          WHERE m.id = i.ref_id AND (l.aceito_em IS NOT NULL OR (NOT m.obrigatorio AND l.lido_em IS NOT NULL)))
            ELSE i.feito_em IS NOT NULL END) AS x
        FROM pdi_itens i WHERE i.trilha_id = v_tr.id
      UNION ALL
      -- Obrigatório do cargo: entra sozinho, publicado, se o gestor não já pôs.
      SELECT jsonb_build_object('id', NULL, 'tipo', 'curso', 'ref_id', c.id, 'origem', 'cargo', 'criado_em', c.criado_em,
               'titulo', c.titulo, 'concluido', situacao_no_curso(c.id, p_user_id)->>'situacao' = 'concluiu')
        FROM cursos c
       WHERE c.tenant_id = p_tenant_id AND c.publicado AND v_cargo = ANY (c.obrigatorio_para)
         AND NOT EXISTS (SELECT 1 FROM pdi_itens i WHERE i.trilha_id = v_tr.id AND i.tipo = 'curso' AND i.ref_id = c.id)
    ) s)
  );
END $$;

CREATE OR REPLACE FUNCTION public.trilha_adicionar(p_tenant_id uuid, p_user_id uuid, p_tipo text, p_ref_id uuid, p_titulo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tr uuid; v_id uuid;
BEGIN
  IF NOT universidade_gere_pessoa(p_tenant_id, p_user_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF p_tipo = 'curso' AND NOT EXISTS (SELECT 1 FROM cursos WHERE id = p_ref_id AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'item_invalido'; END IF;
  IF p_tipo = 'material' AND NOT EXISTS (SELECT 1 FROM materiais WHERE id = p_ref_id AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'item_invalido'; END IF;
  INSERT INTO pdi_trilhas (tenant_id, user_id, gestor_id) VALUES (p_tenant_id, p_user_id, auth.uid())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET gestor_id = coalesce(pdi_trilhas.gestor_id, EXCLUDED.gestor_id)
  RETURNING id INTO v_tr;
  INSERT INTO pdi_itens (trilha_id, tipo, ref_id, titulo)
  VALUES (v_tr, p_tipo, CASE WHEN p_tipo = 'tarefa' THEN NULL ELSE p_ref_id END, CASE WHEN p_tipo = 'tarefa' THEN btrim(p_titulo) END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.trilha_remover(p_item_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tr pdi_trilhas%ROWTYPE;
BEGIN
  SELECT t.* INTO v_tr FROM pdi_itens i JOIN pdi_trilhas t ON t.id = i.trilha_id WHERE i.id = p_item_id;
  IF v_tr.id IS NULL OR NOT universidade_gere_pessoa(v_tr.tenant_id, v_tr.user_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  DELETE FROM pdi_itens WHERE id = p_item_id;
END $$;

CREATE OR REPLACE FUNCTION public.trilha_prazo(p_tenant_id uuid, p_user_id uuid, p_prazo date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT universidade_gere_pessoa(p_tenant_id, p_user_id) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  INSERT INTO pdi_trilhas (tenant_id, user_id, gestor_id, prazo) VALUES (p_tenant_id, p_user_id, auth.uid(), p_prazo)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET prazo = EXCLUDED.prazo;
END $$;

-- Tarefa: a própria pessoa (ou o gestor) marca feita.
CREATE OR REPLACE FUNCTION public.trilha_marcar_tarefa(p_item_id uuid, p_feita boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tr pdi_trilhas%ROWTYPE;
BEGIN
  SELECT t.* INTO v_tr FROM pdi_itens i JOIN pdi_trilhas t ON t.id = i.trilha_id WHERE i.id = p_item_id AND i.tipo = 'tarefa';
  IF v_tr.id IS NULL OR NOT (v_tr.user_id = auth.uid() OR universidade_gere_pessoa(v_tr.tenant_id, v_tr.user_id)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  UPDATE pdi_itens SET feito_em = CASE WHEN p_feita THEN coalesce(feito_em, now()) END WHERE id = p_item_id;
END $$;

-- Quem o gestor pode montar trilha: a casa (diretoria) ou a equipe (líder).
CREATE OR REPLACE FUNCTION public.trilha_pessoas(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', tm.user_id, 'nome', coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email),
           'equipe', coalesce(t.name, 'Sem equipe')) ORDER BY coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email)), '[]'::jsonb)
    FROM tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id LEFT JOIN teams t ON t.id = tm.team_id
   WHERE tm.tenant_id = p_tenant_id AND tm.role IN ('corretor', 'team_leader')
     AND NOT EXISTS (SELECT 1 FROM platform_owners po WHERE po.email = lower(u.email))
     AND tm.user_id <> auth.uid()
     AND universidade_gere_pessoa(p_tenant_id, tm.user_id)
$$;

REVOKE ALL ON FUNCTION public.universidade_cursos(uuid), public.curso_ver(uuid), public.curso_para_editar(uuid),
                       public.curso_salvar(uuid, jsonb), public.curso_painel(uuid), public.trilha_ver(uuid, uuid),
                       public.trilha_adicionar(uuid, uuid, text, uuid, text), public.trilha_remover(uuid),
                       public.trilha_prazo(uuid, uuid, date), public.trilha_marcar_tarefa(uuid, boolean),
                       public.trilha_pessoas(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.universidade_cursos(uuid), public.curso_ver(uuid), public.curso_para_editar(uuid),
                          public.curso_salvar(uuid, jsonb), public.curso_painel(uuid), public.trilha_ver(uuid, uuid),
                          public.trilha_adicionar(uuid, uuid, text, uuid, text), public.trilha_remover(uuid),
                          public.trilha_prazo(uuid, uuid, date), public.trilha_marcar_tarefa(uuid, boolean),
                          public.trilha_pessoas(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.situacao_no_curso(uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
