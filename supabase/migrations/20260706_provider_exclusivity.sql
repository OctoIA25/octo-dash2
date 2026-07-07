-- =============================================================================
-- Exclusividade de CRM principal: um tenant tem no MÁXIMO um provider ativo
-- (Kenlo XOR Contact2Sale). Nunca as duas sincronizações para o mesmo tenant.
--
-- A regra vive NO BANCO porque nem todo caminho de escrita passa pelo servidor:
-- o fluxo legado do Kenlo grava kenlo_integrations direto do browser (Supabase
-- client). A camada de serviço (rotas /api/v1/*/config) aplica a mesma regra
-- explicitamente; este trigger é o cinto de segurança que intercepta TODOS os
-- caminhos.
--
-- Semântica: last-write-wins — ativar um provider DESATIVA o outro. Não lança
-- exceção (não quebraria o fluxo legado, que não trata erro de trigger).
--
-- Segurança/robustez:
--  * SECURITY DEFINER: o caminho browser roda como `authenticated` e a tabela
--    C2S tem RLS sem policies — a função precisa executar como owner. O ALTER
--    OWNER abaixo torna isso explícito (owner de tabela é isento de RLS).
--  * to_regclass: se esta migration rodar antes da 20260706_create_tenant_
--    contact2sale_config, a função NÃO pode quebrar toda ativação do Kenlo em
--    runtime — sem a tabela, vira no-op (e o trigger do lado C2S é criado só
--    quando a tabela existir; reaplicar esta migration depois, se for o caso).
--  * Sem loop: a cascata seta status='inactive', que não satisfaz o WHEN
--    (NEW.status = 'active'); o WHERE "status = 'active'" corta UPDATEs vazios.
--  * Corrida teórica: ativar os dois providers do mesmo tenant no MESMO instante
--    pode deadlockar (AB-BA); o Postgres aborta um dos lados — aceitável e raro
--    (a UI só oferece um switch).
--
-- Idempotente: pode reaplicar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deactivate_other_crm_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cast dos DOIS lados para text: kenlo_integrations.tenant_id é uuid e
  -- tenant_contact2sale_config.tenant_id é text (schemas de épocas diferentes).
  -- Comparar sem cast dá "operator does not exist: uuid = text" e o trigger
  -- explode, derrubando o UPSERT que o disparou. `::text` é no-op quando já é
  -- text e normaliza o uuid — funciona nos dois branches sem depender do tipo.
  IF TG_TABLE_NAME = 'kenlo_integrations' THEN
    IF to_regclass('public.tenant_contact2sale_config') IS NOT NULL THEN
      UPDATE public.tenant_contact2sale_config
         SET status = 'inactive', updated_at = now()
       WHERE tenant_id::text = NEW.tenant_id::text
         AND status = 'active';
    END IF;
  ELSE
    UPDATE public.kenlo_integrations
       SET status = 'inactive', updated_at = now()
     WHERE tenant_id::text = NEW.tenant_id::text
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.deactivate_other_crm_provider() OWNER TO postgres;

DROP TRIGGER IF EXISTS tr_crm_provider_exclusivity ON public.kenlo_integrations;
CREATE TRIGGER tr_crm_provider_exclusivity
  AFTER INSERT OR UPDATE OF status ON public.kenlo_integrations
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.deactivate_other_crm_provider();

-- Lado C2S: só quando a tabela existir (fora de ordem → reaplicar esta migration).
DO $$
BEGIN
  IF to_regclass('public.tenant_contact2sale_config') IS NULL THEN
    RAISE NOTICE 'tenant_contact2sale_config ausente — trigger do lado C2S NÃO criado; aplique 20260706_create_tenant_contact2sale_config e reaplique esta migration.';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tr_crm_provider_exclusivity ON public.tenant_contact2sale_config';
  EXECUTE 'CREATE TRIGGER tr_crm_provider_exclusivity
             AFTER INSERT OR UPDATE OF status ON public.tenant_contact2sale_config
             FOR EACH ROW
             WHEN (NEW.status = ''active'')
             EXECUTE FUNCTION public.deactivate_other_crm_provider()';
END;
$$;
