-- Migration: Formulários da Meta um a um (P2.7)
-- Data: 2026-09-21
--
-- A integração com a Meta JÁ RODA: 134 eventos entre 07/08 e 20/09, 133
-- processados, 125 leads criados. O que não existe é o controle POR
-- FORMULÁRIO — hoje a captação é toda-ou-nada por imobiliária.
--
-- TRÊS COISAS QUE O PLANO PEDE E QUE JÁ EXISTEM, MEDIDAS ANTES DE ESCREVER
--
-- 1. `empreendimento_id` no formulário. Já existe, em `lancamento_anuncios`:
--    39 linhas ligando form_id ao código do empreendimento, e é por ela que os
--    125 leads entram com "RESERVA CASTANHEIRA" e "ALLEGRATO". Decidido pelo
--    chefe em 21/09: a tela lê e escreve NELA. Duas tabelas dizendo de que
--    empreendimento é o formulário divergiriam no primeiro remanejamento.
--
-- 2. `fila_id`. Não existe fila como tabela — as três filas do P1.1 são ramos
--    da regra (server/distribuicao/regra.js), não linhas. E o destino é
--    DERIVÁVEL: formulário com empreendimento vai para a roleta do lançamento;
--    sem empreendimento, cai no pega-tudo. É exatamente o contador que o plano
--    pede ("Sem direcionamento — caem na fila pega-tudo"). Coluna não entra.
--
-- 3. Campanha e anúncio no lead. Já chegam — dentro de
--    `custom_fields->raw_data->meta`. Mas lá não dá para filtrar, agrupar nem
--    indexar, que é o que a tela deste item e o ROI do P3.5 precisam. Viram
--    colunas, e o que já existe é copiado.
--
-- ACHADO AO MEDIR: a campanha só passou a ser gravada em 12/09/2026. Dos 125
-- leads, 56 (os de antes) não têm `campaign_id` nem `adset_id`; de 13/09 em
-- diante são 100%. Todos os 56 estão dentro da janela de 90 dias que a Meta
-- guarda, então o "Baixar leads" pode recuperá-los — decidido pelo chefe.
--
-- ORDEM DO DEPLOY: banco antes do servidor. Colunas aditivas.

-- ------------------------------------------------------------
-- 1. Os formulários
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_formularios (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Id da Meta, não uuid nosso: é ele que chega no webhook e é por ele que o
  -- de-para com o empreendimento já funciona.
  form_id text NOT NULL,
  page_id text,
  nome text,

  -- Desligar aqui faz o lead daquele formulário entrar SEM distribuição.
  -- Ele não some: some da roleta. Descartar o lead pago seria jogar dinheiro
  -- fora, e é o tipo de coisa que ninguém percebe até o fim do mês.
  captacao_ativa boolean NOT NULL DEFAULT true,
  lia_atende     boolean NOT NULL DEFAULT true,

  -- Estado do que já foi buscado na Meta. `leads_na_base` e `ultimo_lead_em`
  -- NÃO viram coluna: são contagem de `leads`, e coluna copiada de contagem
  -- envelhece calada. A função do painel conta na hora.
  baixado_ate     timestamptz,
  sincronizado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, form_id)
);

-- O pg_default_acl do Supabase concede tudo a anon em toda tabela nova.
REVOKE ALL ON public.meta_formularios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.meta_formularios TO authenticated;
GRANT ALL ON public.meta_formularios TO service_role;

ALTER TABLE public.meta_formularios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_formularios_select ON public.meta_formularios;
CREATE POLICY meta_formularios_select ON public.meta_formularios
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Ligar e desligar captação mexe no dinheiro de mídia paga: gestão.
DROP POLICY IF EXISTS meta_formularios_write ON public.meta_formularios;
CREATE POLICY meta_formularios_write ON public.meta_formularios
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 2. Campanha e anúncio como coluna do lead
-- ------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_form_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_ad_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_adset_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_campaign_id text;

-- O que a configuração do formulário dizia NO MOMENTO em que este lead entrou.
-- Guardado no lead, e não lido do formulário na hora de perguntar: a
-- configuração muda, e ler do formulário reescreveria o passado — um lead que
-- entrou com a captação desligada passaria a parecer distribuível no dia em
-- que alguém religasse o formulário.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_captado boolean;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_lia_atende boolean;

-- A coluna nova nasce sem permissão para quem já lia a tabela: sem isto a
-- tela continua vendo o lead e o campo chega nulo, sem erro nenhum.
GRANT SELECT (meta_form_id, meta_ad_id, meta_adset_id, meta_campaign_id,
              meta_captado, meta_lia_atende)
  ON public.leads TO authenticated;

