-- ============================================================
-- P3.8 · Relatório de recrutamento
-- ============================================================
-- MEDIDO EM PRODUÇÃO antes de escrever, em 21/09/2026:
--
--   5 candidatos, todos entre 30/04 e 07/05/2026.
--   `canal` (a origem) = 'outro' nos 5, dos 9 valores possíveis. E não é
--   escolha: a coluna é NOT NULL DEFAULT 'outro', então quem não marca nada
--   cai ali. "5 de 5 em outro" lê-se "ninguém preencheu", e não "todos vieram
--   de outro lugar" — a tela diz isso.
--   `ts_primeiro_contato`: 0 de 5 preenchidos.
--   `ts_qualificado`:      0 de 5 preenchidos.
--   `recrut_evento`: só 'candidatura_recebida', 5 linhas.
--
-- O PLANO MANDA CRIAR `candidato_etapa_eventos` para gravar quando o candidato
-- alcança cada etapa. Mas `recrut_candidato` JÁ TEM uma coluna de data por
-- etapa — nove delas. Decidido com o chefe em 21/09: a data mora onde já mora,
-- e um gatilho passa a carimbá-la. Uma tabela nova seria a terceira fonte para
-- o mesmo fato, e as três divergiriam na primeira correção.
--
-- O QUE ISSO NÃO RESOLVE, e a tela diz: o passado. Os carimbos que nunca foram
-- preenchidos continuam vazios — o gatilho só vale daqui para frente.

-- ------------------------------------------------------------
-- 1. A área do candidato
-- ------------------------------------------------------------
-- O plano pede o relatório "por área". O campo não existia: o que havia era
-- `cargo`, texto livre com "Corretor Júnior" e "Gerente de Vendas" — que é
-- cargo, e não área, e se fragmentaria sozinho na primeira variação de escrita.
ALTER TABLE public.recrut_candidato
  ADD COLUMN IF NOT EXISTS area text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recrut_candidato_area_check'
  ) THEN
    ALTER TABLE public.recrut_candidato
      ADD CONSTRAINT recrut_candidato_area_check
      CHECK (area IS NULL OR area IN ('vendas_lancamentos', 'vendas_prontos', 'administrativo'));
  END IF;
END $$;

COMMENT ON COLUMN public.recrut_candidato.area IS
  'Área da vaga: vendas_lancamentos, vendas_prontos ou administrativo. NULL enquanto ninguém preencher — os 5 candidatos que já existiam entraram sem ela.';

-- ------------------------------------------------------------
-- 2. Desde quando a data de alcance é registrada sozinha
-- ------------------------------------------------------------
-- A tela precisa deste marco para dizer "sem registro antes disto" em vez de
-- mostrar 0% — que seria lido como "o processo trava aqui", quando a verdade é
-- "ninguém anotava isso".
--
-- Uma função e não uma coluna: é um fato do SISTEMA, igual para todo tenant, e
-- guardá-lo por tenant convidaria alguém a editá-lo.
CREATE OR REPLACE FUNCTION public.recrut_registro_automatico_desde()
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT DATE '2026-09-21';
$function$;

GRANT EXECUTE ON FUNCTION public.recrut_registro_automatico_desde() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. O gatilho que carimba a data de alcance
-- ------------------------------------------------------------
-- Carimba SÓ SE ESTIVER VAZIO. "Data de alcance" é a PRIMEIRA vez que o
-- candidato chegou à etapa: se ele volta e avança de novo, reescrever a data
-- apagaria quanto tempo ele levou de verdade.
CREATE OR REPLACE FUNCTION public.recrut_carimba_etapa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estagio IS NOT DISTINCT FROM OLD.estagio THEN
    RETURN NEW;
  END IF;

  -- O mapa entre o estágio e a coluna. Duas colunas do cadastro
  -- (ts_primeira_resposta e ts_reuniao_agendada) NÃO entram aqui de propósito:
  -- elas são mais finas que o estágio e já são preenchidas por outro caminho.
  CASE NEW.estagio::text
    WHEN 'lead'              THEN NEW.ts_candidatura        := COALESCE(NEW.ts_candidatura, now());
    WHEN 'interacao'         THEN NEW.ts_primeiro_contato   := COALESCE(NEW.ts_primeiro_contato, now());
    WHEN 'qualificado'       THEN NEW.ts_qualificado        := COALESCE(NEW.ts_qualificado, now());
    WHEN 'reuniao_realizada' THEN NEW.ts_reuniao_realizada  := COALESCE(NEW.ts_reuniao_realizada, now());
    WHEN 'matricula'         THEN NEW.ts_matricula          := COALESCE(NEW.ts_matricula, now());
    WHEN 'onboard'           THEN NEW.ts_onboard            := COALESCE(NEW.ts_onboard, now());
    WHEN 'perdido'           THEN NEW.ts_encerrado          := COALESCE(NEW.ts_encerrado, now());
    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS recrut_candidato_carimba_etapa ON public.recrut_candidato;
CREATE TRIGGER recrut_candidato_carimba_etapa
  BEFORE INSERT OR UPDATE ON public.recrut_candidato
  FOR EACH ROW EXECUTE FUNCTION public.recrut_carimba_etapa();

