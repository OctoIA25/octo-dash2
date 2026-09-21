-- ============================================================
-- P4.4 · Conferência de vendas
-- ============================================================
-- MEDIDO EM PRODUÇÃO antes de escrever, em 21/09/2026:
--
--   `proposals` com stage 'proposta-assinada': 70, somando R$ 54,25 M.
--     com lead_id ........ 37   (é a ponte que o ROI do P3.5 precisa)
--     com valor .......... 61
--     com corretor ....... 31
--     com comissão já lá . 31
--   `commercial_sales` (a planilha): 37 linhas — OUTRA contagem de venda.
--   Nível do corretor: NÃO EXISTE em lugar nenhum do banco.
--
-- POR QUE A VENDA NASCE DA PROPOSTA, E NÃO DA PLANILHA: casar as 37 linhas da
-- planilha com leads pelo nome do cliente recupera 3. Pela proposta assinada,
-- recupera 37. É a diferença entre um ROI que não fecha e um que fecha.
--
-- A PLANILHA NÃO MORRE: decidido com o chefe em 21/09, ela continua sendo lida
-- como histórico, e cada tela diz de onde o número vem.

-- ------------------------------------------------------------
-- 1. O nível do corretor
-- ------------------------------------------------------------
-- O motor de comissão (`commissionRules.ts`, Regras Lotus v1.5) precisa do
-- nível, e ele não existia. O próprio motor já avisava: "§3.7 manda usar o
-- nível vigente na DATA DO FECHAMENTO — enquanto não houver histórico de
-- promoções persistido, quem chama informa o nível correto daquela data."
--
-- Aqui ele passa a existir. E a venda CONGELA o nível no momento em que nasce,
-- que é o que faz promover alguém em dezembro não mexer na venda de setembro.
ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS nivel text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_memberships_nivel_check') THEN
    ALTER TABLE public.tenant_memberships
      ADD CONSTRAINT tenant_memberships_nivel_check
      CHECK (nivel IS NULL OR nivel IN ('estagiario', 'junior', 'pleno', 'senior', 'coordenador'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenant_memberships.nivel IS
  'Nível do corretor nas Regras de Comissão Lotus. NULL = ainda não definido; a venda registra o nível do momento em `vendas.nivel_corretor`.';

-- ------------------------------------------------------------
-- 2. O regime tributário do tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_fiscal_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  regime_tributario text NOT NULL DEFAULT 'simples'
    CHECK (regime_tributario IN ('simples', 'lucro_presumido', 'lucro_real')),
  -- Percentual de imposto sobre a comissão bruta. Sem valor cadastrado, a
  -- venda nasce com imposto ZERO e a tela diz isso — inventar uma alíquota
  -- daria um líquido errado com cara de exato.
  imposto_pct numeric CHECK (imposto_pct IS NULL OR (imposto_pct >= 0 AND imposto_pct <= 100)),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.tenant_fiscal_config FROM anon, authenticated;
GRANT SELECT ON public.tenant_fiscal_config TO authenticated;
GRANT ALL ON public.tenant_fiscal_config TO service_role;
ALTER TABLE public.tenant_fiscal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_fiscal_config_select ON public.tenant_fiscal_config;
CREATE POLICY tenant_fiscal_config_select ON public.tenant_fiscal_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS tenant_fiscal_config_escrita ON public.tenant_fiscal_config;
CREATE POLICY tenant_fiscal_config_escrita ON public.tenant_fiscal_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 3. As vendas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- A proposta que virou venda. Única: duas vendas da mesma proposta seriam
  -- a mesma comissão paga duas vezes.
  proposta_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  -- O VÍNCULO QUE DESTRAVA O ROI. Vem da proposta, que o tem em 37 das 70
  -- assinadas — contra 3 que se recuperaria casando a planilha por nome.
  lead_id uuid,
  data_venda date NOT NULL,
  empreendimento text NOT NULL DEFAULT '',
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  construtora_id uuid REFERENCES public.construtoras(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'lancamento' CHECK (tipo IN ('lancamento', 'terceiros')),
  corretor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corretor_nome text NOT NULL DEFAULT '',
  -- O NÍVEL CONGELADO. É isto que faz "mudar o nível do corretor depois não
  -- altera a venda já registrada" — o critério de pronto do plano.
  nivel_corretor text CHECK (nivel_corretor IS NULL OR nivel_corretor IN
    ('estagiario', 'junior', 'pleno', 'senior', 'coordenador')),
  vgv numeric NOT NULL DEFAULT 0 CHECK (vgv >= 0),
  -- TRAVADO na criação. Mudar exige owner da plataforma E justificativa — o
  -- gatilho da seção 5 cobra as duas coisas.
  comissao_pct numeric NOT NULL DEFAULT 0 CHECK (comissao_pct >= 0 AND comissao_pct <= 100),
  comissao_bruta numeric NOT NULL DEFAULT 0,
  imposto_pct numeric NOT NULL DEFAULT 0 CHECK (imposto_pct >= 0 AND imposto_pct <= 100),
  imposto_valor numeric NOT NULL DEFAULT 0,
  comissao_liquida numeric NOT NULL DEFAULT 0,
  -- A comissão que já estava na proposta, guardada para a tela poder mostrar
  -- a diferença quando o cálculo discorda — decidido com o chefe: o cálculo
  -- manda, e a divergência aparece em vez de sumir.
  comissao_da_proposta numeric,
  nf_numero text,
  nf_data date,
  nf_arquivo text,
  recebimento_previsto_em date,
  recebido_em date,
  valor_recebido numeric,
  status text NOT NULL DEFAULT 'a_faturar'
    CHECK (status IN ('a_faturar', 'faturado', 'recebido', 'divergente')),
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendas_proposta_unica
  ON public.vendas (proposta_id) WHERE proposta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendas_conferencia_idx
  ON public.vendas (tenant_id, data_venda DESC, status);

CREATE INDEX IF NOT EXISTS vendas_lead_idx ON public.vendas (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;

-- `diferenca` é COLUNA GERADA, e não um campo que alguém preenche: recebido
-- menos previsto é uma conta, não um dado. Guardá-lo à mão deixaria a linha
-- dizer uma diferença que não corresponde aos dois números ao lado.
--
-- SEM `COALESCE` no recebido, de propósito: enquanto nada entrou a diferença é
-- NULA, e não a comissão inteira negativa. Com o COALESCE, uma venda que só
-- ainda não foi paga aparecia devendo R$ 32.900 para quem consultasse a
-- coluna — e "não recebi ainda" viraria "recebi a menos".
ALTER TABLE public.vendas DROP COLUMN IF EXISTS diferenca;
ALTER TABLE public.vendas
  ADD COLUMN diferenca numeric
  GENERATED ALWAYS AS (valor_recebido - COALESCE(comissao_liquida, 0)) STORED;

-- ------------------------------------------------------------
-- 4. Os repasses
-- ------------------------------------------------------------
-- Uma linha por pessoa que recebe. Os papéis são os do motor de comissão, para
-- a tela e o cálculo falarem a mesma língua.
CREATE TABLE IF NOT EXISTS public.venda_repasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  membro_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 'lotus' é a casa; 'corretor' é o vendedor. Nomes do motor, não da tela.
  papel text NOT NULL CHECK (papel IN
    ('corretor', 'lider', 'lotus', 'parceiro', 'indicador', 'captador')),
  nome text NOT NULL DEFAULT '',
  -- O nível usado no cálculo, congelado junto. Sem ele, ninguém consegue
  -- reconstruir por que o repasse deu aquele valor seis meses depois.
  nivel text,
  pct numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  pago_em date,
  status text NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar', 'pago')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venda_repasses_idx ON public.venda_repasses (venda_id);

-- ------------------------------------------------------------
-- 5. O histórico, e a trava do percentual
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venda_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campo text NOT NULL,
  de text,
  para text,
  justificativa text,
  por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venda_historico_idx ON public.venda_historico (venda_id, em DESC);

/*
 * O percentual de comissão é TRAVADO na criação.
 *
 * Ele vem da construtora e define quanto a casa recebe. Deixá-lo editável faria
 * o número mudar depois da conferência sem ninguém saber — e comissão é
 * dinheiro de gente. Mudar exige as DUAS coisas: ser owner da plataforma e
 * escrever a justificativa, que fica no histórico.
 *
 * A justificativa viaja por `app.justificativa_comissao`, posta na mesma
 * transação do UPDATE. Uma coluna na tabela seria pior: ficaria lá com o texto
 * da última mudança, parecendo válida para a próxima.
 */
CREATE OR REPLACE FUNCTION public.venda_protege_comissao_pct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_justificativa text;
BEGIN
  NEW.atualizada_em := now();

  IF NEW.comissao_pct IS NOT DISTINCT FROM OLD.comissao_pct THEN
    RETURN NEW;
  END IF;

  v_justificativa := btrim(COALESCE(current_setting('app.justificativa_comissao', true), ''));

  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'o percentual de comissão é travado: só o owner da plataforma pode mudá-lo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_justificativa = '' THEN
    RAISE EXCEPTION 'mudar o percentual de comissão exige justificativa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, justificativa, por)
  VALUES (NEW.id, NEW.tenant_id, 'comissao_pct',
          OLD.comissao_pct::text, NEW.comissao_pct::text, v_justificativa, auth.uid());

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vendas_protege_comissao ON public.vendas;
CREATE TRIGGER vendas_protege_comissao
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.venda_protege_comissao_pct();

-- ------------------------------------------------------------
-- 6. O status se corrige sozinho
-- ------------------------------------------------------------
-- "Divergente" não é algo que alguém marca: é o que a tela CONCLUI quando o
-- recebido não bate com o previsto. Deixar a marcação à mão faria a divergência
-- depender de alguém reparar nela.
CREATE OR REPLACE FUNCTION public.venda_ajusta_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Só mexe quando o dinheiro entra. Quem escolheu 'faturado' ou 'a_faturar'
  -- continua com o que escolheu.
  IF NEW.recebido_em IS NOT NULL AND NEW.valor_recebido IS NOT NULL THEN
    -- Um centavo de diferença é arredondamento de banco, não divergência.
    IF abs(COALESCE(NEW.valor_recebido, 0) - COALESCE(NEW.comissao_liquida, 0)) > 0.01 THEN
      NEW.status := 'divergente';
    ELSE
      NEW.status := 'recebido';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vendas_ajusta_status ON public.vendas;
CREATE TRIGGER vendas_ajusta_status
  BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.venda_ajusta_status();

-- ------------------------------------------------------------
-- 7. Assinar a proposta cria a venda
-- ------------------------------------------------------------
-- O critério de pronto do plano: "assinar um negócio cria a venda com a
-- comissão calculada".
--
-- O CÁLCULO DOS REPASSES NÃO MORA AQUI. O motor de comissão são 468 linhas de
-- TypeScript, com pontas, líder, indicação e bloqueio de caso atípico —
-- reescrevê-lo em SQL daria duas implementações da mesma regra, e elas
-- divergiriam. O gatilho cria a venda com a conta simples (VGV × %, imposto) e
-- CONGELA o nível do corretor; os repasses são calculados pela tela, com o
-- motor, a partir do nível que ficou guardado aqui.
CREATE OR REPLACE FUNCTION public.proposta_assinada_cria_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_construtora_id uuid;
  v_pct numeric;
  v_imposto_pct numeric;
  v_bruta numeric;
  v_imposto numeric;
  v_lanc_id uuid;
  v_nivel text;
  v_nome text;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM 'proposta-assinada' THEN RETURN NEW; END IF;
  -- SEM guarda de "não mudou": ela existia para poupar trabalho, mas quebrava a
  -- carga inicial — `vendas_importar_assinadas` redispara o gatilho com um
  -- UPDATE que repõe o mesmo estágio, e a guarda o descartava em silêncio. A
  -- importação contava as vendas e não criava nenhuma. Quem protege contra
  -- duplicata é a checagem de `proposta_id` logo abaixo, que é a garantia de
  -- verdade; esta aqui só escondia o caminho da carga.

  -- Proposta sem valor não vira venda: sem VGV não há comissão a calcular, e
  -- uma venda de R$ 0 na lista atrapalha a conferência. São 9 das 70 em
  -- produção, e a tela as lista à parte com o motivo.
  IF COALESCE(NEW.value, 0) <= 0 THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM vendas v WHERE v.proposta_id = NEW.id) THEN RETURN NEW; END IF;

  -- O empreendimento da proposta casa com o lançamento sem acento e sem caixa.
  SELECT l.id, l.construtora, l.construtora_id INTO v_lanc_id, v_nome, v_construtora_id
    FROM lancamentos l
   WHERE l.tenant_id = NEW.tenant_id
     AND upper(public.sem_acento(btrim(l.nome)))
       = upper(public.sem_acento(btrim(COALESCE(NEW.forecast_empreendimento, ''))))
   LIMIT 1;

  -- O VÍNCULO POR ID VEM PRIMEIRO. `lancamentos.construtora` é texto digitado,
  -- e casar por ele é frágil: o banco local tinha "Santa Ângela Incorporadora"
  -- no cadastro contra "Santa Ângela" no lançamento, e a venda nasceu com
  -- percentual zero sem ninguém entender por quê. O `construtora_id` é o que o
  -- cadastro de construtoras preencheu; o nome fica só de reserva, para o
  -- lançamento antigo que ainda não foi ligado.
  IF v_construtora_id IS NOT NULL THEN
    SELECT c.comissao_padrao_pct INTO v_pct
      FROM construtoras c WHERE c.id = v_construtora_id AND c.tenant_id = NEW.tenant_id;
  ELSE
    SELECT c.id, c.comissao_padrao_pct INTO v_construtora_id, v_pct
      FROM construtoras c
     WHERE c.tenant_id = NEW.tenant_id
       AND upper(public.sem_acento(btrim(c.nome))) = upper(public.sem_acento(btrim(COALESCE(v_nome, ''))))
     LIMIT 1;
  END IF;

  -- Sem construtora casada, o percentual nasce ZERO e a venda fica visível
  -- assim: um percentual chutado produziria uma comissão errada com cara de
  -- certa, e é ela que vira dinheiro de gente lá na frente.
  v_pct := COALESCE(v_pct, 0);

  SELECT f.imposto_pct INTO v_imposto_pct
    FROM tenant_fiscal_config f WHERE f.tenant_id = NEW.tenant_id;
  v_imposto_pct := COALESCE(v_imposto_pct, 0);

  v_bruta := round(COALESCE(NEW.value, 0) * v_pct / 100.0, 2);
  v_imposto := round(v_bruta * v_imposto_pct / 100.0, 2);

  -- O NÍVEL DO MOMENTO, congelado na venda. Promover alguém depois não mexe
  -- nesta linha — é o critério de pronto do plano.
  SELECT tm.nivel INTO v_nivel
    FROM tenant_memberships tm
   WHERE tm.tenant_id = NEW.tenant_id AND tm.user_id = NEW.agent_user_id;

  INSERT INTO vendas (
    tenant_id, proposta_id, lead_id, data_venda, empreendimento, lancamento_id,
    construtora_id, tipo, corretor_id, corretor_nome, nivel_corretor,
    vgv, comissao_pct, comissao_bruta, imposto_pct, imposto_valor, comissao_liquida,
    comissao_da_proposta, status
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.lead_id,
    COALESCE(NEW.signed_at, now())::date,
    COALESCE(NEW.forecast_empreendimento, ''), v_lanc_id,
    v_construtora_id,
    CASE WHEN v_lanc_id IS NOT NULL THEN 'lancamento' ELSE 'terceiros' END,
    NEW.agent_user_id, COALESCE(NEW.agent_name, ''), v_nivel,
    NEW.value, v_pct, v_bruta, v_imposto_pct, v_imposto, v_bruta - v_imposto,
    NULLIF(NEW.commission_total, 0), 'a_faturar'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS proposals_assinada_cria_venda ON public.proposals;
CREATE TRIGGER proposals_assinada_cria_venda
  AFTER INSERT OR UPDATE OF stage_id ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposta_assinada_cria_venda();

-- ------------------------------------------------------------
-- 8. Quem vê e quem mexe
-- ------------------------------------------------------------
REVOKE ALL ON public.vendas FROM anon, authenticated;
REVOKE ALL ON public.venda_repasses FROM anon, authenticated;
REVOKE ALL ON public.venda_historico FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vendas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_repasses TO authenticated;
GRANT SELECT ON public.venda_historico TO authenticated;
GRANT ALL ON public.vendas, public.venda_repasses, public.venda_historico TO service_role;

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_repasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_historico ENABLE ROW LEVEL SECURITY;

-- Comissão é dinheiro: só a gestão lê a conferência inteira. O corretor vê o
-- próprio repasse pela tela de comissionamento, que já existe.
DROP POLICY IF EXISTS vendas_select ON public.vendas;
CREATE POLICY vendas_select ON public.vendas
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner()
         OR corretor_id = auth.uid());

DROP POLICY IF EXISTS vendas_escrita ON public.vendas;
CREATE POLICY vendas_escrita ON public.vendas
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

DROP POLICY IF EXISTS venda_repasses_select ON public.venda_repasses;
CREATE POLICY venda_repasses_select ON public.venda_repasses
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner()
         OR membro_id = auth.uid());

DROP POLICY IF EXISTS venda_repasses_escrita ON public.venda_repasses;
CREATE POLICY venda_repasses_escrita ON public.venda_repasses
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

DROP POLICY IF EXISTS venda_historico_select ON public.venda_historico;
CREATE POLICY venda_historico_select ON public.venda_historico
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id) OR public.is_platform_owner());