CREATE INDEX IF NOT EXISTS leads_meta_form_idx
  ON public.leads (tenant_id, meta_form_id) WHERE meta_form_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_meta_campanha_idx
  ON public.leads (tenant_id, meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2b. O gatilho que promove o jsonb a coluna
-- ------------------------------------------------------------
-- Quem escreve o lead da Meta — o webhook, o "Baixar leads" e, amanhã, a LIA —
-- já manda tudo dentro de `raw_data.meta`, e a rota `/api/v1/leads` preserva
-- esse bloco. Em vez de ensinar cada escritor a preencher seis colunas (e
-- descobrir daqui a um mês que um deles não preenche), o banco promove.
--
-- Só preenche o que está VAZIO: assim um UPDATE posterior feito à mão (o
-- "Baixar leads" completando a campanha dos 56 antigos) não é desfeito na
-- próxima escrita.
CREATE OR REPLACE FUNCTION public.tg_leads_promove_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb := NEW.custom_fields->'raw_data'->'meta';
BEGIN
  IF m IS NULL THEN RETURN NEW; END IF;
  NEW.meta_form_id     := COALESCE(NEW.meta_form_id,     m->>'form_id');
  NEW.meta_ad_id       := COALESCE(NEW.meta_ad_id,       m->>'ad_id');
  NEW.meta_adset_id    := COALESCE(NEW.meta_adset_id,    m->>'adset_id');
  NEW.meta_campaign_id := COALESCE(NEW.meta_campaign_id, m->>'campaign_id');
  NEW.meta_captado     := COALESCE(NEW.meta_captado,     (m->>'captacao_ativa')::boolean);
  NEW.meta_lia_atende  := COALESCE(NEW.meta_lia_atende,  (m->>'lia_atende')::boolean);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS leads_promove_meta ON public.leads;
CREATE TRIGGER leads_promove_meta
  BEFORE INSERT OR UPDATE OF custom_fields ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_promove_meta();

-- O que já chegou, copiado do jsonb. Sem isto a tela nasceria dizendo "0
-- leads" para formulários que trouxeram 119.
UPDATE public.leads SET
  meta_form_id     = custom_fields->'raw_data'->'meta'->>'form_id',
  meta_ad_id       = custom_fields->'raw_data'->'meta'->>'ad_id',
  meta_adset_id    = custom_fields->'raw_data'->'meta'->>'adset_id',
  meta_campaign_id = custom_fields->'raw_data'->'meta'->>'campaign_id'
WHERE custom_fields->'raw_data'->'meta'->>'form_id' IS NOT NULL
  AND meta_form_id IS NULL;

-- Os formulários que já trouxeram lead entram na tabela sabendo disso. Assim a
-- tela funciona antes de a primeira sincronização com a Meta rodar.
INSERT INTO public.meta_formularios (tenant_id, form_id, page_id, nome)
SELECT DISTINCT l.tenant_id,
       l.meta_form_id,
       l.custom_fields->'raw_data'->'meta'->>'page_id',
       NULL
  FROM public.leads l
 WHERE l.meta_form_id IS NOT NULL
ON CONFLICT (tenant_id, form_id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. O painel
-- ------------------------------------------------------------
-- Devolve os contadores e a tabela numa chamada só. `leads_na_base`,
-- `ultimo_lead_em` e "novos 24h" são CONTADOS aqui, não guardados: contagem
-- copiada para coluna envelhece sem ninguém perceber.
--
-- O empreendimento sai de `lancamento_anuncios` — a mesma tabela que o
-- processador consulta para carimbar o lead. Uma fonte, um resultado.
CREATE OR REPLACE FUNCTION public.meta_formularios_painel(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_linhas jsonb;
  v_contadores jsonb;
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

  WITH por_form AS (
    SELECT l.meta_form_id AS form_id,
           count(*) AS leads,
           count(*) FILTER (WHERE l.created_at >= now() - interval '24 hours') AS novos_24h,
           max(l.created_at) AS ultimo,
           count(*) FILTER (WHERE l.meta_campaign_id IS NULL) AS sem_campanha
      FROM leads l
     WHERE l.tenant_id = p_tenant_id AND l.meta_form_id IS NOT NULL
     GROUP BY 1
  ),
  linhas AS (
    SELECT
      f.form_id,
      f.nome,
      f.page_id,
      f.captacao_ativa,
      f.lia_atende,
      f.baixado_ate,
      f.sincronizado_em,
      COALESCE(p.leads, 0)     AS leads_na_base,
      COALESCE(p.novos_24h, 0) AS novos_24h,
      COALESCE(p.sem_campanha, 0) AS sem_campanha,
      p.ultimo                 AS ultimo_lead_em,
      -- O empreendimento vem do de-para que o processador já usa.
      la.codigo                AS empreendimento_codigo,
      -- Sem empreendimento, o lead não bate na regra do lançamento e cai na
      -- roleta geral. É o "sem direcionamento" que o plano pede no contador.
      CASE WHEN la.codigo IS NULL THEN 'pega_tudo' ELSE 'lancamento' END AS destino
    FROM meta_formularios f
    LEFT JOIN por_form p ON p.form_id = f.form_id
    LEFT JOIN lancamento_anuncios la
           ON la.tenant_id = f.tenant_id AND la.origin_listing_id = f.form_id
    WHERE f.tenant_id = p_tenant_id
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.leads_na_base DESC, l.form_id), '[]'::jsonb),
    jsonb_build_object(
      'formularios',    count(*),
      'captando',       count(*) FILTER (WHERE l.captacao_ativa),
      'lia_atende',     count(*) FILTER (WHERE l.lia_atende),
      'sem_direcionamento', count(*) FILTER (WHERE l.destino = 'pega_tudo'),
      'leads_na_base',  COALESCE(sum(l.leads_na_base), 0),
      'novos_24h',      COALESCE(sum(l.novos_24h), 0),
      -- Quantos leads entraram sem campanha: é o buraco que o "Baixar leads"
      -- fecha, e o gestor precisa vê-lo para saber que vale a pena rodar.
      'sem_campanha',   COALESCE(sum(l.sem_campanha), 0),
      'sincronizado_em', max(l.sincronizado_em)
    )
  INTO v_linhas, v_contadores
  FROM linhas l;

  RETURN jsonb_build_object('linhas', v_linhas, 'contadores', v_contadores);
END;
$function$;

REVOKE ALL ON FUNCTION public.meta_formularios_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_formularios_painel(uuid) TO authenticated, service_role;
