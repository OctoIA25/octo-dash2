-- ============================================================
-- P3.7 · Aba Marketing: Kanban de demandas
-- ============================================================
-- O critério de pronto do plano é "uma demanda percorre todas as colunas COM
-- HISTÓRICO". Por isso há duas tabelas: a demanda e o registro de cada passo.
--
-- O histórico é gravado por GATILHO, e não pela tela. Uma tela que grava
-- histórico esquece de gravar no dia em que alguém mexe no status por outro
-- caminho — e um histórico com buraco é pior do que nenhum, porque parece
-- completo.

-- ------------------------------------------------------------
-- 1. As demandas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_demandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'post'
    CHECK (tipo IN ('post', 'reels', 'anuncio', 'landing', 'impresso', 'video', 'outro')),
  -- O empreendimento é opcional: "post institucional da imobiliária" é uma
  -- demanda legítima e não é de lançamento nenhum.
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  solicitante_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  objetivo text NOT NULL DEFAULT '',
  publico text NOT NULL DEFAULT '',
  -- Medidas: "1080x1080", "story 9:16". Texto livre porque formato de peça
  -- muda com a plataforma, e uma lista fechada envelheceria em um mês.
  formato text NOT NULL DEFAULT '',
  texto_base text NOT NULL DEFAULT '',
  -- Lista de links. jsonb e não tabela filha: referência nasce, é lida e morre
  -- dentro da demanda, e nada no sistema consulta uma referência solta.
  referencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{nome, caminho, tipo, tamanho}]. O caminho aponta para o bucket privado.
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- OBRIGATÓRIO, como o plano pede. Demanda sem prazo não entra em fila de
  -- ninguém: vira a que sempre pode esperar.
  prazo date NOT NULL,
  status text NOT NULL DEFAULT 'solicitado'
    CHECK (status IN ('solicitado', 'briefing', 'producao', 'revisao', 'aprovado', 'publicado')),
  prioridade text NOT NULL DEFAULT 'media'
    CHECK (prioridade IN ('baixa', 'media', 'alta')),
  -- Posição dentro da coluna, para o arrastar não reordenar sozinho.
  ordem int NOT NULL DEFAULT 0,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_demandas_titulo_nao_vazio CHECK (btrim(titulo) <> ''),
  CONSTRAINT mkt_demandas_referencias_e_lista CHECK (jsonb_typeof(referencias) = 'array'),
  CONSTRAINT mkt_demandas_anexos_e_lista CHECK (jsonb_typeof(anexos) = 'array')
);

CREATE INDEX IF NOT EXISTS mkt_demandas_quadro_idx
  ON public.mkt_demandas (tenant_id, status, ordem);

-- Gatilho próprio, e não o `set_updated_at` compartilhado: ele escreve em
-- `updated_at`, e aqui a coluna é `atualizada_em`. Renomear a coluna para caber
-- no gatilho deixaria a tabela com `criada_em` ao lado de `updated_at` —
-- metade em português, metade em inglês, na mesma linha.
CREATE OR REPLACE FUNCTION public.mkt_demanda_toca_atualizada_em()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.atualizada_em = now();
  RETURN NEW;
END;
$function$;

-- O nome antigo sai junto: uma aplicação anterior desta migration chegou a
-- criar o gatilho apontando para `set_updated_at`, e ele sobreviveria aqui.
DROP TRIGGER IF EXISTS mkt_demandas_set_updated_at ON public.mkt_demandas;
DROP TRIGGER IF EXISTS mkt_demandas_atualizada_em ON public.mkt_demandas;
CREATE TRIGGER mkt_demandas_atualizada_em BEFORE UPDATE ON public.mkt_demandas
  FOR EACH ROW EXECUTE FUNCTION public.mkt_demanda_toca_atualizada_em();

