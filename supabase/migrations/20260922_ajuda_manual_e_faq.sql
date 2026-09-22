-- ============================================================
-- P4.9 — Ajuda: manual + FAQ
--
-- O CRITÉRIO DE PRONTO DO PLANO é uma frase só: "uma dúvida respondida vira
-- FAQ pesquisável". Tudo aqui existe para isso — a dúvida entra, alguém
-- responde, e a resposta deixa de ser um e-mail para uma pessoa e passa a ser
-- uma resposta para todo mundo que perguntar de novo.
--
-- O QUE FOI MEDIDO ANTES DE ESCREVER (produção, 22/09/2026):
--   · não existe NADA de ajuda: nem artigo, nem FAQ, nem dúvida, nem manual;
--   · o botão "Reportar um problema" existe, funciona e grava em `bug_reports`
--     — que tem 4 linhas, todas testes de dev de 06/05, e **NINGUÉM LÊ**. O
--     repositório inteiro tem uma única referência à tabela, e é o INSERT.
--
-- Esse segundo achado é do mesmo tipo que a tela de integrações que pede senha
-- para o que não existe: um botão que promete que alguém vai olhar, e não há
-- para onde olhar. Por isso a tela de Ajuda mostra as duas coisas a quem
-- administra — as dúvidas e os problemas reportados. O plano manda manter o
-- botão; mantê-lo sem destino seria mantê-lo mentindo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Os artigos: manual e FAQ na mesma tabela
--
-- A diferença entre "artigo do manual" e "pergunta frequente" é o `tipo`, e
-- mais nada: os dois são texto por módulo, pesquisável. Duas tabelas seriam
-- duas buscas, e quem procura não sabe (nem quer saber) em qual está.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ajuda_artigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo = artigo da plataforma, vale para todas as imobiliárias. É como o
  -- manual nasce escrito uma vez só.
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'faq')),
  -- A tela a que o artigo pertence. É o que o (?) de cada tela usa para saber
  -- o que abrir.
  modulo text NOT NULL DEFAULT 'geral',
  titulo text NOT NULL,
  texto text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 100,
  publicado boolean NOT NULL DEFAULT true,
  -- De qual dúvida este FAQ nasceu. Guardado para dar para voltar à pergunta
  -- original quando a resposta ficar confusa.
  duvida_id uuid,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- A busca. Título pesa mais que o texto: quem procura "bolsão" quer o artigo
  -- chamado "Bolsão", não os dez que citam a palavra de passagem.
  --
  -- O acento sai dos DOIS lados — do que é indexado e do que é digitado. O
  -- dicionário português reduz a palavra ao radical, mas NÃO tira acento, e a
  -- extensão `unaccent` não está instalada nesta base. Sem isto, quem digita
  -- "competencia" não acha "competência" — e conclui que a ajuda não tem o
  -- assunto, que é pior do que ela não existir. A função é a mesma que o P4.7
  -- já usa para comparar nomes entre documentos.
  busca tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', public.unaccent_ou_nao(coalesce(titulo, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.unaccent_ou_nao(coalesce(texto, ''))), 'B')
  ) STORED
);

-- Para a migration poder rodar duas vezes: a coluna gerada não muda sozinha.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
              WHERE d.adrelid = 'public.ajuda_artigos'::regclass AND a.attname = 'busca'
                AND pg_get_expr(d.adbin, d.adrelid) NOT LIKE '%unaccent_ou_nao%') THEN
    ALTER TABLE public.ajuda_artigos DROP COLUMN busca;
    ALTER TABLE public.ajuda_artigos ADD COLUMN busca tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('portuguese', public.unaccent_ou_nao(coalesce(titulo, ''))), 'A') ||
      setweight(to_tsvector('portuguese', public.unaccent_ou_nao(coalesce(texto, ''))), 'B')
    ) STORED;
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS ajuda_artigos_busca_idx ON public.ajuda_artigos USING GIN (busca);
CREATE INDEX IF NOT EXISTS ajuda_artigos_modulo_idx ON public.ajuda_artigos (modulo, ordem);

