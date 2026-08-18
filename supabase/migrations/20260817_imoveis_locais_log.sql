-- Migration: log de alterações por imóvel
-- Data: 2026-08-17
-- Descrição: histórico append-only de imoveis_locais (criação, edições campo a
-- campo, exclusão). Trigger no banco em vez de código em cada caller porque a
-- tabela é escrita de vários lugares — CriarImovelForm (upsert), aprovação em
-- MeusImoveisTab, api-server, proxy-production e o backfill de marca d'água.
-- Um trigger cobre todos, inclusive os que ainda não existem.

-- Ordem de lock explícita. O editor SQL roda tudo numa transação só: sem isto,
-- ela cria/tranca as tabelas novas e SÓ DEPOIS pede o AccessExclusiveLock de
-- imoveis_locais (DROP/CREATE TRIGGER) — e quem estiver gravando imóvel nesse
-- meio-tempo fecha o ciclo do deadlock. Pegando a tabela contenciosa primeiro
-- não há ciclo; o lock_timeout troca "deadlock detected" por um erro limpo de
-- espera, e aí é só rodar de novo (tudo aqui é IF NOT EXISTS / OR REPLACE).
SET lock_timeout = '10s';
LOCK TABLE public.imoveis_locais IN ACCESS EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.imoveis_locais_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  imovel_id UUID NOT NULL,
  codigo_imovel TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criado', 'editado', 'excluido')),
  -- { coluna: { de: <valor antigo>, para: <valor novo> } }. Vazio em criado/excluído.
  alteracoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- auth.uid() do autor. NULL quando a escrita veio do backend (service_role):
  -- sync, backfill de marca d'água, jobs. A UI mostra "Sistema" nesse caso.
  alterado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A leitura é sempre "histórico deste imóvel, mais recente primeiro".
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_log_imovel
  ON public.imoveis_locais_log (tenant_id, codigo_imovel, created_at DESC);

-- ------------------------------------------------------------
-- Trigger de auditoria
-- ------------------------------------------------------------
-- Auxiliar do diff: colapsa `fotos` na quantidade. IMMUTABLE porque só depende
-- dos argumentos (permite uso em índice/expressão sem surpresa).
CREATE OR REPLACE FUNCTION public.imoveis_locais_log_resumo(p_campo TEXT, p_valor JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_campo <> 'fotos' THEN p_valor
    WHEN jsonb_typeof(p_valor) = 'array' THEN to_jsonb(jsonb_array_length(p_valor))
    ELSE to_jsonb(0)
  END;
$$;

-- SECURITY DEFINER: os membros não têm INSERT na tabela de log (REVOKE abaixo),
-- então quem grava é a função. Isso é o que torna o log inforjável — um corretor
-- não consegue inserir nem apagar linha nenhuma, só ler.
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
      (tenant_id, imovel_id, codigo_imovel, acao, alterado_por)
    VALUES (OLD.tenant_id, OLD.id, OLD.codigo_imovel, 'excluido', auth.uid());
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
  -- encheria o log de ruído ilegível.
  SELECT jsonb_object_agg(
           campo.key,
           jsonb_build_object(
             'de',   imoveis_locais_log_resumo(campo.key, to_jsonb(OLD) -> campo.key),
             'para', imoveis_locais_log_resumo(campo.key, campo.value)
           )
         )
    INTO v_alteracoes
    FROM jsonb_each(to_jsonb(NEW)) AS campo
   WHERE campo.key NOT IN ('updated_at')
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

DROP TRIGGER IF EXISTS log_imoveis_locais ON public.imoveis_locais;
CREATE TRIGGER log_imoveis_locais
  AFTER INSERT OR UPDATE OR DELETE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.log_imoveis_locais_alteracoes();

-- ------------------------------------------------------------
-- RLS: lê quem já enxerga o imóvel (membro do tenant ou owner). Escrita: ninguém
-- pelo PostgREST — só o trigger. Mesmo padrão de agent_telemetry_events.
-- ------------------------------------------------------------
ALTER TABLE public.imoveis_locais_log ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.imoveis_locais_log FROM anon, authenticated;

DROP POLICY IF EXISTS "imoveis_locais_log_select" ON public.imoveis_locais_log;
CREATE POLICY "imoveis_locais_log_select"
  ON public.imoveis_locais_log FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.imoveis_locais_log
  IS 'Histórico append-only de alterações em imoveis_locais. Escrito só pelo trigger log_imoveis_locais (SECURITY DEFINER); membros do tenant apenas leem.';
COMMENT ON COLUMN public.imoveis_locais_log.alteracoes
  IS 'Diff da edição: { coluna: { de, para } }. `fotos` guarda a contagem, não as URLs.';
COMMENT ON COLUMN public.imoveis_locais_log.alterado_por
  IS 'auth.uid() do autor; NULL quando a escrita veio do backend/service_role (sync, backfill, jobs).';