-- ------------------------------------------------------------
-- 9. A carga inicial
-- ------------------------------------------------------------
-- O gatilho só pega assinatura NOVA. As 70 propostas já assinadas ficariam de
-- fora, e com elas o ROI continuaria vazio — que é o que este item veio
-- destravar.
--
-- Função, e não um INSERT solto na migration: assim a tela mostra o que
-- aconteceu, dá para rodar de novo sem duplicar, e o que ficou de fora vem com
-- o motivo em vez de sumir em silêncio.
CREATE OR REPLACE FUNCTION public.vendas_importar_assinadas(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_criadas int := 0;
  v_ja_tinham int;
  v_de_fora jsonb;
  p record;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- Importar venda é decisão de gestão: cria dinheiro a conferir.
  IF NOT (public.is_tenant_admin_or_owner(p_tenant_id) OR public.is_platform_owner()) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_ja_tinham
    FROM proposals pr
   WHERE pr.tenant_id = p_tenant_id AND pr.stage_id = 'proposta-assinada'
     AND EXISTS (SELECT 1 FROM vendas v WHERE v.proposta_id = pr.id);

  -- Um UPDATE no-op faz o gatilho da seção 7 rodar, em vez de repetir aqui a
  -- regra de criar a venda. Duas implementações da mesma criação divergiriam
  -- na primeira correção — e a carga inicial é justamente quando isso não
  -- pode acontecer.
  FOR p IN
    SELECT pr.id FROM proposals pr
     WHERE pr.tenant_id = p_tenant_id
       AND pr.stage_id = 'proposta-assinada'
       AND COALESCE(pr.value, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM vendas v WHERE v.proposta_id = pr.id)
  LOOP
    UPDATE proposals SET stage_id = 'proposta-assinada' WHERE id = p.id;
    v_criadas := v_criadas + 1;
  END LOOP;

  -- As que ficaram de fora, com o motivo. Sem valor não há comissão a
  -- calcular, e uma venda de R$ 0 na lista atrapalha a conferência.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'proposta_id', pr.id,
           'assinada_em', pr.signed_at::date,
           'cliente', COALESCE(pr.agent_name, ''),
           'empreendimento', COALESCE(pr.forecast_empreendimento, ''),
           'motivo', 'proposta assinada sem valor — sem VGV não há comissão a calcular'
         ) ORDER BY pr.signed_at DESC), '[]'::jsonb) INTO v_de_fora
    FROM proposals pr
   WHERE pr.tenant_id = p_tenant_id AND pr.stage_id = 'proposta-assinada'
     AND COALESCE(pr.value, 0) <= 0;

  RETURN jsonb_build_object(
    'criadas', v_criadas,
    'ja_existiam', v_ja_tinham,
    'de_fora', v_de_fora
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.vendas_importar_assinadas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_importar_assinadas(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 10. A lista da conferência, com os totais
-- ------------------------------------------------------------
-- Os totais saem da MESMA consulta das linhas. É o terceiro critério de pronto
-- do plano ("totais do rodapé batem com a soma das linhas"), e duas consultas
-- com o mesmo WHERE copiado divergem na primeira correção de filtro.
CREATE OR REPLACE FUNCTION public.vendas_conferencia(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_status    text DEFAULT NULL,
  p_construtora_id uuid DEFAULT NULL,
  p_corretor_id uuid DEFAULT NULL
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
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(p_tenant_id)
  THEN
    RETURN NULL;
  END IF;

  WITH filtradas AS (
    SELECT v.*, c.nome AS construtora_nome,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id) AS repasses,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id AND r.status = 'pago') AS repasses_pagos
      FROM vendas v
      LEFT JOIN construtoras c ON c.id = v.construtora_id
     WHERE v.tenant_id = p_tenant_id
       AND v.data_venda >= v_de AND v.data_venda <= v_ate
       AND (p_status IS NULL OR p_status = '' OR v.status = p_status)
       AND (p_construtora_id IS NULL OR v.construtora_id = p_construtora_id)
       AND (p_corretor_id IS NULL OR v.corretor_id = p_corretor_id)
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'data_venda', data_venda, 'empreendimento', empreendimento,
      'construtora', construtora_nome, 'tipo', tipo,
      'corretor', corretor_nome, 'corretor_id', corretor_id, 'nivel_corretor', nivel_corretor,
      'lead_id', lead_id,
      'vgv', vgv, 'comissao_pct', comissao_pct, 'comissao_bruta', comissao_bruta,
      'imposto_pct', imposto_pct, 'imposto_valor', imposto_valor,
      'comissao_liquida', comissao_liquida, 'comissao_da_proposta', comissao_da_proposta,
      'nf_numero', nf_numero, 'nf_data', nf_data,
      'recebimento_previsto_em', recebimento_previsto_em,
      'recebido_em', recebido_em, 'valor_recebido', valor_recebido, 'diferenca', diferenca,
      'status', status, 'repasses', repasses, 'repasses_pagos', repasses_pagos
    ) ORDER BY data_venda DESC) FROM filtradas), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'vendas', count(*),
      'vgv', round(COALESCE(sum(vgv), 0), 2),
      'comissao_bruta', round(COALESCE(sum(comissao_bruta), 0), 2),
      'imposto', round(COALESCE(sum(imposto_valor), 0), 2),
      'comissao_liquida', round(COALESCE(sum(comissao_liquida), 0), 2),
      'recebido', round(COALESCE(sum(valor_recebido), 0), 2),
      'a_receber', round(COALESCE(sum(comissao_liquida) FILTER (WHERE recebido_em IS NULL), 0), 2),
      'divergentes', count(*) FILTER (WHERE status = 'divergente'),
      -- Quantas ainda não têm percentual: nasceram sem construtora casada, e
      -- a comissão delas é zero até alguém resolver.
      'sem_percentual', count(*) FILTER (WHERE comissao_pct = 0),
      'sem_repasse', count(*) FILTER (WHERE repasses = 0)
    ) FROM filtradas)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'linhas', v_linhas,
    'totais', v_totais
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.vendas_conferencia(uuid, date, date, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_conferencia(uuid, date, date, text, uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- A NOTA FISCAL DA VENDA
-- ============================================================
-- Documento financeiro: o bucket é privado e, ao contrário do de marketing,
-- só admin/gestão sobe e lê. O recorte de tenant vem do CAMINHO
-- (tenant/venda/arquivo) comparado como TEXTO — um caminho fora do formato não
-- pode derrubar a consulta inteira, que é o que um `::uuid` faria.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendas-nf',
  'vendas-nf',
  false,
  10485760, -- 10MB: NF-e em PDF não chega perto disso
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/xml', 'application/xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "vendas nf: subir" ON storage.objects;
CREATE POLICY "vendas nf: subir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendas-nf' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

DROP POLICY IF EXISTS "vendas nf: ler" ON storage.objects;
CREATE POLICY "vendas nf: ler"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendas-nf' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

DROP POLICY IF EXISTS "vendas nf: apagar" ON storage.objects;
CREATE POLICY "vendas nf: apagar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vendas-nf' AND (
      public.is_platform_owner()
      OR (storage.foldername(name))[1] IN (
        SELECT tm.tenant_id::text FROM public.tenant_memberships tm
         WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'gestao')
      )
    )
  );

