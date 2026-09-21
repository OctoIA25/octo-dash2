-- ============================================================
-- P3.4 · OKRs e PDI numa página só
-- ============================================================
-- O plano classifica este item como esforço BAIXO, supondo que as telas
-- funcionam e só a rota está duplicada. Conferido em 21/09/2026, antes de
-- escrever:
--
--   * OKR não tinha banco NENHUM. `useOKRs` carregava sempre lista vazia,
--     criar só mexia na memória do navegador e apagar não apagava nada.
--     Criar um OKR e apertar F5 perdia tudo.
--   * PDI vivia em `localStorage['octodash_pdis']`, filtrado por e-mail e
--     SEM tenant. Trocar de computador perdia o plano.
--   * Gestão de Equipe mostrava "Em breve" para as duas.
--
-- Por isso o critério do plano — "editar um OKR na Home aparece igual em
-- Gestão de Equipe" — era impossível: não sobrevivia nem ao F5 na própria
-- Home. Estas duas tabelas são o que torna o critério verificável.

-- ------------------------------------------------------------
-- 1. OKRs
-- ------------------------------------------------------------
-- `key_results` em jsonb, e não em tabela filha, porque é assim que a tela
-- já os trata: o key result nasce, é editado e morre DENTRO do objetivo, e
-- nada no sistema consulta um key result solto. Uma tabela filha exigiria
-- reescrever as 650 linhas do gerenciador sem responder pergunta nenhuma que
-- hoje não se responda.
CREATE TABLE IF NOT EXISTS public.okrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- De QUEM é o objetivo. E-mail e não user_id porque é a chave que o resto
  -- do sistema usa para identificar pessoa (o card de membro é pelo e-mail),
  -- e porque um OKR pode ser escrito para alguém que ainda não logou.
  corretor_email text NOT NULL,
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  trimestre text NOT NULL,
  ano int NOT NULL,
  progresso numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'cancelado')),
  cor text NOT NULL DEFAULT '#2B59C3',
  key_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordem int NOT NULL DEFAULT 0,
  criador_email text,
  criador_nome text,
  atribuido_por_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT okrs_titulo_nao_vazio CHECK (btrim(titulo) <> ''),
  CONSTRAINT okrs_key_results_e_lista CHECK (jsonb_typeof(key_results) = 'array')
);

-- A consulta da tela é sempre "os OKRs desta imobiliária, desta pessoa,
-- na ordem". O índice segue exatamente essa forma.
CREATE INDEX IF NOT EXISTS okrs_tenant_pessoa_idx
  ON public.okrs (tenant_id, lower(corretor_email), ano, ordem);

DROP TRIGGER IF EXISTS okrs_set_updated_at ON public.okrs;
CREATE TRIGGER okrs_set_updated_at BEFORE UPDATE ON public.okrs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 2. PDI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pdis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  corretor_email text NOT NULL,
  tipo text NOT NULL DEFAULT 'individual'
    CHECK (tipo IN ('individual', 'dinamo', 'personalizado')),
  competencia text NOT NULL DEFAULT '',
  nivel_atual text NOT NULL DEFAULT 'iniciante'
    CHECK (nivel_atual IN ('iniciante', 'intermediario', 'avancado', 'expert')),
  nivel_desejado text NOT NULL DEFAULT 'intermediario'
    CHECK (nivel_desejado IN ('iniciante', 'intermediario', 'avancado', 'expert')),
  progresso numeric NOT NULL DEFAULT 0,
  acoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Do PDI Dinamo e do personalizado: as seções com suas linhas.
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  prazo date,
  status text NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'pausado')),
  observacoes text NOT NULL DEFAULT '',
  ordem int NOT NULL DEFAULT 0,
  criador_email text,
  criador_nome text,
  atribuido_por_admin boolean NOT NULL DEFAULT false,
  -- De onde veio a linha. 'navegador' marca o que subiu do localStorage
  -- antigo, para dar para separar depois o que é migrado do que nasceu aqui.
  origem text NOT NULL DEFAULT 'tela' CHECK (origem IN ('tela', 'navegador')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdis_acoes_e_lista CHECK (jsonb_typeof(acoes) = 'array'),
  CONSTRAINT pdis_sections_e_lista CHECK (jsonb_typeof(sections) = 'array')
);

CREATE INDEX IF NOT EXISTS pdis_tenant_pessoa_idx
  ON public.pdis (tenant_id, lower(corretor_email), ordem);

DROP TRIGGER IF EXISTS pdis_set_updated_at ON public.pdis;
CREATE TRIGGER pdis_set_updated_at BEFORE UPDATE ON public.pdis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 3. Quem enxerga o quê
-- ------------------------------------------------------------
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem os
-- REVOKE abaixo, o plano de desenvolvimento de cada corretor — que é
-- documento de gestão de pessoas — sairia pela API pública.
REVOKE ALL ON public.okrs FROM anon, authenticated;
REVOKE ALL ON public.pdis FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okrs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdis TO authenticated;
GRANT ALL ON public.okrs TO service_role;
GRANT ALL ON public.pdis TO service_role;

ALTER TABLE public.okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdis ENABLE ROW LEVEL SECURITY;

-- O e-mail de quem está pedindo. Numa função só porque as oito políticas
-- abaixo precisam dele e repetir a subconsulta em todas é onde se esquece de
-- corrigir uma.
CREATE OR REPLACE FUNCTION public.email_do_usuario_atual()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT lower(btrim(email)) FROM auth.users WHERE id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.email_do_usuario_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_do_usuario_atual() TO authenticated, service_role;

-- LER: o dono lê o seu; a gestão lê o da imobiliária inteira — é exatamente
-- o que a aba "Gestão de Equipe" existe para fazer. Um corretor NÃO lê o PDI
-- do colega: plano de desenvolvimento é conversa entre a pessoa e o gestor.
DROP POLICY IF EXISTS okrs_select ON public.okrs;
CREATE POLICY okrs_select ON public.okrs
  FOR SELECT TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS pdis_select ON public.pdis;
CREATE POLICY pdis_select ON public.pdis
  FOR SELECT TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

-- ESCREVER: o dono mexe no seu; a gestão mexe no de qualquer um do tenant
-- (é assim que um OKR é atribuído). Em todos os casos a linha tem de ficar
-- no tenant de quem escreve — senão dava para escrever na imobiliária alheia.
DROP POLICY IF EXISTS okrs_insert ON public.okrs;
CREATE POLICY okrs_insert ON public.okrs
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS pdis_insert ON public.pdis;
CREATE POLICY pdis_insert ON public.pdis
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS okrs_update ON public.okrs;
CREATE POLICY okrs_update ON public.okrs
  FOR UPDATE TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS pdis_update ON public.pdis;
CREATE POLICY pdis_update ON public.pdis
  FOR UPDATE TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR public.is_platform_owner()
  );

-- APAGAR: o dono apaga o seu, a gestão apaga o da casa. O botão de apagar da
-- tela de OKR não fazia nada até hoje — a política é o que faz ele passar a
-- apagar de verdade, e só o que pode.
DROP POLICY IF EXISTS okrs_delete ON public.okrs;
CREATE POLICY okrs_delete ON public.okrs
  FOR DELETE TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );

DROP POLICY IF EXISTS pdis_delete ON public.pdis;
CREATE POLICY pdis_delete ON public.pdis
  FOR DELETE TO authenticated
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
     AND lower(corretor_email) = public.email_do_usuario_atual())
    OR public.is_tenant_admin_or_owner(tenant_id)
    OR public.is_platform_owner()
  );
