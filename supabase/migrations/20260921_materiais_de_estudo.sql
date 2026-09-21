-- ============================================================
-- P4.2 — Materiais de estudo
--
-- Plano de carreira, regras de comissão, regimento, scripts e treinamentos num
-- lugar só, com versão e leitura obrigatória com aceite.
--
-- DUAS DECISÕES DE DESENHO QUE VALE REGISTRAR:
--
-- 1. A LEITURA É POR VERSÃO, e não por material. Quem leu a versão 1 do
--    regimento não leu a versão 2 — e é exatamente por isso que o gestor
--    precisa do relatório. Guardar só "fulano leu o regimento" faria a
--    revisão de uma regra passar despercebida por todo mundo que já a tinha
--    lido uma vez.
--
-- 2. O PLANO DE CARREIRA NÃO TEM CORPO GUARDADO. Os níveis e percentuais já
--    vivem no motor de comissão (`src/features/comissionamento/commissionRules.ts`),
--    usado em cinco telas. Copiá-los para cá criaria a segunda fonte que o
--    chefe proíbe — e no dia em que as duas discordassem, o corretor estaria
--    lendo a errada. O material existe como linha (aparece na lista, pode ser
--    obrigatório, tem aceite), e o corpo é DESENHADO pela tela a partir do
--    motor. É o que `tipo = 'niveis_de_comissao'` significa.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Os materiais
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  resumo text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT 'outros' CHECK (categoria IN
    ('plano_de_carreira', 'comissao', 'regimento', 'scripts', 'treinamentos', 'outros')),
  -- 'niveis_de_comissao' é o material cujo corpo vem do motor, e não do banco.
  tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN
    ('texto', 'arquivo', 'link', 'niveis_de_comissao')),
  conteudo text NOT NULL DEFAULT '',
  arquivo text,
  link_url text,
  versao integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  publicado_em timestamptz,
  obrigatorio boolean NOT NULL DEFAULT false,
  -- Para quem é. 'cargo' amarra no cadastro do P4.1.
  publico text NOT NULL DEFAULT 'todos' CHECK (publico IN ('todos', 'cargo', 'equipe')),
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  team_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materiais_tenant_idx
  ON public.materiais (tenant_id, categoria, publicado_em DESC);
CREATE INDEX IF NOT EXISTS materiais_obrigatorios_idx
  ON public.materiais (tenant_id) WHERE obrigatorio AND ativo AND publicado_em IS NOT NULL;

-- Um material do tipo "níveis de comissão" por imobiliária: dois seriam duas
-- respostas para a mesma pergunta na mesma lista.
CREATE UNIQUE INDEX IF NOT EXISTS materiais_niveis_uniq
  ON public.materiais (tenant_id) WHERE tipo = 'niveis_de_comissao';

-- ------------------------------------------------------------
-- 2. O histórico de versões
-- ------------------------------------------------------------
-- "Cada nova versão mantém a anterior no histórico", diz o plano. Sem isto,
-- quem aceitou a versão 1 não teria como mostrar o que aceitou.
CREATE TABLE IF NOT EXISTS public.materiais_versoes (
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL DEFAULT '',
  arquivo text,
  link_url text,
  nota_da_versao text NOT NULL DEFAULT '',
  publicado_em timestamptz NOT NULL DEFAULT now(),
  publicado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (material_id, versao)
);

-- ------------------------------------------------------------
-- 3. Quem leu o quê
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materiais_leitura (
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  -- A VERSÃO FAZ PARTE DA CHAVE. Quem leu a v1 não leu a v2.
  versao integer NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lido_em timestamptz NOT NULL DEFAULT now(),
  -- Só o material obrigatório pede "Li e entendi". Separar as duas datas
  -- distingue "abriu" de "declarou que entendeu" — e é a segunda que vale
  -- como registro.
  aceito_em timestamptz,
  PRIMARY KEY (material_id, versao, user_id)
);

CREATE INDEX IF NOT EXISTS materiais_leitura_membro_idx
  ON public.materiais_leitura (tenant_id, user_id);