-- ============================================================
-- 8. O QUE A TELA PODE ESCREVER
-- ============================================================
-- `vendas` e `venda_repasses` não têm grant para `authenticated` — quem escreve
-- é sempre uma função, com a checagem de admin dentro. Assim não existe caminho
-- em que o front mande um UPDATE que o banco não tenha conferido.
--
-- Todas as funções abaixo GRAVAM `venda_historico`: é dinheiro, e quem conferiu
-- precisa poder mostrar depois o que mudou, quando e por quem.

-- ------------------------------------------------------------
-- Nota fiscal e recebimento.
--
-- Recebe o formulário INTEIRO, e não um patch: com parâmetros opcionais não há
-- como distinguir "não mexi neste campo" de "apaguei este campo", e a primeira
-- vez que alguém limpasse o número da NF ela voltaria sozinha. A tela manda
-- todos os campos, sempre.
--
-- `comissao_pct` não está aqui de propósito: ela é travada, e mudá-la exige
-- owner e justificativa pelo gatilho da seção 5.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_atualizar(
  p_venda_id    uuid,
  p_nf_numero   text,
  p_nf_data     date,
  p_nf_arquivo  text,
  p_previsto_em date,
  p_recebido_em date,
  p_valor_recebido numeric,
  p_observacao  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes public.vendas%ROWTYPE;
  v_depois public.vendas%ROWTYPE;
BEGIN
  SELECT * INTO v_antes FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(v_antes.tenant_id) THEN
    RETURN NULL;
  END IF;

  -- Recebimento sem valor é engano de digitação, não um recebimento de zero:
  -- deixar passar marcaria a venda como recebida e ela sumiria do "a receber".
  IF p_recebido_em IS NOT NULL AND COALESCE(p_valor_recebido, 0) <= 0 THEN
    RAISE EXCEPTION 'Para marcar como recebida, informe o valor recebido.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE vendas SET
    nf_numero = NULLIF(btrim(COALESCE(p_nf_numero, '')), ''),
    nf_data = p_nf_data,
    nf_arquivo = NULLIF(btrim(COALESCE(p_nf_arquivo, '')), ''),
    recebimento_previsto_em = p_previsto_em,
    recebido_em = p_recebido_em,
    valor_recebido = p_valor_recebido,
    observacao = COALESCE(p_observacao, ''),
    -- O status segue o fato, e não o que a tela achar: tem NF, está faturada;
    -- entrou dinheiro, está recebida. O gatilho da seção 5 põe 'divergente' por
    -- cima quando o valor não bate.
    status = CASE
      WHEN p_recebido_em IS NOT NULL THEN 'recebido'
      WHEN NULLIF(btrim(COALESCE(p_nf_numero, '')), '') IS NOT NULL THEN 'faturado'
      ELSE 'a_faturar'
    END,
    atualizada_em = now()
  WHERE id = p_venda_id
  RETURNING * INTO v_depois;

  -- Uma linha por campo que REALMENTE mudou. `IS DISTINCT FROM` e não `<>`:
  -- com `<>`, preencher um campo que estava nulo não geraria linha nenhuma, e
  -- o histórico ficaria mudo justamente na primeira vez de cada coisa.
  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, por)
  SELECT p_venda_id, v_antes.tenant_id, c.campo, c.de, c.para, auth.uid()
    FROM (VALUES
      ('nf_numero', v_antes.nf_numero, v_depois.nf_numero),
      ('nf_data', v_antes.nf_data::text, v_depois.nf_data::text),
      ('nf_arquivo', v_antes.nf_arquivo, v_depois.nf_arquivo),
      ('recebimento_previsto_em', v_antes.recebimento_previsto_em::text, v_depois.recebimento_previsto_em::text),
      ('recebido_em', v_antes.recebido_em::text, v_depois.recebido_em::text),
      ('valor_recebido', v_antes.valor_recebido::text, v_depois.valor_recebido::text),
      ('status', v_antes.status, v_depois.status)
    ) AS c(campo, de, para)
   WHERE c.de IS DISTINCT FROM c.para;

  RETURN to_jsonb(v_depois);