-- ------------------------------------------------------------
-- 2. O histórico
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mkt_demanda_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demanda_id uuid NOT NULL REFERENCES public.mkt_demandas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  de_status text,
  para_status text NOT NULL,
  por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  /**
   * `clock_timestamp()`, e NÃO `now()`.
   *
   * `now()` é o instante em que a TRANSAÇÃO começou: dois eventos gravados na
   * mesma transação recebem a mesma hora, e o histórico — que ordena por esta
   * coluna — sai em ordem arbitrária entre os empatados. Foi assim que o teste
   * do fluxo viu "aprovado → publicado" como PRIMEIRO passo de uma demanda que
   * acabara de nascer.
   *
   * Em produção os passos costumam vir com segundos de diferença, então o erro
   * quase nunca aparece — e é justamente por isso que ele fica. Um histórico
   * que às vezes mente sobre a ordem é pior que nenhum.
   */
  em timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A tabela acima nasce com `CREATE TABLE IF NOT EXISTS`: onde ela JÁ EXISTE, o
-- bloco não roda e o default continua sendo `now()`. Esta linha é o que faz a
-- correção chegar a produção.
ALTER TABLE public.mkt_demanda_eventos
  ALTER COLUMN em SET DEFAULT clock_timestamp();

CREATE INDEX IF NOT EXISTS mkt_demanda_eventos_idx
  ON public.mkt_demanda_eventos (demanda_id, em DESC);

-- ------------------------------------------------------------
-- 3. O histórico se grava sozinho
-- ------------------------------------------------------------
-- Gatilho, e não chamada da tela. Uma tela que grava histórico esquece no dia
-- em que o status muda por outro caminho — um script, outra tela, a mão no
-- banco — e o histórico fica com buraco parecendo completo.
CREATE OR REPLACE FUNCTION public.mkt_demanda_registra_passo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO mkt_demanda_eventos (demanda_id, tenant_id, de_status, para_status, por)
    VALUES (NEW.id, NEW.tenant_id, NULL, NEW.status, COALESCE(auth.uid(), NEW.solicitante_id));
    RETURN NEW;
  END IF;

  -- Só o que muda de coluna vira evento. Editar o texto do briefing não é um
  -- passo do fluxo, e registrá-lo encheria o histórico de ruído.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO mkt_demanda_eventos (demanda_id, tenant_id, de_status, para_status, por)
    VALUES (NEW.id, NEW.tenant_id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mkt_demandas_historico ON public.mkt_demandas;
CREATE TRIGGER mkt_demandas_historico
  AFTER INSERT OR UPDATE ON public.mkt_demandas
  FOR EACH ROW EXECUTE FUNCTION public.mkt_demanda_registra_passo();

-- ------------------------------------------------------------
-- 4. Quem vê e quem mexe
-- ------------------------------------------------------------
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova.
REVOKE ALL ON public.mkt_demandas FROM anon, authenticated;
REVOKE ALL ON public.mkt_demanda_eventos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_demandas TO authenticated;
GRANT SELECT ON public.mkt_demanda_eventos TO authenticated;
GRANT ALL ON public.mkt_demandas TO service_role;
GRANT ALL ON public.mkt_demanda_eventos TO service_role;

ALTER TABLE public.mkt_demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_demanda_eventos ENABLE ROW LEVEL SECURITY;

-- Demanda de marketing é trabalho da casa, e não documento pessoal: todo mundo
-- do tenant lê. É o oposto do PDI, onde o recorte por pessoa é o ponto.
DROP POLICY IF EXISTS mkt_demandas_select ON public.mkt_demandas;
CREATE POLICY mkt_demandas_select ON public.mkt_demandas
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS mkt_demanda_eventos_select ON public.mkt_demanda_eventos;
CREATE POLICY mkt_demanda_eventos_select ON public.mkt_demanda_eventos
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Qualquer membro PEDE uma peça — é o ponto do quadro: o corretor pede, o
-- marketing produz.
DROP POLICY IF EXISTS mkt_demandas_insert ON public.mkt_demandas;
CREATE POLICY mkt_demandas_insert ON public.mkt_demandas
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()));