-- ------------------------------------------------------------
-- 4. O relatório
-- ------------------------------------------------------------
-- POR DATA DE ALCANCE, e não por onde o candidato está hoje. É o que o plano
-- pede por escrito, e a diferença é grande: "quantos chegaram em Qualificado
-- em maio" não é "quantos estão em Qualificado agora" — quem passou por lá e
-- avançou sumiria da segunda contagem.
CREATE OR REPLACE FUNCTION public.recrut_relatorio(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, v_hoje);
  v_etapas jsonb;
  v_origem jsonb;
  v_area jsonb;
  v_total int;
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

  -- Cada etapa com a sua coluna de data, na ordem do funil. `registrado`
  -- conta quantos candidatos do TENANT têm aquele carimbo em qualquer época:
  -- é o número que denuncia a etapa que ninguém anota.
  WITH etapas(ordem, etapa, rotulo, quando) AS (
    SELECT * FROM (VALUES
      (1, 'lead',              'Candidatura',      'ts_candidatura'),
      (2, 'interacao',         'Primeiro contato', 'ts_primeiro_contato'),
      (3, 'qualificado',       'Qualificado',      'ts_qualificado'),
      (4, 'reuniao_realizada', 'Reunião feita',    'ts_reuniao_realizada'),
      (5, 'matricula',         'Matrícula',        'ts_matricula'),
      (6, 'onboard',           'Onboard',          'ts_onboard')
    ) v(ordem, etapa, rotulo, quando)
  ),
  contagem AS (
    SELECT e.ordem, e.etapa, e.rotulo,
           (SELECT count(*) FROM recrut_candidato c
             WHERE c.tenant_id = p_tenant_id
               AND (CASE e.quando
                      WHEN 'ts_candidatura'       THEN c.ts_candidatura
                      WHEN 'ts_primeiro_contato'  THEN c.ts_primeiro_contato
                      WHEN 'ts_qualificado'       THEN c.ts_qualificado
                      WHEN 'ts_reuniao_realizada' THEN c.ts_reuniao_realizada
                      WHEN 'ts_matricula'         THEN c.ts_matricula
                      WHEN 'ts_onboard'           THEN c.ts_onboard
                    END AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_de AND v_ate
           ) AS alcancaram,
           (SELECT count(*) FROM recrut_candidato c
             WHERE c.tenant_id = p_tenant_id
               AND (CASE e.quando
                      WHEN 'ts_candidatura'       THEN c.ts_candidatura
                      WHEN 'ts_primeiro_contato'  THEN c.ts_primeiro_contato
                      WHEN 'ts_qualificado'       THEN c.ts_qualificado
                      WHEN 'ts_reuniao_realizada' THEN c.ts_reuniao_realizada
                      WHEN 'ts_matricula'         THEN c.ts_matricula
                      WHEN 'ts_onboard'           THEN c.ts_onboard
                    END) IS NOT NULL
           ) AS registrado_sempre
      FROM etapas e
  )
  SELECT jsonb_agg(jsonb_build_object(
           'ordem', ordem, 'etapa', etapa, 'rotulo', rotulo,
           'alcancaram', alcancaram,
           -- Zero AQUI, com `registrado_sempre` também zero, é o sinal de que
           -- a etapa nunca foi anotada — e não de que ninguém passou por ela.
           'registrado_sempre', registrado_sempre
         ) ORDER BY ordem) INTO v_etapas
    FROM contagem;

  -- POR ORIGEM. Todo candidato do período entra, inclusive o sem canal: o
  -- critério de pronto do plano é "a soma por origem bate com o total", e uma
  -- linha que some do agrupamento quebra exatamente isso.
  SELECT count(*) INTO v_total
    FROM recrut_candidato c
   WHERE c.tenant_id = p_tenant_id
     AND (c.ts_candidatura AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_de AND v_ate;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'origem', origem,
           'candidatos', n,
           -- 'outro' é o PADRÃO da coluna, e não uma escolha. Marcar a linha
           -- deixa a tela dizer que ali provavelmente está quem ninguém
           -- preencheu — sem isso, o gestor lê "todos vieram de outro lugar".
           'e_o_padrao', origem = 'outro'
         ) ORDER BY n DESC, origem), '[]'::jsonb) INTO v_origem
    FROM (
      SELECT COALESCE(c.canal::text, '(sem origem)') AS origem, count(*) AS n
        FROM recrut_candidato c
       WHERE c.tenant_id = p_tenant_id
         AND (c.ts_candidatura AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_de AND v_ate
       GROUP BY 1
    ) o;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'area', area, 'candidatos', n
         ) ORDER BY n DESC, area), '[]'::jsonb) INTO v_area
    FROM (
      SELECT COALESCE(c.area, '(sem área)') AS area, count(*) AS n
        FROM recrut_candidato c
       WHERE c.tenant_id = p_tenant_id
         AND (c.ts_candidatura AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_de AND v_ate
       GROUP BY 1
    ) a;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'total', v_total,
    'etapas', COALESCE(v_etapas, '[]'::jsonb),
    'por_origem', v_origem,
    -- Quantos estão no padrão da coluna. É o número que diz se a leitura por
    -- origem vale alguma coisa: em produção são 5 de 5.
    'origem_no_padrao', (
      SELECT count(*) FROM recrut_candidato c
       WHERE c.tenant_id = p_tenant_id
         AND c.canal::text = 'outro'
         AND (c.ts_candidatura AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_de AND v_ate
    ),
    'por_area', v_area,
    -- A data a partir da qual a etapa passa a ser carimbada sozinha. Antes
    -- disto, etapa sem registro não quer dizer etapa sem gente.
    'registro_desde', public.recrut_registro_automatico_desde()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recrut_relatorio(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrut_relatorio(uuid, date, date) TO authenticated, service_role;