END;
$function$;

-- ------------------------------------------------------------
-- Os repasses, calculados pelo motor de comissão do front.
--
-- POR QUE O CÁLCULO NÃO É AQUI: as Regras de Comissão Lotus v1.5 já vivem em
-- `src/features/comissionamento/commissionRules.ts`, testadas e usadas em cinco
-- telas. Reescrevê-las em PL/pgSQL criaria uma segunda fonte para a mesma regra
-- de dinheiro — e no dia em que as duas discordassem, ninguém saberia qual
-- estava certa. O banco guarda o resultado e CONFERE O FECHAMENTO.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_gravar_repasses(
  p_venda_id uuid,
  p_linhas   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venda public.vendas%ROWTYPE;
  v_soma numeric;
  v_pagos int;
BEGIN
  SELECT * INTO v_venda FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(v_venda.tenant_id) THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'Sem linhas de repasse para gravar.' USING ERRCODE = 'check_violation';
  END IF;

  -- O FECHAMENTO É CONFERIDO AQUI TAMBÉM. O motor já confere do lado do front,
  -- mas quem chama a API não é obrigado a ser a tela — e uma folha que não
  -- fecha a comissão líquida é dinheiro sumindo ou sobrando.
  SELECT sum((x->>'valor')::numeric) INTO v_soma FROM jsonb_array_elements(p_linhas) x;
  IF abs(COALESCE(v_soma, 0) - v_venda.comissao_liquida) > 0.01 THEN
    RAISE EXCEPTION 'Os repasses somam % e a comissão líquida é % — a folha não fecha.',
      round(COALESCE(v_soma, 0), 2), round(v_venda.comissao_liquida, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Recalcular apagando o que já foi PAGO reescreveria a história do caixa.
  SELECT count(*) INTO v_pagos FROM venda_repasses
   WHERE venda_id = p_venda_id AND status = 'pago';
  IF v_pagos > 0 THEN
    RAISE EXCEPTION 'Esta venda já tem % repasse(s) marcados como pagos. Desmarque antes de recalcular.', v_pagos
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM venda_repasses WHERE venda_id = p_venda_id;

  INSERT INTO venda_repasses (venda_id, tenant_id, papel, nome, nivel, pct, valor)
  SELECT p_venda_id, v_venda.tenant_id,
         x->>'papel', COALESCE(x->>'parte', ''),
         NULLIF(x->>'nivel', ''),
         (x->>'percentual')::numeric,
         (x->>'valor')::numeric
    FROM jsonb_array_elements(p_linhas) x;

  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, por)
  VALUES (p_venda_id, v_venda.tenant_id, 'repasses', NULL,
          jsonb_array_length(p_linhas) || ' linha(s), somando ' || round(v_soma, 2),
          auth.uid());

  RETURN jsonb_build_object('gravados', jsonb_array_length(p_linhas), 'soma', round(v_soma, 2));
END;
$function$;

-- ------------------------------------------------------------
-- Marcar (ou desmarcar) um repasse como pago.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_repasse_pago(
  p_repasse_id uuid,
  p_pago       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.venda_repasses%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM venda_repasses WHERE id = p_repasse_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(v_r.tenant_id) THEN
    RETURN NULL;
  END IF;

  UPDATE venda_repasses
     SET status = CASE WHEN p_pago THEN 'pago' ELSE 'a_pagar' END,
         pago_em = CASE WHEN p_pago THEN (now() AT TIME ZONE 'America/Sao_Paulo')::date ELSE NULL END
   WHERE id = p_repasse_id
  RETURNING * INTO v_r;

  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, por)
  VALUES (v_r.venda_id, v_r.tenant_id, 'repasse: ' || v_r.nome,
          CASE WHEN p_pago THEN 'a_pagar' ELSE 'pago' END,
          CASE WHEN p_pago THEN 'pago' ELSE 'a_pagar' END,
          auth.uid());

  RETURN to_jsonb(v_r);
END;
$function$;

-- ------------------------------------------------------------
-- O detalhe que a gaveta abre: a venda, os repasses e o histórico.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_detalhe(p_venda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venda public.vendas%ROWTYPE;
BEGIN
  SELECT * INTO v_venda FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(v_venda.tenant_id) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'venda', to_jsonb(v_venda),
    'construtora', (SELECT nome FROM construtoras WHERE id = v_venda.construtora_id),
    'repasses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'papel', papel, 'parte', nome, 'nivel', nivel,
        'percentual', pct, 'valor', valor, 'status', status, 'pago_em', pago_em
      ) ORDER BY valor DESC) FROM venda_repasses WHERE venda_id = p_venda_id
    ), '[]'::jsonb),
    'historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'campo', h.campo, 'de', h.de, 'para', h.para,
        'justificativa', h.justificativa, 'em', h.em,
        'autor', COALESCE(u.email, 'sistema')
      ) ORDER BY h.em DESC)
      FROM venda_historico h
      LEFT JOIN auth.users u ON u.id = h.por
      WHERE h.venda_id = p_venda_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.venda_atualizar(uuid, text, date, text, date, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_atualizar(uuid, text, date, text, date, date, numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.venda_gravar_repasses(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_gravar_repasses(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.venda_repasse_pago(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_repasse_pago(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.venda_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_detalhe(uuid) TO authenticated, service_role;
