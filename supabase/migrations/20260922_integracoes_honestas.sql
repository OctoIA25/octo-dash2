-- ============================================================
-- P4.10 — Integrações honestas
--
-- O CRITÉRIO DE PRONTO DO PLANO é uma frase: "Nenhum card pede senha para uma
-- integração que não existe."
--
-- O QUE FOI MEDIDO ANTES DE ESCREVER (22/09/2026):
--   · a tela mostra 37 cards;
--   · SEIS integrações existem de verdade: Kenlo, Contact2Sale, Anthropic,
--     Santa Ângela, ZAP Imóveis e Meta Lead Ads;
--   · as outras 31 são formulário de e-mail e senha desabilitado, com um selo
--     "Desconectado" escrito à mão. Nenhuma tem serviço, rota ou tabela;
--   · o contador "Total de Integrações: 4" é um número fixo no código;
--   · "Integrações Ativas" conta quatro e ignora Anthropic e Meta;
--   · o contador de "Leads Recebidos" chama uma rota OWNER-ONLY: para um
--     admin de imobiliária ela devolve 403 e o número vira ZERO, mesmo com
--     milhares de leads. No outro ramo, ele baixa a tabela inteira de leads
--     para o navegador só para tirar o tamanho da lista.
--
-- Esta migration entrega o que a tela precisa para parar de inventar: UMA
-- função que devolve, para cada integração real, o estado que já está guardado
-- em seis tabelas diferentes — e a contagem de leads de cada uma, contada onde
-- aquela integração de fato escreve.
--
-- O QUE ELA NÃO FAZ, de propósito: não inventa status para integração que não
-- existe. Card sem integração sai da tela; não vira "desconectado".
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- UMA ADVERTÊNCIA QUE VALE PARA QUEM MEXER AQUI DEPOIS
--
-- `tenant_id` é TEXTO em seis destas tabelas e uuid em três — medido em
-- 22/09. Comparar sem converter não dá erro de compilação: dá erro em tempo
-- de execução, e só quando a função é chamada. As conversões abaixo são de
-- propósito, uma a uma.
--
-- De onde vem a contagem de cada uma
--
-- Não existe coluna de origem no lead: as integrações escrevem em
-- `leads.source`, que é texto livre, ou em `kenlo_leads.source_crm`. Contar
-- por onde a integração ESCREVE é o único jeito de o número significar o que
-- o rótulo promete — e por isso a função devolve junto de onde tirou, para a
-- tela poder dizer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integracoes_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF NOT public.is_tenant_admin_or_owner(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;

  -- ---------- Kenlo ----------
  SELECT k.status, k.last_sync_at, k.sync_state INTO r
    FROM kenlo_integrations k WHERE k.tenant_id = p_tenant_id LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'kenlo', 'nome', 'Kenlo Imob',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    'ultima_sincronizacao', r.last_sync_at,
    -- O `sync_state` guarda o erro dentro de um JSON em texto. Ler com
    -- cuidado: JSON malformado não pode derrubar a tela inteira.
    'ultimo_erro', public.erro_do_sync_state(r.sync_state),
    'leads', (SELECT count(*) FROM kenlo_leads l
               WHERE l.tenant_id = p_tenant_id AND l.source_crm = 'kenlo'),
    'leads_de_onde', 'leads com origem Kenlo',
    'testar', false
  ));

  -- ---------- Contact2Sale ----------
  SELECT c.status, c.last_sync_at, c.sync_state INTO r
    FROM tenant_contact2sale_config c WHERE c.tenant_id = p_tenant_id::text LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'contact2sale', 'nome', 'Contact2Sale',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    'ultima_sincronizacao', r.last_sync_at,
    'ultimo_erro', public.erro_do_sync_state(r.sync_state),
    'leads', (SELECT count(*) FROM kenlo_leads l
               WHERE l.tenant_id = p_tenant_id AND l.source_crm = 'contact2sale'),
    'leads_de_onde', 'leads com origem Contact2Sale',
    'testar', true
  ));

  -- ---------- ZAP Imóveis ----------
  SELECT z.status, z.last_feed_at, z.last_lead_at, z.last_error INTO r
    FROM tenant_zap_config z WHERE z.tenant_id = p_tenant_id::text LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'zap', 'nome', 'ZAP Imóveis',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    -- Aqui "sincronizar" são duas coisas: a ZAP buscar o feed e a ZAP mandar
    -- um lead. A mais recente é a que diz se o canal está vivo.
    'ultima_sincronizacao', GREATEST(r.last_feed_at, r.last_lead_at),
    'ultimo_erro', NULLIF(r.last_error, ''),
    'leads', (SELECT count(*) FROM leads l
               WHERE l.tenant_id = p_tenant_id AND l.source = 'ZAP Imóveis'),
    'leads_de_onde', 'leads com origem "ZAP Imóveis"',
    'testar', true,
    'detalhe', jsonb_build_object('ultimo_feed', r.last_feed_at, 'ultimo_lead', r.last_lead_at)
  ));

  -- ---------- Santa Ângela ----------
  SELECT s.status, s.last_sync_at INTO r
    FROM tenant_santa_angela_config s WHERE s.tenant_id = p_tenant_id::text LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'santa_angela', 'nome', 'Santa Ângela',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    'ultima_sincronizacao', r.last_sync_at,
    -- Esta tabela NÃO tem coluna de erro. Dizer "sem erros" seria afirmar o
    -- que não se sabe; a tela mostra que o dado não existe.
    'ultimo_erro', NULL,
    'erro_nao_registrado', true,
    'leads', (SELECT count(*) FROM leads l
               WHERE l.tenant_id = p_tenant_id AND l.source = 'Santa Angela'),
    'leads_de_onde', 'leads com origem "Santa Angela"',
    'testar', true
  ));

  -- ---------- Meta Lead Ads ----------
  SELECT m.status, m.last_event_at INTO r
    FROM tenant_meta_leadgen_config m WHERE m.tenant_id = p_tenant_id::text LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'meta', 'nome', 'Facebook e Instagram Lead Ads',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    'ultima_sincronizacao', r.last_event_at,
    -- O erro mais recente da fila de leads. É o único registro por-lead que
    -- existe em qualquer integração desta Dash.
    'ultimo_erro', (SELECT e.last_error FROM meta_leadgen_events e
                     WHERE e.tenant_id = p_tenant_id::text
                       AND COALESCE(e.last_error, '') <> ''
                     ORDER BY e.created_at DESC LIMIT 1),
    'leads', (SELECT count(*) FROM leads l
               WHERE l.tenant_id = p_tenant_id AND l.source IN ('Facebook', 'Instagram')),
    'leads_de_onde', 'leads com origem Facebook ou Instagram',
    'testar', false,
    'detalhe', jsonb_build_object(
      'na_fila', (SELECT count(*) FROM meta_leadgen_events e
                   WHERE e.tenant_id = p_tenant_id::text AND e.status = 'pending'))
  ));

  -- ---------- Anthropic ----------
  SELECT a.status, a.last_synced_at, a.last_error INTO r
    FROM tenant_anthropic_config a WHERE a.tenant_id = p_tenant_id::text LIMIT 1;
  v := v || jsonb_build_array(jsonb_build_object(
    'codigo', 'anthropic', 'nome', 'Anthropic (relatório de custo)',
    'configurada', r.status IS NOT NULL,
    'status', COALESCE(r.status, 'nao_configurada'),
    'ultima_sincronizacao', r.last_synced_at,
    'ultimo_erro', NULLIF(r.last_error, ''),
    -- Não traz lead nenhum: é relatório de custo. `leads` nulo, e não zero —
    -- zero diria "trouxe zero leads", que é outra coisa.
    'leads', NULL,
    'leads_de_onde', 'não traz leads: é relatório de custo de IA',
    'testar', true
  ));

  RETURN v;