-- ------------------------------------------------------------
-- 4. Fechado para o front
-- ------------------------------------------------------------
REVOKE ALL ON public.materiais FROM anon, authenticated;
REVOKE ALL ON public.materiais_versoes FROM anon, authenticated;
REVOKE ALL ON public.materiais_leitura FROM anon, authenticated;
GRANT ALL ON public.materiais, public.materiais_versoes, public.materiais_leitura TO service_role;

ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_leitura ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. O arquivo do material
-- ------------------------------------------------------------
-- Privado, mas de LEITURA PARA TODO MEMBRO — ao contrário da nota fiscal, que
-- é de admin. Material de estudo existe para ser lido; quem escreve é quem
-- administra.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materiais-estudo', 'materiais-estudo', false,
  52428800, -- 50MB: apostila em PDF com imagem passa dos 20MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'application/zip',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "materiais: ler" ON storage.objects;
CREATE POLICY "materiais: ler"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'materiais-estudo' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "materiais: subir" ON storage.objects;
CREATE POLICY "materiais: subir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'materiais-estudo' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

DROP POLICY IF EXISTS "materiais: apagar" ON storage.objects;
CREATE POLICY "materiais: apagar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'materiais-estudo' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

-- O PostgREST guarda o desenho das tabelas em memória: sem isto, as colunas
-- novas ficam invisíveis para o app e a tela erra em silêncio.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 6. O QUE A TELA LÊ E ESCREVE
-- ============================================================

/** Quem administra materiais: admin/gestão da imobiliária ou o dono da plataforma. */
CREATE OR REPLACE FUNCTION public.materiais_pode_gerir(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id));
$function$;

/** É membro desta imobiliária? Todo membro LÊ os materiais. */
CREATE OR REPLACE FUNCTION public.materiais_pode_ler(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR EXISTS (SELECT 1 FROM tenant_memberships tm
                      WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid()));
$function$;

/**
 * Este material é para esta pessoa?
 *
 * Separada porque a mesma pergunta é feita em três lugares — a lista, os
 * pendentes e o relatório. Duas cópias divergiriam na primeira correção, e a
 * divergência apareceria como "sumiu um material" para uma pessoa só.
 */
CREATE OR REPLACE FUNCTION public.material_alcanca(p_material_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM materiais m
      JOIN tenant_memberships tm
        ON tm.tenant_id = m.tenant_id AND tm.user_id = p_user_id
     WHERE m.id = p_material_id
       AND m.ativo AND m.publicado_em IS NOT NULL
       AND CASE m.publico
             WHEN 'cargo' THEN tm.cargo_id IS NOT DISTINCT FROM m.cargo_id AND m.cargo_id IS NOT NULL
             WHEN 'equipe' THEN tm.team_id IS NOT DISTINCT FROM m.team_id AND m.team_id IS NOT NULL
             ELSE true
           END
  );
$function$;

