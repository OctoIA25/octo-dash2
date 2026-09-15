-- Migration: quem edita o imóvel, quem vê o proprietário e o que a publicação exige
-- Data: 2026-09-15
--
-- Como era (conferido no banco em 15/set):
--   - A RLS de imoveis_locais (imoveis_locais_tenant) é FOR ALL para qualquer
--     membro do tenant. Qualquer corretor editava ou excluía qualquer imóvel pela
--     API; quem editava era decidido só na UI (podeEditarImovel).
--   - authenticated tinha SELECT em todas as colunas: o `select('*')` do catálogo
--     entregava nome, telefones e e-mail do proprietário a todo membro, e o
--     autocomplete buscava proprietário por nome em todos os imóveis do tenant.
--   - O histórico (imoveis_locais_log, legível por todo membro) guardava o
--     proprietário em claro no diff.
--   - Publicar exigia nome do proprietário e CEP, só no formulário.
--
-- Regra nova — uma função decide as duas perguntas (imovel_autoriza):
--
--   'editar' (UPDATE/DELETE):
--     1. owner da plataforma → sim (acesso entre tenants por impersonation, como antes);
--     2. sem membership no tenant DO IMÓVEL → não (fronteira de tenant);
--     3. admin/owner do tenant → sim;
--     4. autor do rascunho → sim, enquanto for rascunho;
--     5. captador → sim;
--     6. team_leader → atuação que cobre a finalidade (sem atuação marcada cobre
--        tudo, o mesmo fail-open de atuacoesDe/podeEditarImovel) OU captador
--        liderado por ele (tenant_memberships.leader_user_id);
--     7. senão → não.
--
--   'ver_proprietario' (ler e alterar proprietario_*):
--     passos 1-5 iguais; no 6, só o GESTOR DE TERCEIROS: team_leader com atuação
--     EXPLÍCITA que cobre a finalidade (prontos → venda, alugados → locação,
--     venda_locacao → qualquer das duas). Sem fail-open e sem a regra da equipe:
--     gestor sem atuação marcada, ou que só lidera o captador, edita mas não vê
--     o proprietário. "Terceiros" é o que não é lançamento — mesma divisão da
--     comissão (lançamento 3,5% / terceiros 6%). Na Lotus, a Mari é team_leader
--     com atuacao ["prontos"]: vê os proprietários dos imóveis de venda do tenant.
--
--   Captador = captador_id / captador_2_id; sem nenhum dos dois, quem cadastrou
--   (criado_por — é a quem a publicação atribui o imóvel). imoveis_corretores NÃO
--   entra: é espelho do XML e qualquer membro grava nele pela RLS, então contar
--   com ele deixaria o corretor se declarar captador. Pelo mesmo motivo criado_por
--   passa a ser imutável para quem não é admin/owner.
--
-- O que muda:
--   1. Funções: atuacao_cobre_finalidade (espelho de atuacoesDe) e imovel_autoriza.
--   2. tg_guard_edicao_imovel (BEFORE UPDATE OR DELETE): sem 'editar' → 42501.
--      Exceção: gestor que aprova (proposals_is_tenant_manager) muda só as colunas
--      de aprovação, como a aba Meus Imóveis faz. Alterar proprietario_* exige
--      'ver_proprietario'. Trigger e não policy porque a policy de UPDATE não
--      separa colunas (a aprovação quebraria) e porque o erro explícito é melhor
--      que o "0 linhas" silencioso da RLS. A RLS continua sendo a fronteira de
--      tenant (imoveis_locais_tenant intacta).
--   3. authenticated perde SELECT nas 5 colunas proprietario_* (mesmo recurso já
--      usado para anon nesta tabela em 20260717). Leitura só pelas RPCs:
--        - imoveis_proprietarios(tenant, codigo?, busca?) — só as linhas autorizadas;
--        - imoveis_duplicados_proprietario(...) — aviso de duplicidade sem devolver
--          dado pessoal (compara no banco);
--        - imoveis_editaveis(tenant) — códigos que o usuário edita, para a UI.
--      ATENÇÃO para migrations futuras: coluna nova em imoveis_locais precisa de
--      `GRANT SELECT (coluna) ON public.imoveis_locais TO authenticated`, senão
--      qualquer select dela pelo navegador dá 42501.
--      Consequência para o front: `select('*')` e `upsert` com proprietario_* dão
--      42501 (ON CONFLICT ... SET col = EXCLUDED.col exige SELECT na coluna). O
--      formulário passa a usar insert/update, que não exigem.
--   4. tg_valida_publicacao_imovel (AFTER INSERT OR UPDATE): imóvel fora de
--      rascunho exige nome do proprietário, telefone ou e-mail dele e o endereço
--      (CEP de 8 dígitos, logradouro, número, bairro, cidade, estado) — os campos
--      do bloco Endereço do completômetro. Vale na publicação (INSERT fora de
--      rascunho ou rascunho → publicado) e, em imóvel já publicado, só para quem
--      APAGA um desses campos: os publicados antes desta regra continuam
--      editáveis e o job de marca d'água (service_role) continua gravando fotos.
--      AFTER e não BEFORE: no upsert o BEFORE INSERT roda na linha proposta, que
--      não tem as colunas omitidas. Erro 23514 com a lista do que falta; como é
--      um statement só, a tentativa inválida não altera o rascunho gravado.
--   5. O log guarda "oculto" no lugar do valor de proprietario_* (e as 10 linhas
--      antigas com proprietário em claro são mascaradas). Continua registrando
--      quem mudou e quando.
--
-- Sem mudança: policies de imoveis_locais, anon (já sem proprietario_*),
-- service_role, tg_guard_captador, tg_guard_status_aprovacao, portal_imoveis.
--
-- ORDEM DO DEPLOY: aplicar junto com o front desta versão. O front antigo faz
-- `select('*')` em imoveis_locais e para de carregar os imóveis locais.
--
-- ROLLBACK (o mascaramento do log não volta):
--   BEGIN;
--   DROP TRIGGER IF EXISTS tg_guard_edicao_imovel ON public.imoveis_locais;
--   DROP TRIGGER IF EXISTS tg_valida_publicacao_imovel ON public.imoveis_locais;
--   DROP FUNCTION IF EXISTS public.tg_guard_edicao_imovel();
--   DROP FUNCTION IF EXISTS public.tg_valida_publicacao_imovel();
--   DROP FUNCTION IF EXISTS public.imoveis_editaveis(uuid);
--   DROP FUNCTION IF EXISTS public.imoveis_proprietarios(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.imoveis_duplicados_proprietario(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer);
--   DROP FUNCTION IF EXISTS public.imovel_autoriza(text, uuid, text, text, uuid, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.atuacao_cobre_finalidade(jsonb, text, boolean);
--   GRANT SELECT ON public.imoveis_locais TO authenticated;
--   -- e reaplicar imoveis_locais_log_resumo de 20260817_imoveis_locais_log.sql.
--   COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. Regras
-- ============================================================================

-- Espelho de atuacoesDe (src/types/permissions.ts) + ATUACOES_POR_FINALIDADE.
-- p_sem_atuacao_cobre: o que vale quando a atuação está ausente ou inválida
-- (true = fail-open da edição; false = exige marcação explícita).
CREATE OR REPLACE FUNCTION public.atuacao_cobre_finalidade(
  p_permissions jsonb,
  p_finalidade text,
  p_sem_atuacao_cobre boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH atuacao AS (
    SELECT CASE jsonb_typeof(p_permissions -> 'atuacao')
      -- Formato legado (string): 'prontos' era "tudo que não é lançamento".
      WHEN 'string' THEN CASE p_permissions ->> 'atuacao'
        WHEN 'lancamentos' THEN ARRAY['lancamentos']
        WHEN 'prontos' THEN ARRAY['prontos', 'alugados']
        WHEN 'ambos' THEN ARRAY['lancamentos', 'prontos', 'alugados']
      END
      WHEN 'array' THEN ARRAY(
        SELECT tipo FROM jsonb_array_elements_text(p_permissions -> 'atuacao') AS tipo
         WHERE tipo IN ('lancamentos', 'prontos', 'alugados')
      )
    END AS tipos
  )
  SELECT
    CASE lower(coalesce(p_finalidade, ''))
      WHEN 'venda' THEN ARRAY['prontos']
      WHEN 'locacao' THEN ARRAY['alugados']
      WHEN 'venda_locacao' THEN ARRAY['prontos', 'alugados']
      ELSE ARRAY[]::text[]
    END
    && CASE
      WHEN cardinality(tipos) > 0 THEN tipos
      WHEN p_sem_atuacao_cobre THEN ARRAY['lancamentos', 'prontos', 'alugados']
      ELSE ARRAY[]::text[]
    END
  FROM atuacao;
$$;

-- Recebe as colunas da linha (nunca proprietario_*) para servir à RLS/trigger
-- sem nova leitura do imóvel.
CREATE OR REPLACE FUNCTION public.imovel_autoriza(
  p_acao text,
  p_tenant_id uuid,
  p_finalidade text,
  p_status text,
  p_captador_id uuid,
  p_captador_2_id uuid,
  p_criado_por uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_permissions jsonb;
  v_captadores uuid[];
BEGIN
  IF p_acao NOT IN ('editar', 'ver_proprietario') THEN
    RAISE EXCEPTION 'imovel_autoriza: ação desconhecida "%"', p_acao;
  END IF;

  IF public.is_platform_owner() THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL OR p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fronteira do tenant: o papel vale só no tenant do imóvel.
  SELECT role, permissions
    INTO v_role, v_permissions
    FROM public.tenant_memberships
   WHERE tenant_id = p_tenant_id
     AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role IN ('owner', 'admin') THEN
    RETURN true;
  END IF;

  -- Rascunho é trabalho de quem cadastrou, mesmo com outro captador escolhido.
  IF p_status = 'rascunho' AND p_criado_por = v_uid THEN
    RETURN true;
  END IF;

  v_captadores := CASE
    WHEN p_captador_id IS NOT NULL OR p_captador_2_id IS NOT NULL
      THEN array_remove(ARRAY[p_captador_id, p_captador_2_id], NULL)
    ELSE array_remove(ARRAY[p_criado_por], NULL)
  END;

  IF v_uid = ANY (v_captadores) THEN
    RETURN true;
  END IF;

  IF v_role IS DISTINCT FROM 'team_leader' THEN
    RETURN false;
  END IF;

  IF p_acao = 'ver_proprietario' THEN
    RETURN public.atuacao_cobre_finalidade(v_permissions, p_finalidade, false);
  END IF;

  RETURN public.atuacao_cobre_finalidade(v_permissions, p_finalidade, true)
      OR EXISTS (
           SELECT 1
             FROM public.tenant_memberships m
            WHERE m.tenant_id = p_tenant_id
              AND m.leader_user_id = v_uid
              AND m.user_id = ANY (v_captadores)
         );
END;
$$;

COMMENT ON FUNCTION public.imovel_autoriza(text, uuid, text, text, uuid, uuid, uuid) IS
  'Decide ''editar'' e ''ver_proprietario'' de um imóvel local para auth.uid(). Regra no cabeçalho de 20260915_imovel_captador_edita_proprietario_protegido.sql.';

-- ============================================================================
-- 2. Guard de edição/exclusão (e de proprietario_*)
-- ============================================================================
-- Nome começa com "tg_g" para rodar ANTES dos BEFORE triggers que carimbam
-- colunas (tg_imoveis_locais_*, tr_guard_status_aprovacao, update_*): o diff
-- abaixo precisa ver só o que o cliente mandou.
CREATE OR REPLACE FUNCTION public.tg_guard_edicao_imovel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alterados text[];
BEGIN
  -- service_role (servidor, marca d'água) não tem auth.uid(): passa, como nos
  -- outros guards desta tabela.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.imovel_autoriza('editar', OLD.tenant_id, OLD.finalidade, OLD.status_aprovacao,
                                  OLD.captador_id, OLD.captador_2_id, OLD.criado_por) THEN
      RAISE EXCEPTION 'Sem permissão para excluir o imóvel %: só o captador, a gestão responsável ou a administração.',
        OLD.codigo_imovel USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  SELECT array_agg(novo.key)
    INTO v_alterados
    FROM jsonb_each(to_jsonb(NEW)) AS novo
   WHERE novo.value IS DISTINCT FROM to_jsonb(OLD) -> novo.key;

  -- Save que não muda nada (formulário reenviando o payload) não precisa de gate.
  IF v_alterados IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.imovel_autoriza('editar', OLD.tenant_id, OLD.finalidade, OLD.status_aprovacao,
                                OLD.captador_id, OLD.captador_2_id, OLD.criado_por)
     AND NOT (
       v_alterados <@ ARRAY['status_aprovacao', 'aprovado_por', 'aprovado_em', 'motivo_aprovacao']
       AND public.proposals_is_tenant_manager(OLD.tenant_id)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar o imóvel %: só o captador, a gestão responsável ou a administração.',
      OLD.codigo_imovel USING ERRCODE = '42501';
  END IF;

  IF v_alterados && ARRAY['proprietario_nome', 'proprietario_telefone', 'proprietario_tel_residencial',
                          'proprietario_tel_comercial', 'proprietario_email']
     AND NOT public.imovel_autoriza('ver_proprietario', OLD.tenant_id, OLD.finalidade, OLD.status_aprovacao,
                                    OLD.captador_id, OLD.captador_2_id, OLD.criado_por) THEN
    RAISE EXCEPTION 'Sem permissão para alterar os dados do proprietário do imóvel %.',
      OLD.codigo_imovel USING ERRCODE = '42501';
  END IF;

  -- criado_por é o captador quando não há captador_id: trocar o autor seria
  -- trocar quem tem acesso.
  IF 'criado_por' = ANY (v_alterados)
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_memberships
        WHERE tenant_id = OLD.tenant_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
     ) THEN
    RAISE EXCEPTION 'Somente a administração pode alterar quem cadastrou o imóvel %.',
      OLD.codigo_imovel USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_guard_edicao_imovel ON public.imoveis_locais;
CREATE TRIGGER tg_guard_edicao_imovel
  BEFORE UPDATE OR DELETE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_edicao_imovel();

-- ============================================================================
-- 3. Proprietário fora do SELECT do navegador + RPCs
-- ============================================================================
REVOKE SELECT ON public.imoveis_locais FROM authenticated;

DO $$
DECLARE
  v_colunas text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO v_colunas
    FROM pg_attribute
   WHERE attrelid = 'public.imoveis_locais'::regclass
     AND attnum > 0
     AND NOT attisdropped
     AND attname NOT IN ('proprietario_nome', 'proprietario_telefone', 'proprietario_tel_residencial',
                         'proprietario_tel_comercial', 'proprietario_email');
  EXECUTE format('GRANT SELECT (%s) ON public.imoveis_locais TO authenticated', v_colunas);
END $$;

-- SECURITY INVOKER: a RLS do chamador já limita ao tenant; só lê colunas liberadas.
-- Array num valor só para não esbarrar no teto de 1000 linhas do PostgREST.
CREATE OR REPLACE FUNCTION public.imoveis_editaveis(p_tenant_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(i.codigo_imovel), ARRAY[]::text[])
    FROM public.imoveis_locais i
   WHERE i.tenant_id = p_tenant_id
     AND public.imovel_autoriza('editar', i.tenant_id, i.finalidade, i.status_aprovacao,
                                i.captador_id, i.captador_2_id, i.criado_por);
$$;

-- SECURITY DEFINER porque lê as colunas revogadas; o filtro é imovel_autoriza
-- linha a linha (inclui a fronteira de tenant).
CREATE OR REPLACE FUNCTION public.imoveis_proprietarios(
  p_tenant_id uuid,
  p_codigo text DEFAULT NULL,
  p_busca text DEFAULT NULL
)
RETURNS TABLE (
  codigo_imovel text,
  proprietario_nome text,
  proprietario_telefone text,
  proprietario_tel_residencial text,
  proprietario_tel_comercial text,
  proprietario_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.codigo_imovel, i.proprietario_nome, i.proprietario_telefone,
         i.proprietario_tel_residencial, i.proprietario_tel_comercial, i.proprietario_email
    FROM public.imoveis_locais i
   WHERE i.tenant_id = p_tenant_id
     AND (p_codigo IS NULL OR i.codigo_imovel = p_codigo)
     -- strpos e não ILIKE: o termo vem digitado e % / _ não podem virar curinga.
     AND (p_busca IS NULL OR strpos(lower(i.proprietario_nome), lower(btrim(p_busca))) > 0)
     AND public.imovel_autoriza('ver_proprietario', i.tenant_id, i.finalidade, i.status_aprovacao,
                                i.captador_id, i.captador_2_id, i.criado_por)
   ORDER BY i.created_at DESC;
$$;

-- Aviso de "imóvel já cadastrado para este proprietário" (verificarImovelDuplicado).
-- Compara no banco e devolve só o que identifica o imóvel: quem não pode ver o
-- proprietário não descobre de quem é um imóvel só digitando um nome — precisa
-- acertar também o endereço ou as características.
CREATE OR REPLACE FUNCTION public.imoveis_duplicados_proprietario(
  p_tenant_id uuid,
  p_proprietario_nome text,
  p_ignorar_codigo text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_logradouro text DEFAULT NULL,
  p_numero text DEFAULT NULL,
  p_cep text DEFAULT NULL,
  p_bairro text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_area_total numeric DEFAULT NULL,
  p_quartos integer DEFAULT NULL,
  p_banheiros integer DEFAULT NULL
)
RETURNS TABLE (
  codigo_imovel text,
  titulo text,
  tipo text,
  bairro text,
  cidade text,
  logradouro text,
  numero text,
  motivo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidatos AS (
    SELECT i.*,
           CASE
             WHEN nullif(btrim(p_logradouro), '') IS NOT NULL
              AND nullif(btrim(p_numero), '') IS NOT NULL
              AND lower(btrim(coalesce(i.logradouro, ''))) = lower(btrim(p_logradouro))
              AND lower(btrim(coalesce(i.numero, ''))) = lower(btrim(p_numero))
              AND (regexp_replace(coalesce(p_cep, ''), '\D', '', 'g') = ''
                   OR regexp_replace(coalesce(p_cep, ''), '\D', '', 'g') = regexp_replace(coalesce(i.cep, ''), '\D', '', 'g'))
               THEN 'mesmo_endereco'
             WHEN nullif(btrim(p_tipo), '') IS NOT NULL AND lower(btrim(coalesce(i.tipo, ''))) = lower(btrim(p_tipo))
              AND nullif(btrim(p_bairro), '') IS NOT NULL AND lower(btrim(coalesce(i.bairro, ''))) = lower(btrim(p_bairro))
              AND nullif(btrim(p_cidade), '') IS NOT NULL AND lower(btrim(coalesce(i.cidade, ''))) = lower(btrim(p_cidade))
              AND coalesce(p_area_total, 0) > 0 AND coalesce(i.area_total, 0) > 0
              AND abs(p_area_total - i.area_total) / greatest(p_area_total, i.area_total) <= 0.05
              AND coalesce(p_quartos, 0) > 0 AND coalesce(i.quartos, 0) = p_quartos
              AND coalesce(p_banheiros, 0) > 0 AND coalesce(i.banheiros, 0) = p_banheiros
               THEN 'caracteristicas_iguais'
           END AS motivo
      FROM public.imoveis_locais i
     WHERE i.tenant_id = p_tenant_id
       AND (public.is_platform_owner() OR EXISTS (
             SELECT 1 FROM public.tenant_memberships
              WHERE tenant_id = p_tenant_id AND user_id = auth.uid()))
       AND length(btrim(coalesce(p_proprietario_nome, ''))) >= 2
       AND lower(btrim(coalesce(i.proprietario_nome, ''))) = lower(btrim(p_proprietario_nome))
       AND (p_ignorar_codigo IS NULL OR lower(btrim(i.codigo_imovel)) <> lower(btrim(p_ignorar_codigo)))
  )
  SELECT c.codigo_imovel, c.titulo, c.tipo, c.bairro, c.cidade, c.logradouro, c.numero, c.motivo
    FROM candidatos c
   WHERE c.motivo IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.imovel_autoriza(text, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.imoveis_editaveis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.imoveis_proprietarios(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.imoveis_duplicados_proprietario(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_guard_edicao_imovel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.imovel_autoriza(text, uuid, text, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imoveis_editaveis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imoveis_proprietarios(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imoveis_duplicados_proprietario(uuid, text, text, text, text, text, text, text, text, numeric, integer, integer) TO authenticated;

-- ============================================================================
-- 4. Proprietário e endereço obrigatórios na publicação
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_valida_publicacao_imovel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_publicando boolean;
  v_faltando text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status_aprovacao = 'rascunho' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_publicando := true;
  ELSE
    v_publicando := OLD.status_aprovacao = 'rascunho';
  END IF;

  -- Publicando: tudo. Já publicado: só o campo que acabou de ficar vazio.
  IF btrim(coalesce(NEW.proprietario_nome, '')) = ''
     AND (v_publicando OR NEW.proprietario_nome IS DISTINCT FROM OLD.proprietario_nome) THEN
    v_faltando := v_faltando || 'Nome do proprietário'::text;
  END IF;

  IF btrim(concat(NEW.proprietario_telefone, NEW.proprietario_tel_residencial,
                  NEW.proprietario_tel_comercial, NEW.proprietario_email)) = ''
     AND (v_publicando
          OR NEW.proprietario_telefone IS DISTINCT FROM OLD.proprietario_telefone
          OR NEW.proprietario_tel_residencial IS DISTINCT FROM OLD.proprietario_tel_residencial
          OR NEW.proprietario_tel_comercial IS DISTINCT FROM OLD.proprietario_tel_comercial
          OR NEW.proprietario_email IS DISTINCT FROM OLD.proprietario_email) THEN
    v_faltando := v_faltando || 'Telefone ou e-mail do proprietário'::text;
  END IF;

  IF length(regexp_replace(coalesce(NEW.cep, ''), '\D', '', 'g')) <> 8
     AND (v_publicando OR NEW.cep IS DISTINCT FROM OLD.cep) THEN
    v_faltando := v_faltando || 'CEP (8 dígitos)'::text;
  END IF;

  IF btrim(coalesce(NEW.logradouro, '')) = '' AND (v_publicando OR NEW.logradouro IS DISTINCT FROM OLD.logradouro) THEN
    v_faltando := v_faltando || 'Logradouro'::text;
  END IF;
  IF btrim(coalesce(NEW.numero, '')) = '' AND (v_publicando OR NEW.numero IS DISTINCT FROM OLD.numero) THEN
    v_faltando := v_faltando || 'Número'::text;
  END IF;
  IF btrim(coalesce(NEW.bairro, '')) = '' AND (v_publicando OR NEW.bairro IS DISTINCT FROM OLD.bairro) THEN
    v_faltando := v_faltando || 'Bairro'::text;
  END IF;
  IF btrim(coalesce(NEW.cidade, '')) = '' AND (v_publicando OR NEW.cidade IS DISTINCT FROM OLD.cidade) THEN
    v_faltando := v_faltando || 'Cidade'::text;
  END IF;
  IF btrim(coalesce(NEW.estado, '')) = '' AND (v_publicando OR NEW.estado IS DISTINCT FROM OLD.estado) THEN
    v_faltando := v_faltando || 'Estado'::text;
  END IF;

  IF cardinality(v_faltando) > 0 THEN
    RAISE EXCEPTION 'Não foi possível % o imóvel %. Preencha: %.',
      CASE WHEN v_publicando THEN 'publicar' ELSE 'salvar' END,
      NEW.codigo_imovel,
      array_to_string(v_faltando, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_valida_publicacao_imovel ON public.imoveis_locais;
CREATE TRIGGER tg_valida_publicacao_imovel
  AFTER INSERT OR UPDATE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.tg_valida_publicacao_imovel();

-- ============================================================================
-- 5. Histórico sem dado pessoal
-- ============================================================================
-- Corpo vivo (= 20260817) + o ramo de proprietario_*. Vazio continua vazio, para
-- o histórico ainda mostrar "preenchido" / "apagado".
CREATE OR REPLACE FUNCTION public.imoveis_locais_log_resumo(p_campo text, p_valor jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_campo LIKE 'proprietario\_%' THEN
      CASE WHEN p_valor IS NULL OR p_valor IN ('null'::jsonb, '""'::jsonb) THEN p_valor
           ELSE to_jsonb('oculto'::text) END
    WHEN p_campo <> 'fotos' THEN p_valor
    WHEN jsonb_typeof(p_valor) = 'array' THEN to_jsonb(jsonb_array_length(p_valor))
    ELSE to_jsonb(0)
  END;
$$;

UPDATE public.imoveis_locais_log l
   SET alteracoes = (
     SELECT jsonb_object_agg(
              e.key,
              CASE WHEN e.key LIKE 'proprietario\_%'
                   THEN jsonb_build_object(
                          'de', public.imoveis_locais_log_resumo(e.key, e.value -> 'de'),
                          'para', public.imoveis_locais_log_resumo(e.key, e.value -> 'para'))
                   ELSE e.value END)
       FROM jsonb_each(l.alteracoes) AS e
   )
 WHERE l.alteracoes ?| ARRAY['proprietario_nome', 'proprietario_telefone', 'proprietario_tel_residencial',
                             'proprietario_tel_comercial', 'proprietario_email'];

-- ============================================================================
-- 6. Sanidade (só catálogo e log)
-- ============================================================================
DO $$
BEGIN
  ASSERT NOT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_nome', 'SELECT'),
    'authenticated ainda lê proprietario_nome';
  ASSERT NOT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_telefone', 'SELECT'),
    'authenticated ainda lê proprietario_telefone';
  ASSERT NOT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_tel_residencial', 'SELECT'),
    'authenticated ainda lê proprietario_tel_residencial';
  ASSERT NOT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_tel_comercial', 'SELECT'),
    'authenticated ainda lê proprietario_tel_comercial';
  ASSERT NOT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_email', 'SELECT'),
    'authenticated ainda lê proprietario_email';
  ASSERT NOT has_column_privilege('anon', 'public.imoveis_locais', 'proprietario_nome', 'SELECT'),
    'anon lê proprietario_nome';
  ASSERT has_column_privilege('authenticated', 'public.imoveis_locais', 'atualizado_por', 'SELECT')
     AND has_column_privilege('authenticated', 'public.imoveis_locais', 'codigo_imovel', 'SELECT'),
    'authenticated perdeu colunas que não são do proprietário';
  ASSERT has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_nome', 'UPDATE')
     AND has_column_privilege('authenticated', 'public.imoveis_locais', 'proprietario_nome', 'INSERT'),
    'formulário perdeu a escrita do proprietário';
  ASSERT (SELECT count(*) FROM pg_trigger
           WHERE tgrelid = 'public.imoveis_locais'::regclass
             AND tgname IN ('tg_guard_edicao_imovel', 'tg_valida_publicacao_imovel')) = 2,
    'triggers novos ausentes';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.imoveis_locais_log l, jsonb_each(l.alteracoes) e
     WHERE e.key LIKE 'proprietario\_%'
       AND (e.value -> 'de' NOT IN ('null'::jsonb, '""'::jsonb, '"oculto"'::jsonb)
            OR e.value -> 'para' NOT IN ('null'::jsonb, '""'::jsonb, '"oculto"'::jsonb))
  ), 'log ainda tem proprietário em claro';
  ASSERT public.atuacao_cobre_finalidade('{"atuacao":["prontos"]}', 'venda', false)
     AND NOT public.atuacao_cobre_finalidade('{"atuacao":["prontos"]}', 'locacao', false)
     AND NOT public.atuacao_cobre_finalidade('{}', 'venda', false)
     AND public.atuacao_cobre_finalidade('{}', 'venda', true)
     AND public.atuacao_cobre_finalidade('{"atuacao":"prontos"}', 'locacao', false),
    'atuacao_cobre_finalidade diverge de atuacoesDe';

  RAISE NOTICE 'imovel_captador_edita_proprietario_protegido: asserts OK';
END $$;

COMMIT;