-- O manual da plataforma é único por título. Sem isto, rodar a migration duas
-- vezes duplicaria os artigos semeados abaixo — e a tela de ajuda apareceria
-- com tudo em dobro, sem nada indicando o motivo.
CREATE UNIQUE INDEX IF NOT EXISTS ajuda_artigos_plataforma_uniq
  ON public.ajuda_artigos (titulo) WHERE tenant_id IS NULL;

-- ------------------------------------------------------------
-- As dúvidas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ajuda_duvidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pergunta text NOT NULL,
  -- De qual tela a pessoa perguntou. Metade da dúvida é o contexto: "não
  -- entendi este número" só quer dizer alguma coisa com a tela junto.
  modulo text NOT NULL DEFAULT 'geral',
  tela text NOT NULL DEFAULT '',
  perguntou_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  perguntou_email text NOT NULL DEFAULT '',
  perguntou_em timestamptz NOT NULL DEFAULT now(),
  resposta text NOT NULL DEFAULT '',
  respondeu_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  respondeu_em timestamptz,
  -- O artigo de FAQ que nasceu desta dúvida.
  artigo_id uuid REFERENCES public.ajuda_artigos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'respondida', 'publicada'))
);

CREATE INDEX IF NOT EXISTS ajuda_duvidas_fila_idx
  ON public.ajuda_duvidas (tenant_id, status, perguntou_em DESC);

ALTER TABLE public.ajuda_artigos
  DROP CONSTRAINT IF EXISTS ajuda_artigos_duvida_fk;
ALTER TABLE public.ajuda_artigos
  ADD CONSTRAINT ajuda_artigos_duvida_fk
  FOREIGN KEY (duvida_id) REFERENCES public.ajuda_duvidas(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Fechado para o navegador
-- ------------------------------------------------------------
REVOKE ALL ON public.ajuda_artigos, public.ajuda_duvidas FROM anon, authenticated;
GRANT ALL ON public.ajuda_artigos, public.ajuda_duvidas TO service_role;
ALTER TABLE public.ajuda_artigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajuda_duvidas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- A BUSCA
--
-- Todo membro lê a ajuda: é para isso que ela existe. O que não é de todo
-- mundo é escrever e responder.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ajuda_buscar(
  p_tenant_id uuid,
  p_termo text DEFAULT NULL,
  p_modulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_termo text := NULLIF(btrim(COALESCE(p_termo, '')), '');
  v_q tsquery;
BEGIN
  IF NOT public.is_tenant_member(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;

  -- `websearch_to_tsquery` aguenta o que a pessoa realmente digita — aspas,
  -- "ou", palavra solta — sem estourar. `to_tsquery` explode com um espaço.
  IF v_termo IS NOT NULL THEN
    -- O acento sai também do que foi digitado: os dois lados têm de falar
    -- a mesma língua, senão o índice sem acento nunca casa com a busca com.
    v_q := websearch_to_tsquery('portuguese', public.unaccent_ou_nao(v_termo));
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'tipo', a.tipo, 'modulo', a.modulo, 'titulo', a.titulo,
      'texto', a.texto, 'da_plataforma', a.tenant_id IS NULL
    ) ORDER BY
        CASE WHEN v_q IS NULL THEN 0 ELSE -ts_rank(a.busca, v_q) END,
        a.ordem, a.titulo)
      FROM ajuda_artigos a
     WHERE a.publicado
       AND (a.tenant_id IS NULL OR a.tenant_id = p_tenant_id)
       AND (p_modulo IS NULL OR a.modulo = p_modulo)
       AND (v_q IS NULL OR a.busca @@ v_q)
  ), '[]'::jsonb);
END;
$function$;