-- Mexer: quem pediu, quem é responsável, ou a gestão. Um corretor que pudesse
-- mover a demanda alheia bagunçaria a fila de quem produz.
DROP POLICY IF EXISTS mkt_demandas_update ON public.mkt_demandas;
CREATE POLICY mkt_demandas_update ON public.mkt_demandas
  FOR UPDATE TO authenticated
  USING (
    solicitante_id = auth.uid()
    OR responsavel_id = auth.uid()
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS mkt_demandas_delete ON public.mkt_demandas;
CREATE POLICY mkt_demandas_delete ON public.mkt_demandas
  FOR DELETE TO authenticated
  USING (
    solicitante_id = auth.uid()
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

-- ------------------------------------------------------------
-- 5. O bucket dos anexos
-- ------------------------------------------------------------
-- PRIVADO. Peça em produção é material não publicado da casa: preço,
-- lançamento não anunciado, arte antes da aprovação. Bucket público entregaria
-- tudo isso a quem adivinhasse a URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mkt-demandas',
  'mkt-demandas',
  false,
  52428800, -- 50MB: arte de impresso e vídeo curto passam de 20MB com folga
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/quicktime',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O recorte de tenant vem do CAMINHO (tenant/demanda/arquivo), como no bucket
-- de documentos do lead. Comparação como texto: um caminho fora do formato não
-- pode derrubar a consulta inteira.
DROP POLICY IF EXISTS "mkt demandas: subir anexo" ON storage.objects;
CREATE POLICY "mkt demandas: subir anexo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mkt-demandas' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "mkt demandas: ler anexo" ON storage.objects;
CREATE POLICY "mkt demandas: ler anexo"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'mkt-demandas' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "mkt demandas: apagar anexo" ON storage.objects;
CREATE POLICY "mkt demandas: apagar anexo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mkt-demandas' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 6. O quadro
-- ------------------------------------------------------------
-- Traz as demandas com o nome de quem pediu, de quem produz e do
-- empreendimento — resolvidos aqui, e não com três consultas no front.
CREATE OR REPLACE FUNCTION public.mkt_quadro_de_demandas(
  p_tenant_id uuid,
  -- Concluídas antigas somem do quadro: "Publicado" acumularia para sempre e
  -- a coluna viraria um arquivo morto. NULL traz tudo.
  p_publicados_desde date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_desde date := COALESCE(p_publicados_desde, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 60);
  v_linhas jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'titulo', d.titulo,
           'tipo', d.tipo,
           'status', d.status,
           'prioridade', d.prioridade,
           'prazo', d.prazo,
           'ordem', d.ordem,
           'objetivo', d.objetivo,
           'publico', d.publico,
           'formato', d.formato,
           'texto_base', d.texto_base,
           'referencias', d.referencias,
           'anexos', d.anexos,
           'lancamento_id', d.lancamento_id,
           'empreendimento', NULLIF(btrim(l.nome), ''),
           'solicitante_id', d.solicitante_id,
           'solicitante', COALESCE(us.raw_user_meta_data->>'name', us.email),
           'responsavel_id', d.responsavel_id,
           'responsavel', COALESCE(ur.raw_user_meta_data->>'name', ur.email),
           'criada_em', d.criada_em
         ) ORDER BY d.ordem, d.criada_em), '[]'::jsonb) INTO v_linhas
    FROM mkt_demandas d
    LEFT JOIN lancamentos l ON l.id = d.lancamento_id
    LEFT JOIN auth.users us ON us.id = d.solicitante_id
    LEFT JOIN auth.users ur ON ur.id = d.responsavel_id
   WHERE d.tenant_id = p_tenant_id
     AND (d.status <> 'publicado' OR d.atualizada_em::date >= v_desde);

  RETURN jsonb_build_object('demandas', v_linhas, 'publicados_desde', v_desde);
END;
$function$;

REVOKE ALL ON FUNCTION public.mkt_quadro_de_demandas(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_quadro_de_demandas(uuid, date) TO authenticated, service_role;

-- O histórico de uma demanda, com quem fez cada passo.
CREATE OR REPLACE FUNCTION public.mkt_historico_da_demanda(
  p_tenant_id uuid,
  p_demanda_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_demanda_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'de', e.de_status,
           'para', e.para_status,
           'em', e.em,
           'por', COALESCE(u.raw_user_meta_data->>'name', u.email)
         ) ORDER BY e.em, e.id), '[]'::jsonb) INTO v_out
    FROM mkt_demanda_eventos e
    LEFT JOIN auth.users u ON u.id = e.por
   WHERE e.demanda_id = p_demanda_id AND e.tenant_id = p_tenant_id;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.mkt_historico_da_demanda(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_historico_da_demanda(uuid, uuid) TO authenticated, service_role;