END;
$function$;

/**
 * Tira a mensagem de erro do `sync_state`, que é JSON guardado como TEXTO.
 *
 * Em texto, e não em jsonb: foi assim que a fase 1 do Contact2Sale nasceu.
 * Converter com `::jsonb` direto estoura a função inteira se uma linha tiver
 * texto malformado — e aí a tela de integrações some por causa de uma delas.
 */
CREATE OR REPLACE FUNCTION public.erro_do_sync_state(p_estado text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE v jsonb;
BEGIN
  IF COALESCE(btrim(p_estado), '') = '' THEN RETURN NULL; END IF;
  BEGIN
    v := p_estado::jsonb;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  RETURN NULLIF(btrim(COALESCE(v->>'error_message', v->>'last_error', '')), '');
END;
$function$;

-- ============================================================
-- O CATÁLOGO DO QUE NÃO EXISTE
--
-- As 31 que a tela pedia senha. Elas saem do código da página e viram DADO,
-- para a tela poder dizer "em breve" sem formulário — e para acrescentar uma
-- de verdade amanhã não exigir mexer em JSX.
--
-- O `estado` é o que separa o honesto do decorativo:
--   'em_breve'   — pretende existir;
--   'por_outra'  — o canal já é atendido por outra integração;
--   'outra_tela' — existe, mas mora em outro lugar da Dash.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integracoes_previstas (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  estado text NOT NULL DEFAULT 'em_breve'
    CHECK (estado IN ('em_breve', 'por_outra', 'outra_tela')),
  -- Por que não tem formulário. É o que a tela mostra no lugar dos campos.
  explicacao text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 100
);

REVOKE ALL ON public.integracoes_previstas FROM anon, authenticated;
GRANT ALL ON public.integracoes_previstas TO service_role;
ALTER TABLE public.integracoes_previstas ENABLE ROW LEVEL SECURITY;

INSERT INTO public.integracoes_previstas (codigo, nome, estado, explicacao, ordem) VALUES
  ('whatsapp', 'WhatsApp', 'outra_tela',
   'Já funciona, mas se configura na aba WhatsApp, aqui do lado.', 10),
  ('viva_real', 'Viva Real', 'por_outra',
   'Atendido pelo feed do Grupo OLX, que já está configurado acima.', 20),
  ('olx', 'OLX', 'por_outra',
   'Atendido pelo feed do Grupo OLX, que já está configurado acima.', 21),
  ('imovelweb', 'Imovelweb', 'por_outra',
   'O feed e o recebimento de leads já existem no servidor, usando a mesma configuração do ZAP.', 22),
  ('google_ads', 'Google Ads', 'em_breve', '', 30),
  ('instagram', 'Instagram', 'por_outra',
   'Os leads de Instagram chegam pelo Facebook Lead Ads, configurado acima.', 31),
  ('lia_serhant', 'Lia Serhant', 'em_breve', '', 40),
  ('linkedin', 'LinkedIn', 'em_breve', '', 41),
  ('site', 'Site', 'em_breve', '', 42),
  ('email', 'E-mail', 'em_breve', '', 43),
  ('landing_pages', 'Landing Pages', 'em_breve', '', 44),
  ('api_custom', 'API Custom', 'outra_tela',
   'A API pública da Dash já existe e se configura na aba API, aqui do lado.', 45),
  ('mercado_livre', 'Mercado Livre', 'em_breve', '', 50),
  ('casa_mineira', 'Casa Mineira', 'em_breve', '', 51),
  ('chaves_na_mao', 'Chaves Na Mão', 'em_breve', '', 52),
  ('dream_casa', 'Dream Casa', 'em_breve', '', 53),
  ('i123', '123i', 'em_breve', '', 54),
  ('moving', 'Moving', 'em_breve', '', 55),
  ('df_imoveis', 'DF Imóveis', 'em_breve', '', 56),
  ('wimoveis', 'Wimoveis', 'em_breve', '', 57),
  ('homer', 'Homer', 'em_breve', '', 58),
  ('buskaza', 'Buskaza', 'em_breve', '', 59),
  ('orulo', 'Órulo', 'em_breve', '', 60),
  ('lugar_certo', 'Lugar Certo', 'em_breve', '', 61),
  ('imovomap', 'ImovoMAP', 'em_breve', '', 62),
  ('mgf_imoveis', 'MGF Imóveis', 'em_breve', '', 63),
  ('rj_imoveis', 'RJ Imóveis', 'em_breve', '', 64),
  ('i321achei', '321achei', 'em_breve', '', 65),
  ('compre_alugue', 'Compre Alugue', 'em_breve', '', 66),
  ('arbo', 'Arbo', 'em_breve', '', 67)
ON CONFLICT (codigo) DO UPDATE
  SET nome = EXCLUDED.nome, estado = EXCLUDED.estado,
      explicacao = EXCLUDED.explicacao, ordem = EXCLUDED.ordem;

CREATE OR REPLACE FUNCTION public.integracoes_previstas_lista()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'codigo', codigo, 'nome', nome, 'estado', estado, 'explicacao', explicacao
  ) ORDER BY ordem, nome), '[]'::jsonb) FROM integracoes_previstas;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.integracoes_status(uuid)',
    'public.integracoes_previstas_lista()',
    'public.erro_do_sync_state(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