-- ============================================================
-- PERGUNTAR À ADMINISTRAÇÃO
--
-- Qualquer membro pergunta. A dúvida carrega a TELA de onde veio: metade da
-- pergunta é o contexto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ajuda_perguntar(
  p_tenant_id uuid,
  p_pergunta text,
  p_modulo text DEFAULT 'geral',
  p_tela text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF NOT public.is_tenant_member(p_tenant_id) THEN RETURN NULL; END IF;
  IF length(btrim(COALESCE(p_pergunta, ''))) < 5 THEN
    RAISE EXCEPTION 'Escreva a dúvida — quem for responder precisa entender o que você quer saber.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO ajuda_duvidas (tenant_id, pergunta, modulo, tela, perguntou_id, perguntou_email)
  VALUES (p_tenant_id, btrim(p_pergunta), COALESCE(NULLIF(p_modulo,''), 'geral'),
          COALESCE(p_tela, ''), auth.uid(), COALESCE(lower(v_email), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('duvida_id', v_id);
END;
$function$;

/** A fila de quem administra: o que perguntaram e ainda não foi respondido. */
CREATE OR REPLACE FUNCTION public.ajuda_duvidas_lista(
  p_tenant_id uuid,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_tenant_admin_or_owner(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'pergunta', d.pergunta, 'modulo', d.modulo, 'tela', d.tela,
      'perguntou_email', d.perguntou_email, 'perguntou_em', d.perguntou_em,
      'resposta', d.resposta, 'respondeu_em', d.respondeu_em,
      'status', d.status, 'artigo_id', d.artigo_id
    ) ORDER BY
        -- O que espera resposta vem primeiro: é a fila de trabalho de alguém.
        CASE d.status WHEN 'aberta' THEN 0 WHEN 'respondida' THEN 1 ELSE 2 END,
        d.perguntou_em DESC)
      FROM ajuda_duvidas d
     WHERE d.tenant_id = p_tenant_id
       AND (p_status IS NULL OR d.status = p_status)
  ), '[]'::jsonb);
END;
$function$;

/** Quem perguntou vê as próprias dúvidas — e a resposta, quando vier. */
CREATE OR REPLACE FUNCTION public.ajuda_minhas_duvidas(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_tenant_member(p_tenant_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'pergunta', d.pergunta, 'modulo', d.modulo,
      'perguntou_em', d.perguntou_em, 'resposta', d.resposta,
      'respondeu_em', d.respondeu_em, 'status', d.status
    ) ORDER BY d.perguntou_em DESC)
      FROM ajuda_duvidas d
     WHERE d.tenant_id = p_tenant_id AND d.perguntou_id = auth.uid()
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ajuda_responder(p_duvida_id uuid, p_resposta text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d public.ajuda_duvidas%ROWTYPE;
BEGIN
  SELECT * INTO v_d FROM ajuda_duvidas WHERE id = p_duvida_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.is_tenant_admin_or_owner(v_d.tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;
  IF length(btrim(COALESCE(p_resposta, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a resposta.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ajuda_duvidas
     SET resposta = btrim(p_resposta), respondeu_id = auth.uid(), respondeu_em = now(),
         -- Já publicada continua publicada: editar a resposta não desfaz o FAQ.
         status = CASE WHEN status = 'publicada' THEN 'publicada' ELSE 'respondida' END
   WHERE id = p_duvida_id;

  -- E o FAQ que nasceu dela acompanha a correção. Sem isto, corrigir a
  -- resposta deixaria o FAQ com a versão errada — que é a que todo mundo lê.
  UPDATE ajuda_artigos SET texto = btrim(p_resposta), atualizado_em = now()
   WHERE id = v_d.artigo_id;

  RETURN jsonb_build_object('respondida', true);
END;
$function$;

-- ============================================================
-- PUBLICAR NO FAQ — o critério de pronto
--
-- "Uma dúvida respondida vira FAQ pesquisável."
-- ============================================================
CREATE OR REPLACE FUNCTION public.ajuda_publicar_no_faq(
  p_duvida_id uuid,
  p_titulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_d public.ajuda_duvidas%ROWTYPE;
  v_artigo uuid;
BEGIN
  SELECT * INTO v_d FROM ajuda_duvidas WHERE id = p_duvida_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.is_tenant_admin_or_owner(v_d.tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;
  IF btrim(COALESCE(v_d.resposta, '')) = '' THEN
    RAISE EXCEPTION 'Responda a dúvida antes de publicá-la no FAQ.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_d.artigo_id IS NOT NULL THEN
    RETURN jsonb_build_object('artigo_id', v_d.artigo_id, 'ja_publicada', true);
  END IF;

  INSERT INTO ajuda_artigos (tenant_id, tipo, modulo, titulo, texto, duvida_id, criado_por)
  VALUES (v_d.tenant_id, 'faq', v_d.modulo,
          -- Sem título dado, a própria pergunta vira o título. É o que alguém
          -- vai procurar da próxima vez.
          COALESCE(NULLIF(btrim(COALESCE(p_titulo, '')), ''), left(v_d.pergunta, 160)),
          v_d.resposta, v_d.id, auth.uid())
  RETURNING id INTO v_artigo;

  UPDATE ajuda_duvidas SET artigo_id = v_artigo, status = 'publicada' WHERE id = p_duvida_id;
  RETURN jsonb_build_object('artigo_id', v_artigo);
END;
$function$;

-- ============================================================
-- O EDITOR DE ARTIGOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.ajuda_artigo_salvar(
  p_tenant_id uuid,
  p_titulo text,
  p_texto text,
  p_modulo text DEFAULT 'geral',
  p_tipo text DEFAULT 'manual',
  p_id uuid DEFAULT NULL,
  p_publicado boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_dono uuid;
BEGIN
  IF NOT public.is_tenant_admin_or_owner(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;
  IF length(btrim(COALESCE(p_titulo, ''))) < 3 THEN
    RAISE EXCEPTION 'O artigo precisa de um título.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT tenant_id INTO v_dono FROM ajuda_artigos WHERE id = p_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- O artigo da plataforma (tenant nulo) vale para todas as imobiliárias:
    -- só o dono da plataforma o edita. Sem isto, uma casa reescreveria o
    -- manual de todas as outras.
    IF v_dono IS NULL AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Este artigo é do manual da plataforma e só o dono dela pode editá-lo.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_dono IS NOT NULL AND v_dono <> p_tenant_id THEN RETURN NULL; END IF;

    UPDATE ajuda_artigos
       SET titulo = btrim(p_titulo), texto = COALESCE(p_texto, ''),
           modulo = COALESCE(NULLIF(p_modulo,''), 'geral'),
           publicado = COALESCE(p_publicado, true), atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO ajuda_artigos (tenant_id, tipo, modulo, titulo, texto, publicado, criado_por)
    VALUES (p_tenant_id,
            CASE WHEN p_tipo = 'faq' THEN 'faq' ELSE 'manual' END,
            COALESCE(NULLIF(p_modulo,''), 'geral'), btrim(p_titulo),
            COALESCE(p_texto, ''), COALESCE(p_publicado, true), auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('artigo_id', v_id);
END;
$function$;

-- ============================================================
-- OS PROBLEMAS REPORTADOS
--
-- O botão "Reportar um problema" existe desde sempre e grava em
-- `bug_reports`. Medido em 22/09: o repositório inteiro tem UMA referência à
-- tabela, e é o INSERT. Ninguém nunca leu os quatro que estão lá.
--
-- Um botão que promete que alguém vai olhar, sem ter para onde olhar, é do
-- mesmo tipo do card de integração que pede senha para o que não existe.
-- ============================================================
-- ------------------------------------------------------------
-- Consertar o que o botão vinha gravando errado
--
-- `SupportService` mandava `id: currentUser.id` — o identificador de QUEM
-- reportou, no campo do identificador DO REPORTE. E `bug_reports` nunca teve
-- chave primária, então nada reclamou: os quatro reportes de produção têm o
-- MESMO id, e `user_id` está vazio nos quatro.
--
-- Consequência: mesmo que alguém abrisse a tabela, não daria para dizer quem
-- reportou o quê. Aqui o autor é devolvido ao campo certo, os identificadores
-- são refeitos e a chave primária passa a existir — para o erro não voltar.
-- ------------------------------------------------------------
UPDATE public.bug_reports
   SET user_id = id
 WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bug_reports.id);

UPDATE public.bug_reports
   SET id = gen_random_uuid()
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bug_reports.id);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.bug_reports'::regclass AND contype = 'p') THEN
    ALTER TABLE public.bug_reports ADD PRIMARY KEY (id);
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.ajuda_problemas_reportados(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_tenant_admin_or_owner(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'titulo', b.title, 'descricao', b.description,
      'tipo', b.type, 'prioridade', b.priority, 'status', b.status,
      -- O endereço de onde foi reportado é o que localiza o problema.
      'url', b.url, 'quando', b.created_at,
      'quem', (SELECT lower(u.email) FROM auth.users u WHERE u.id = b.user_id)
    ) ORDER BY b.created_at DESC)
      FROM bug_reports b
     -- `bug_reports.tenant_id` é TEXTO, não uuid. Comparação como texto de
     -- propósito: converter estouraria na linha antiga que tiver lixo ali, e
     -- a tela inteira sumiria por causa de uma linha.
     WHERE b.tenant_id = p_tenant_id::text
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- O manual que já nasce escrito
--
-- Artigos da PLATAFORMA (tenant nulo): valem para todas as imobiliárias, e
-- tratam do que este plano descobriu que confunde. Uma tela de ajuda vazia no
-- primeiro dia não ajuda ninguém.
-- ------------------------------------------------------------
INSERT INTO public.ajuda_artigos (tenant_id, tipo, modulo, titulo, texto, ordem) VALUES
  (NULL, 'manual', 'geral', 'Como esta ajuda funciona',
   E'Procure pelo que quer saber na caixa de busca — ela lê o manual e as perguntas já respondidas ao mesmo tempo.\n\nO (?) que aparece em cada tela abre direto o que é daquela tela.\n\nNão achou? Use "Perguntar à administração". A resposta chega para você e, quando servir para os outros, vira uma pergunta frequente aqui.', 10),

  (NULL, 'manual', 'metricas', 'Competência e caixa não são a mesma coisa',
   E'COMPETÊNCIA é o mês do resultado. CAIXA é o dia do dinheiro.\n\nUma venda de setembro recebida em outubro é RESULTADO de setembro e CAIXA de outubro. Por isso o DRE e o fluxo de caixa mostram números diferentes para o mesmo mês — e os dois estão certos.', 20),

  (NULL, 'manual', 'metricas', 'Por que às vezes aparece "Sem dados" em vez de zero',
   E'Zero quer dizer "aconteceu zero vez". "Sem dados" quer dizer "não sabemos".\n\nSão coisas diferentes, e misturá-las já fez esta Dash mostrar 100% de retenção numa base sem ninguém. Quando a tela não sabe, ela diz que não sabe.', 30),

  (NULL, 'manual', 'leads', 'O selo de dias parado conta o movimento, não a edição',
   E'O selo conta desde a última vez que o lead ANDOU — mudou de etapa, recebeu mensagem, ganhou atividade.\n\nEle não conta a última vez que alguém salvou o cadastro. Por isso um lead editado hoje pode continuar marcado como parado há 15 dias: editar não é atender.', 40),

  (NULL, 'manual', 'juridico', 'Documentos do cliente: nada entra sem alguém confirmar',
   E'Quando um documento é enviado, a leitura automática PROPÕE os campos — e eles ficam como sugestão, com o quanto ela confia em cada um.\n\nNenhum valor vale antes de uma pessoa abrir, conferir com a imagem ao lado e confirmar. Campo com leitura duvidosa aparece em amarelo; CPF com dígito errado ou documento fora do prazo aparece em vermelho e impede a confirmação até ser corrigido.', 50)
ON CONFLICT (titulo) WHERE tenant_id IS NULL DO NOTHING;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.ajuda_buscar(uuid, text, text)',
    'public.ajuda_perguntar(uuid, text, text, text)',
    'public.ajuda_minhas_duvidas(uuid)',
    'public.ajuda_duvidas_lista(uuid, text)',
    'public.ajuda_responder(uuid, text)',
    'public.ajuda_publicar_no_faq(uuid, text)',
    'public.ajuda_artigo_salvar(uuid, text, text, text, text, uuid, boolean)',
    'public.ajuda_problemas_reportados(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
