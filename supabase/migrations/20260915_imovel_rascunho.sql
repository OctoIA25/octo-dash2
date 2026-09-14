-- Migration: rascunho de imóvel
-- Data: 2026-09-15
--
-- O cadastro de imóvel passa a poder ser salvo pela metade ("Salvar rascunho" e
-- autosave) e publicado depois. Rascunho é um valor de status_aprovacao, não
-- uma flag à parte: tudo que é público já filtra `status_aprovacao = 'aprovado'`
-- (portal_imoveis, policies do anon, feed ZAP/Imovelweb), então o rascunho nasce
-- fora do ar sem mexer nesses leitores. Com uma flag is_draft + 'aguardando', o
-- gestor conseguiria aprovar um rascunho direto e o sininho tocaria no primeiro
-- autosave. Os leitores internos (catálogo, KPIs, relatórios) filtram
-- `.neq('status_aprovacao', 'rascunho')` no código.
--
-- O que muda:
--   1. CHECK de status_aprovacao aceita 'rascunho' (só em imoveis_locais;
--      condominios não tem rascunho).
--   2. status_aprovacao NOT NULL — 0 linhas NULL em 14/set, default 'aguardando'.
--      Sem isso o `.neq(...)` do PostgREST (que é `<>`) descartaria linha NULL.
--   3. atualizado_por: quem salvou por último, carimbado por trigger (o caller
--      não escolhe). Sem FK, mesma convenção de criado_por/captador_id/chave_com.
--   4. tg_guard_status_aprovacao (compartilhada com condominios) ganha as regras
--      do rascunho, só para imoveis_locais:
--        - qualquer usuário autenticado, gestor ou não: rascunho não vai direto
--          para aprovado/nao_aprovado (publica para 'aguardando' antes) e imóvel
--          publicado não volta a ser rascunho → RAISE check_violation (HTTP 400);
--        - corretor pode inserir como rascunho e publicar rascunho → aguardando;
--          o resto do guard de 20260907 fica igual (descarta em silêncio).
--      condominios segue exatamente o comportamento de 20260907.
--   5. log_imoveis_locais_alteracoes ignora atualizado_por no diff, como já
--      ignora updated_at: "quem" já está em alterado_por, e sem isso um gestor
--      que só reabre e salva um imóvel geraria um 'editado' vazio no histórico.
--      Resto do corpo idêntico ao vivo (= 20260912_log_valor_na_exclusao.sql).
--
-- Sem mudança (conferido no banco em 14/set, pg_get_functiondef):
--   - notify_gestor_imovel_pendente só dispara na transição para 'aguardando':
--     INSERT como rascunho não notifica; publicar (rascunho → aguardando) notifica.
--   - touch_imoveis_locais_updated_at segue bumpando updated_at a cada save — é o
--     "Último salvamento" do rascunho.
--
-- ROLLBACK (antes, decidir o que fazer com os rascunhos — o CHECK antigo recusa
-- 'rascunho'; UPDATE para 'aguardando' notifica os gestores de cada um):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DELETE FROM public.imoveis_locais WHERE status_aprovacao = 'rascunho';
--   DROP TRIGGER IF EXISTS tg_imoveis_locais_atualizado_por ON public.imoveis_locais;
--   DROP FUNCTION IF EXISTS public.imoveis_locais_carimbar_atualizado_por();
--   ALTER TABLE public.imoveis_locais
--     DROP CONSTRAINT imoveis_locais_status_aprovacao_check,
--     ADD CONSTRAINT imoveis_locais_status_aprovacao_check
--       CHECK (status_aprovacao IN ('aprovado', 'nao_aprovado', 'aguardando')),
--     ALTER COLUMN status_aprovacao DROP NOT NULL,
--     DROP COLUMN IF EXISTS atualizado_por;
--   -- e reaplicar a função de 20260907_restringe_aprovacao_imoveis.sql e a de
--   -- 20260912_log_valor_na_exclusao.sql (só os CREATE OR REPLACE FUNCTION).
--   COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1-3. Tabela: um ALTER só, um lock só (23 linhas: validar CHECK/NOT NULL é
--      instantâneo, NOT VALID não compraria nada).
-- ============================================================================
ALTER TABLE public.imoveis_locais
  DROP CONSTRAINT IF EXISTS imoveis_locais_status_aprovacao_check,
  ADD CONSTRAINT imoveis_locais_status_aprovacao_check
    CHECK (status_aprovacao IN ('rascunho', 'aguardando', 'aprovado', 'nao_aprovado')),
  ALTER COLUMN status_aprovacao SET NOT NULL,
  ADD COLUMN IF NOT EXISTS atualizado_por UUID;

