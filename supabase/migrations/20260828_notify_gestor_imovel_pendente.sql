-- Migration: Notificar gestor no sininho quando imóvel/condomínio entra como pendente
-- Data: 2026-08-28
-- Descrição: Trigger em imoveis_locais e condominios que, na transição de
-- status_aprovacao para 'aguardando', insere uma notificação in-app (tabela
-- notifications) para o gestor responsável.
--
-- Destinatários (task: "notificação para os gestores E admins"):
--   • tenant_memberships.leader_user_id do captador (captador_id, fallback criado_por)
--   • + todos os membros admin/owner do tenant (sempre, não só como fallback)
--   • dedup via UNION; o próprio captador nunca se auto-notifica
-- ponytail: só o gestor PRIMÁRIO (leader_user_id) — mesmo recorte da fila/eNPS/bolsão;
-- incluir gestores secundários (teams.leader_user_ids) se a Lotus pedir
--
-- O trigger cobre qualquer writer (forms client-side, upsert, default do banco).
-- Re-upsert de edição que mantém 'aguardando' NÃO re-notifica (só dispara na
-- transição de valor).
--
-- APLICAR NO SUPABASE ANTES do deploy do front (o sino passa a assinar realtime
-- de notifications; ver bloco da publication no final).

CREATE OR REPLACE FUNCTION public.notify_gestor_imovel_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j jsonb;
  v_captador uuid;
  v_leader uuid;
  v_label text;
  v_ref text;
  v_link_type text;
BEGIN
  -- Só na transição para 'aguardando' (INSERT já pendente, ou UPDATE que muda o valor)
  IF NEW.status_aprovacao IS DISTINCT FROM 'aguardando' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_aprovacao IS NOT DISTINCT FROM NEW.status_aprovacao THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Acesso genérico às colunas (imoveis_locais e condominios têm schemas diferentes)
  j := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'imoveis_locais' THEN
    v_label := 'Imóvel';
    v_link_type := 'imovel';
    v_ref := COALESCE(NULLIF(j->>'titulo', ''), j->>'codigo_imovel', '');
  ELSE
    v_label := 'Condomínio';
    v_link_type := 'condominio';
    v_ref := COALESCE(NULLIF(j->>'nome', ''), j->>'codigo', '');
  END IF;

  -- v_ref pode ser vazio; concatena sem deixar espaço duplo
  v_ref := CASE WHEN v_ref <> '' THEN ' ' || v_ref ELSE '' END;

  v_captador := COALESCE(NEW.captador_id, (j->>'criado_por')::uuid);

  IF v_captador IS NOT NULL THEN
    SELECT tm.leader_user_id INTO v_leader
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.user_id = v_captador
    LIMIT 1;
  END IF;

  -- Gestor primário do captador + todos os admin/owner do tenant, deduplicados.
  -- O próprio captador nunca é notificado do que ele mesmo subiu.
  INSERT INTO public.notifications
    (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
  SELECT
    NEW.tenant_id,
    dest.user_id,
    v_label || ' pendente de aprovação',
    v_label || v_ref || ' aguarda sua aprovação.',
    'info',
    v_link_type,
    NEW.id::text,
    jsonb_build_object('status_aprovacao', 'aguardando', 'tabela', TG_TABLE_NAME)
  FROM (
    SELECT tm.user_id
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = NEW.tenant_id
      AND tm.role IN ('admin', 'owner')
    UNION
    SELECT v_leader WHERE v_leader IS NOT NULL
  ) dest
  WHERE dest.user_id IS DISTINCT FROM v_captador;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_pendente_imoveis_locais ON public.imoveis_locais;
CREATE TRIGGER tg_notify_pendente_imoveis_locais
  AFTER INSERT OR UPDATE OF status_aprovacao ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.notify_gestor_imovel_pendente();

DROP TRIGGER IF EXISTS tg_notify_pendente_condominios ON public.condominios;
CREATE TRIGGER tg_notify_pendente_condominios
  AFTER INSERT OR UPDATE OF status_aprovacao ON public.condominios
  FOR EACH ROW EXECUTE FUNCTION public.notify_gestor_imovel_pendente();

-- Realtime para o badge do sininho (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