-- ------------------------------------------------------------
-- A lista, do ponto de vista de quem abre
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materiais_listar(
  p_tenant_id uuid,
  -- Quem gere pode pedir a lista completa, inclusive rascunhos.
  p_incluir_rascunhos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_eu uuid := auth.uid();
  v_gere boolean := public.materiais_pode_gerir(p_tenant_id);
  v_agora timestamptz := now();
  v_linhas jsonb;
BEGIN
  IF NOT public.materiais_pode_ler(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'categoria', x->>'titulo'), '[]'::jsonb)
    INTO v_linhas
    FROM (
      SELECT jsonb_build_object(
        'id', m.id, 'titulo', m.titulo, 'resumo', m.resumo,
        'categoria', m.categoria, 'tipo', m.tipo,
        'conteudo', m.conteudo, 'arquivo', m.arquivo, 'link_url', m.link_url,
        'versao', m.versao, 'publicado_em', m.publicado_em,
        'obrigatorio', m.obrigatorio, 'publico', m.publico,
        'cargo_id', m.cargo_id, 'team_id', m.team_id, 'ativo', m.ativo,
        'rascunho', m.publicado_em IS NULL,
        -- "Novo" é o publicado há menos de 7 dias, como o plano pede.
        'novo', m.publicado_em IS NOT NULL AND m.publicado_em > v_agora - interval '7 days',
        -- A leitura é DESTA versão: quem leu a anterior aparece como não lido.
        'lido_em', (SELECT l.lido_em FROM materiais_leitura l
                     WHERE l.material_id = m.id AND l.versao = m.versao AND l.user_id = v_eu),
        'aceito_em', (SELECT l.aceito_em FROM materiais_leitura l
                       WHERE l.material_id = m.id AND l.versao = m.versao AND l.user_id = v_eu),
        -- Só quem gere precisa destes dois; para o corretor eles são ruído.
        'leram', CASE WHEN v_gere THEN
                   (SELECT count(*) FROM materiais_leitura l
                     WHERE l.material_id = m.id AND l.versao = m.versao) END,
        'aceitaram', CASE WHEN v_gere THEN
                       (SELECT count(*) FROM materiais_leitura l
                         WHERE l.material_id = m.id AND l.versao = m.versao AND l.aceito_em IS NOT NULL) END
      ) AS x
      FROM materiais m
     WHERE m.tenant_id = p_tenant_id
       AND (m.ativo OR (v_gere AND p_incluir_rascunhos))
       AND (
         -- Quem gere e pediu rascunhos vê tudo; os demais, só o publicado que
         -- os alcança.
         (v_gere AND p_incluir_rascunhos)
         OR (m.publicado_em IS NOT NULL
             AND (v_eu IS NULL OR public.is_platform_owner()
                  OR public.material_alcanca(m.id, v_eu)))
       )
    ) t;

  RETURN jsonb_build_object(
    'pode_gerir', v_gere,
    'materiais', v_linhas
  );
END;
$function$;