COMMENT ON COLUMN public.imoveis_locais.status_aprovacao IS
  'rascunho (cadastro incompleto, invisível fora do formulário) → aguardando → aprovado | nao_aprovado. Só aprovado vai para portal/feeds.';
COMMENT ON COLUMN public.imoveis_locais.atualizado_por IS
  'user_id de quem salvou por último. Carimbado pelo trigger tg_imoveis_locais_atualizado_por, não pelo caller.';

-- ============================================================================
-- 3. Carimbo de atualizado_por
-- ============================================================================
-- SECURITY INVOKER basta: auth.uid() só lê o JWT da requisição. Sem usuário
-- (service_role, jobs) mantém o que veio — no UPDATE, o valor anterior.
CREATE OR REPLACE FUNCTION public.imoveis_locais_carimbar_atualizado_por()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_por := COALESCE(auth.uid(), NEW.atualizado_por);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_imoveis_locais_atualizado_por ON public.imoveis_locais;
CREATE TRIGGER tg_imoveis_locais_atualizado_por
  BEFORE INSERT OR UPDATE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.imoveis_locais_carimbar_atualizado_por();

-- ============================================================================
-- 4. Guard de status_aprovacao (imoveis_locais + condominios)
-- ============================================================================
-- Ponto de partida: corpo VIVO de 14/set (igual a 20260907). Os triggers
-- tr_guard_status_aprovacao das duas tabelas continuam apontando para ela.
--
-- Upsert do formulário (ON CONFLICT tenant_id,codigo_imovel): o Postgres roda o
-- ramo INSERT na linha proposta e depois o ramo UPDATE contra a linha existente,
-- então as regras de transição valem também quando o form faz upsert.
CREATE OR REPLACE FUNCTION public.tg_guard_status_aprovacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (proxy-production / api-server) não tem auth.uid(): passa direto.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Transições proibidas para qualquer um, gestor incluso. RAISE e não
  -- descarte: aqui o pedido é explicitamente inválido, não um campo reenviado
  -- sem querer, e engolir faria a tela mostrar "aprovado" com o banco em rascunho.
  IF TG_TABLE_NAME = 'imoveis_locais' AND TG_OP = 'UPDATE' THEN
    IF OLD.status_aprovacao = 'rascunho' AND NEW.status_aprovacao IN ('aprovado', 'nao_aprovado') THEN
      RAISE EXCEPTION 'Rascunho não pode ser aprovado nem reprovado: publique o imóvel antes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status_aprovacao <> 'rascunho' AND NEW.status_aprovacao = 'rascunho' THEN
      RAISE EXCEPTION 'Imóvel já publicado não pode voltar a ser rascunho.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF public.proposals_is_tenant_manager(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Corretor cadastra, nunca já aprovado. Imóvel pode nascer rascunho.
    IF TG_TABLE_NAME <> 'imoveis_locais' OR NEW.status_aprovacao IS DISTINCT FROM 'rascunho' THEN
      NEW.status_aprovacao := 'aguardando';
    END IF;
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
    NEW.motivo_aprovacao := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: preserva em vez de RAISE de propósito. O formulário de edição manda
  -- status_aprovacao em TODO save, então um corretor editando o próprio imóvel
  -- dispararia exceção e perderia a edição inteira por um campo que ele nem quis
  -- mexer. Preservando, a edição passa e a aprovação fica intacta.
  -- Única mudança de status liberada ao corretor: publicar o rascunho.
  IF TG_TABLE_NAME <> 'imoveis_locais'
     OR OLD.status_aprovacao IS DISTINCT FROM 'rascunho'
     OR NEW.status_aprovacao IS DISTINCT FROM 'aguardando' THEN
    NEW.status_aprovacao := OLD.status_aprovacao;
  END IF;
  NEW.aprovado_por := OLD.aprovado_por;
  NEW.aprovado_em := OLD.aprovado_em;
  NEW.motivo_aprovacao := OLD.motivo_aprovacao;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_guard_status_aprovacao() IS
  'Só admin/owner/team_leader (ou o servidor via service_role) muda status_aprovacao. Não-gestor tem a mudança descartada silenciosamente, exceto em imoveis_locais: pode inserir rascunho e publicar rascunho → aguardando. Em imoveis_locais, rascunho → aprovado/nao_aprovado e publicado → rascunho dão erro para qualquer usuário.';

