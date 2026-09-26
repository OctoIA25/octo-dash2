-- ============================================================
-- `meta_captado` e `meta_lia_atende` estavam nulas em 5.405 de 5.405 — 26/09
--
-- A equipe da Lia achou: as duas colunas que deveriam dizer "não distribua" e
-- "não fale com este lead" estão 100% nulas, inclusive nos leads da Meta
-- criados em 25/09, depois de a Dash dizer que a captação por formulário já
-- estava no ar.
-- ============================================================
--
-- A CAUSA, RASTREADA ATÉ O FIM
--
-- O gatilho `leads_promove_meta` está ATIVO e a função existe. Ela lê as seis
-- chaves de `custom_fields->raw_data->meta`, e quatro delas funcionam:
-- `meta_form_id`, `meta_ad_id`, `meta_adset_id` e `meta_campaign_id` estão
-- preenchidas em 164 leads.
--
-- As outras duas não, porque o que a integração grava é:
--
--     ad_id, adset_id, campaign_id, created_time, form_id, leadgen_id,
--     page_id, platform
--
-- Não há `captacao_ativa` nem `lia_atende` ali. E não poderia haver: essas
-- duas NÃO SÃO PROPRIEDADES DO LEAD. São do FORMULÁRIO, e moram em
-- `meta_formularios` — é lá que o gestor liga e desliga cada um.
--
-- O gatilho procurava no lugar errado. Cada lead carregava a pergunta e
-- nenhuma resposta, e a coluna ficava nula sem erro nenhum.
--
-- ============================================================
-- POR QUE NÃO DEFAULT `false` PARA FORMULÁRIO DESCONHECIDO
--
-- Tentador, e errado. `meta_captado = false` quer dizer "a captação estava
-- desligada, não distribua". Um formulário que ainda não foi cadastrado não
-- disse isso — ninguém disse nada sobre ele.
--
-- Gravar `false` por omissão pararia a distribuição de um lead legítimo, e a
-- tela mostraria o motivo como se fosse decisão de alguém. Nulo é "não sei", e
-- é a resposta honesta; a Lia já combinou não agir enquanto for nula.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_leads_promove_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  m    jsonb := NEW.custom_fields->'raw_data'->'meta';
  v_id text;
  f    record;
BEGIN
  IF m IS NULL THEN RETURN NEW; END IF;

  NEW.meta_form_id     := COALESCE(NEW.meta_form_id,     m->>'form_id');
  NEW.meta_ad_id       := COALESCE(NEW.meta_ad_id,       m->>'ad_id');
  NEW.meta_adset_id    := COALESCE(NEW.meta_adset_id,    m->>'adset_id');
  NEW.meta_campaign_id := COALESCE(NEW.meta_campaign_id, m->>'campaign_id');

  -- O PAYLOAD PRIMEIRO, se um dia ele trouxer: quem manda o dado explícito
  -- está afirmando algo sobre AQUELE lead, e isso vence o cadastro.
  NEW.meta_captado    := COALESCE(NEW.meta_captado,    (m->>'captacao_ativa')::boolean);
  NEW.meta_lia_atende := COALESCE(NEW.meta_lia_atende, (m->>'lia_atende')::boolean);

  -- E DEPOIS O CADASTRO DO FORMULÁRIO, que é onde a resposta de fato mora.
  v_id := NEW.meta_form_id;
  IF v_id IS NOT NULL
     AND (NEW.meta_captado IS NULL OR NEW.meta_lia_atende IS NULL) THEN
    SELECT mf.captacao_ativa, mf.lia_atende INTO f
      FROM meta_formularios mf
     WHERE mf.tenant_id = NEW.tenant_id AND mf.form_id = v_id;

    -- FOUND é o que separa "o formulário disse" de "ninguém cadastrou". Sem
    -- esta distinção, formulário desconhecido viraria `false` e pararia a
    -- distribuição de lead legítimo, com cara de decisão tomada.
    IF FOUND THEN
      NEW.meta_captado    := COALESCE(NEW.meta_captado,    f.captacao_ativa);
      NEW.meta_lia_atende := COALESCE(NEW.meta_lia_atende, f.lia_atende);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_leads_promove_meta() IS
  'Promove os campos da Meta de custom_fields para colunas. `captacao_ativa` e `lia_atende` vem do CADASTRO do formulario (meta_formularios), nao do payload -- o payload nunca as trouxe, e por isso as duas ficaram nulas em 5.405 de 5.405 ate 26/09. Formulario nao cadastrado deixa NULO, nunca false.';

-- ------------------------------------------------------------
-- Os leads que já existem
--
-- O gatilho só vale para quem entrar daqui em diante. Os 164 leads da Meta já
-- gravados continuariam nulos, e a Lia não teria o que ler sobre eles.
--
-- Só toca quem tem formulário CADASTRADO e coluna ainda nula: quem já tem
-- valor foi decidido por alguém, e sobrescrever apagaria essa decisão.
-- ------------------------------------------------------------
UPDATE public.leads l
   SET meta_captado    = COALESCE(l.meta_captado,    mf.captacao_ativa),
       meta_lia_atende = COALESCE(l.meta_lia_atende, mf.lia_atende)
  FROM public.meta_formularios mf
 WHERE mf.tenant_id = l.tenant_id
   AND mf.form_id   = l.meta_form_id
   AND l.meta_form_id IS NOT NULL
   AND (l.meta_captado IS NULL OR l.meta_lia_atende IS NULL);

NOTIFY pgrst, 'reload schema';