-- ------------------------------------------------------------
-- Criar, editar e publicar
-- ------------------------------------------------------------
-- `p_nova_versao` é o que separa "corrigi uma vírgula" de "mudei a regra". A
-- versão nova zera a leitura de todo mundo — e é isso que faz o gestor
-- descobrir quem ainda não leu a revisão.
CREATE OR REPLACE FUNCTION public.material_salvar(
  p_tenant_id   uuid,
  p_titulo      text,
  p_categoria   text,
  p_tipo        text,
  p_conteudo    text DEFAULT '',
  p_resumo      text DEFAULT '',
  p_arquivo     text DEFAULT NULL,
  p_link_url    text DEFAULT NULL,
  p_obrigatorio boolean DEFAULT false,
  p_publico     text DEFAULT 'todos',
  p_cargo_id    uuid DEFAULT NULL,
  p_team_id     uuid DEFAULT NULL,
  p_publicar    boolean DEFAULT true,
  p_id          uuid DEFAULT NULL,
  p_nova_versao boolean DEFAULT false,
  p_nota        text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.materiais%ROWTYPE;
  v_versao integer;
BEGIN
  IF NOT public.materiais_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_titulo), '') = '' THEN
    RAISE EXCEPTION 'O material precisa de um título.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_publico = 'cargo' AND p_cargo_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o cargo que deve ver este material.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_publico = 'equipe' AND p_team_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a equipe que deve ver este material.' USING ERRCODE = 'check_violation';
  END IF;
  -- Um material sem corpo nenhum é uma linha vazia na lista.
  IF p_tipo = 'texto' AND COALESCE(btrim(p_conteudo), '') = '' THEN
    RAISE EXCEPTION 'Escreva o conteúdo do material.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'link' AND COALESCE(btrim(p_link_url), '') = '' THEN
    RAISE EXCEPTION 'Informe o endereço do vídeo ou da página.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'arquivo' AND COALESCE(btrim(p_arquivo), '') = '' THEN
    RAISE EXCEPTION 'Anexe o arquivo do material.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO materiais (tenant_id, titulo, resumo, categoria, tipo, conteudo, arquivo,
                           link_url, obrigatorio, publico, cargo_id, team_id,
                           publicado_em, versao)
    VALUES (p_tenant_id, btrim(p_titulo), COALESCE(p_resumo, ''), p_categoria, p_tipo,
            COALESCE(p_conteudo, ''), p_arquivo, p_link_url,
            COALESCE(p_obrigatorio, false), COALESCE(p_publico, 'todos'),
            p_cargo_id, p_team_id,
            CASE WHEN p_publicar THEN now() END, 1)
    RETURNING * INTO v_m;
    v_versao := 1;
  ELSE
    SELECT versao INTO v_versao FROM materiais WHERE id = p_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_nova_versao THEN v_versao := v_versao + 1; END IF;

    UPDATE materiais SET
      titulo = btrim(p_titulo), resumo = COALESCE(p_resumo, ''),
      categoria = p_categoria, tipo = p_tipo,
      conteudo = COALESCE(p_conteudo, ''), arquivo = p_arquivo, link_url = p_link_url,
      obrigatorio = COALESCE(p_obrigatorio, false),
      publico = COALESCE(p_publico, 'todos'),
      cargo_id = p_cargo_id, team_id = p_team_id,
      versao = v_versao,
      publicado_em = CASE WHEN p_publicar THEN COALESCE(publicado_em, now()) ELSE NULL END,
      atualizado_em = now()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_m;
  END IF;

  -- O histórico guarda a versão como ela ficou. Sem isto, quem aceitou a v1
  -- não teria como mostrar o que aceitou.
  INSERT INTO materiais_versoes (material_id, versao, titulo, conteudo, arquivo,
                                 link_url, nota_da_versao, publicado_por)
  VALUES (v_m.id, v_versao, v_m.titulo, v_m.conteudo, v_m.arquivo, v_m.link_url,
          COALESCE(p_nota, ''), auth.uid())
  ON CONFLICT (material_id, versao) DO UPDATE
    SET titulo = EXCLUDED.titulo, conteudo = EXCLUDED.conteudo,
        arquivo = EXCLUDED.arquivo, link_url = EXCLUDED.link_url,
        nota_da_versao = EXCLUDED.nota_da_versao;

  RETURN jsonb_build_object(
    'id', v_m.id, 'titulo', v_m.titulo, 'versao', v_m.versao,
    'publicado', v_m.publicado_em IS NOT NULL,
    -- Quantas pessoas precisam ler de novo por causa desta versão.
    'releitura', CASE WHEN p_nova_versao THEN
      (SELECT count(*) FROM materiais_leitura l WHERE l.material_id = v_m.id AND l.versao = v_versao - 1)
      ELSE 0 END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.material_excluir(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_m public.materiais%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM materiais WHERE id = p_material_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.materiais_pode_gerir(v_m.tenant_id) THEN RETURN NULL; END IF;

  -- Arquiva em vez de apagar: o aceite de quem já leu é registro, e some junto
  -- se a linha for embora.
  UPDATE materiais SET ativo = false, atualizado_em = now() WHERE id = p_material_id;
  RETURN jsonb_build_object('arquivado', true, 'titulo', v_m.titulo);
END;
$function$;

-- ------------------------------------------------------------
-- Ler e aceitar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.material_registrar_leitura(
  p_material_id uuid,
  p_aceitar     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.materiais%ROWTYPE;
  v_eu uuid := auth.uid();
BEGIN
  SELECT * INTO v_m FROM materiais WHERE id = p_material_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_eu IS NULL THEN RETURN NULL; END IF;
  -- Só se registra leitura do que alcança a pessoa: gravar de um material que
  -- ela nem vê encheria o relatório do gestor de linha sem sentido.
  IF NOT public.material_alcanca(p_material_id, v_eu) THEN RETURN NULL; END IF;

  INSERT INTO materiais_leitura (material_id, versao, user_id, tenant_id, lido_em, aceito_em)
  VALUES (p_material_id, v_m.versao, v_eu, v_m.tenant_id, now(),
          CASE WHEN p_aceitar THEN now() END)
  ON CONFLICT (material_id, versao, user_id) DO UPDATE
    -- A primeira leitura manda: reabrir o material não reescreve a data.
    SET aceito_em = COALESCE(materiais_leitura.aceito_em,
                             CASE WHEN p_aceitar THEN now() END);

  RETURN jsonb_build_object('material', v_m.titulo, 'versao', v_m.versao, 'aceito', p_aceitar);
END;
$function$;

-- ------------------------------------------------------------
-- O que EU ainda devo aceitar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materiais_pendentes(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid := auth.uid();
BEGIN
  IF NOT public.materiais_pode_ler(p_tenant_id) OR v_eu IS NULL THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'titulo', m.titulo, 'categoria', m.categoria, 'versao', m.versao
    ) ORDER BY m.publicado_em)
      FROM materiais m
     WHERE m.tenant_id = p_tenant_id
       AND m.obrigatorio AND m.ativo AND m.publicado_em IS NOT NULL
       AND public.material_alcanca(m.id, v_eu)
       AND NOT EXISTS (
         SELECT 1 FROM materiais_leitura l
          WHERE l.material_id = m.id AND l.versao = m.versao
            AND l.user_id = v_eu AND l.aceito_em IS NOT NULL)
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- O relatório do gestor: quem ainda não leu
-- ------------------------------------------------------------
-- Segundo critério de pronto do plano. O valor está em QUEM FALTA, não em
-- quem leu: a lista de quem leu não move ninguém a cobrar nada.
CREATE OR REPLACE FUNCTION public.material_relatorio(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.materiais%ROWTYPE;
  v_linhas jsonb;
BEGIN
  SELECT * INTO v_m FROM materiais WHERE id = p_material_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.materiais_pode_gerir(v_m.tenant_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', tm.user_id,
    'email', u.email,
    'role', tm.role,
    'lido_em', l.lido_em,
    'aceito_em', l.aceito_em
  ) ORDER BY (l.aceito_em IS NOT NULL), (l.lido_em IS NOT NULL), u.email), '[]'::jsonb)
    INTO v_linhas
    FROM tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
    LEFT JOIN materiais_leitura l
      ON l.material_id = v_m.id AND l.versao = v_m.versao AND l.user_id = tm.user_id
   WHERE tm.tenant_id = v_m.tenant_id
     AND public.material_alcanca(v_m.id, tm.user_id);

  RETURN jsonb_build_object(
    'material', v_m.titulo,
    'versao', v_m.versao,
    'obrigatorio', v_m.obrigatorio,
    'alcanca', jsonb_array_length(v_linhas),
    'leram', (SELECT count(*) FROM jsonb_array_elements(v_linhas) x WHERE x->>'lido_em' IS NOT NULL),
    'aceitaram', (SELECT count(*) FROM jsonb_array_elements(v_linhas) x WHERE x->>'aceito_em' IS NOT NULL),
    'pessoas', v_linhas
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.material_versoes(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_m public.materiais%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM materiais WHERE id = p_material_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.materiais_pode_ler(v_m.tenant_id) THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'versao', v.versao, 'titulo', v.titulo, 'nota', v.nota_da_versao,
      'publicado_em', v.publicado_em, 'autor', COALESCE(u.email, 'sistema'),
      'leram', (SELECT count(*) FROM materiais_leitura l
                 WHERE l.material_id = v.material_id AND l.versao = v.versao)
    ) ORDER BY v.versao DESC)
      FROM materiais_versoes v
      LEFT JOIN auth.users u ON u.id = v.publicado_por
     WHERE v.material_id = p_material_id
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.materiais_pode_gerir(uuid)',
    'public.materiais_pode_ler(uuid)',
    'public.material_alcanca(uuid, uuid)',
    'public.materiais_listar(uuid, boolean)',
    'public.material_salvar(uuid, text, text, text, text, text, text, text, boolean, text, uuid, uuid, boolean, uuid, boolean, text)',
    'public.material_excluir(uuid)',
    'public.material_registrar_leitura(uuid, boolean)',
    'public.materiais_pendentes(uuid)',
    'public.material_relatorio(uuid)',
    'public.material_versoes(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;