-- ============================================================================
-- 5. Log: atualizado_por fora do diff (resto idêntico ao corpo vivo)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_imoveis_locais_alteracoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alteracoes JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.imoveis_locais_log
      (tenant_id, imovel_id, codigo_imovel, acao, alteracoes, alterado_por)
    VALUES (OLD.tenant_id, OLD.id, OLD.codigo_imovel, 'excluido',
            jsonb_build_object('valor_venda', jsonb_build_object('de', OLD.valor_venda, 'para', NULL)),
            auth.uid());
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.imoveis_locais_log
      (tenant_id, imovel_id, codigo_imovel, acao, alterado_por)
    VALUES (NEW.tenant_id, NEW.id, NEW.codigo_imovel, 'criado',
            COALESCE(auth.uid(), NEW.criado_por));
    RETURN NEW;
  END IF;

  -- Diff coluna a coluna. `fotos` entra só como contagem: o array tem URLs longas
  -- (e o backfill de marca d'água reescreve todas), guardar o conteúdo inteiro
  -- encheria o log de ruído ilegível. `atualizado_por` repete alterado_por.
  SELECT jsonb_object_agg(
           campo.key,
           jsonb_build_object(
             'de',   imoveis_locais_log_resumo(campo.key, to_jsonb(OLD) -> campo.key),
             'para', imoveis_locais_log_resumo(campo.key, campo.value)
           )
         )
    INTO v_alteracoes
    FROM jsonb_each(to_jsonb(NEW)) AS campo
   WHERE campo.key NOT IN ('updated_at', 'atualizado_por')
     AND campo.value IS DISTINCT FROM to_jsonb(OLD) -> campo.key;

  -- Upsert do formulário reenvia o payload inteiro a cada salvamento; sem
  -- mudança real não há o que logar.
  IF v_alteracoes IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.imoveis_locais_log
    (tenant_id, imovel_id, codigo_imovel, acao, alteracoes, alterado_por)
  VALUES (NEW.tenant_id, NEW.id, NEW.codigo_imovel, 'editado', v_alteracoes, auth.uid());

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. Sanidade (só catálogo, nenhuma escrita)
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT pg_get_constraintdef(oid) LIKE '%''rascunho''%'
            FROM pg_constraint
           WHERE conrelid = 'public.imoveis_locais'::regclass
             AND conname = 'imoveis_locais_status_aprovacao_check'),
         'CHECK de imoveis_locais sem rascunho';
  ASSERT (SELECT pg_get_constraintdef(oid) NOT LIKE '%rascunho%'
            FROM pg_constraint
           WHERE conrelid = 'public.condominios'::regclass
             AND conname = 'condominios_status_aprovacao_check'),
         'condominios não deveria aceitar rascunho';
  ASSERT (SELECT attnotnull
            FROM pg_attribute
           WHERE attrelid = 'public.imoveis_locais'::regclass
             AND attname = 'status_aprovacao'),
         'status_aprovacao deveria ser NOT NULL';
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.imoveis_locais'::regclass
                    AND attname = 'atualizado_por' AND NOT attisdropped),
         'coluna atualizado_por ausente';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.imoveis_locais'::regclass
                    AND tgname = 'tg_imoveis_locais_atualizado_por'),
         'trigger de atualizado_por ausente';
  ASSERT (SELECT count(*) FROM pg_trigger
           WHERE tgname = 'tr_guard_status_aprovacao'
             AND tgrelid IN ('public.imoveis_locais'::regclass, 'public.condominios'::regclass)) = 2,
         'guard de status deveria continuar nas duas tabelas';
  ASSERT (SELECT prosrc LIKE '%rascunho%' FROM pg_proc
           WHERE oid = 'public.tg_guard_status_aprovacao()'::regprocedure),
         'guard sem as regras de rascunho';
  ASSERT (SELECT prosrc LIKE '%''atualizado_por''%' FROM pg_proc
           WHERE oid = 'public.log_imoveis_locais_alteracoes()'::regprocedure),
         'log deveria ignorar atualizado_por';

  RAISE NOTICE 'imovel_rascunho: 8 asserts OK';
END $$;

COMMIT;
