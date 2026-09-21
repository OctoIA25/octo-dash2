-- ============================================================
-- P4.5 — Financeiro fase 1
--
-- Plano de contas, a receber, a pagar, fluxo de caixa, DRE gerencial e a
-- exportação para o contador. O balancete fica com o contador, como o plano diz.
--
-- A REGRA QUE ORGANIZA O ARQUIVO: nada aqui é digitado duas vezes. A venda do
-- P4.4 gera o "a receber", os repasses geram os "a pagar" e o imposto gera o
-- dele — tudo por gatilho. É o primeiro critério de pronto do plano: "uma venda
-- gera a receber e os repasses geram a pagar, sem digitação".
--
-- O QUE ISSO EXIGE, e que custou atenção: os dois lados se atualizam. Marcar
-- recebido na venda baixa o lançamento, e baixar o lançamento marca a venda.
-- Dois gatilhos que escrevem um no outro entram em laço infinito se escreverem
-- sempre; por isso cada lado só escreve QUANDO O VALOR MUDA (a cláusula
-- `IS DISTINCT FROM` no WHERE). Sem linha afetada não há novo disparo, e a ida
-- e volta termina em dois passos.
--
-- O laço é REAL, e foi medido: removendo as duas guardas, o teste desta fatia
-- morre com `stack depth limit exceeded`. Removendo só uma, ele passa — cada
-- guarda sozinha basta. As duas ficam de propósito, para que mexer num lado
-- não devolva o laço em silêncio pelo outro.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Plano de contas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  pai_id uuid REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  -- Conta do sistema: é para ela que os gatilhos mandam a venda, o repasse e o
  -- imposto. A casa pode renomear, mas apagar deixaria o lançamento órfão.
  papel text CHECK (papel IS NULL OR papel IN
    ('comissao_venda', 'repasse_corretor', 'imposto', 'midia')),
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plano_contas_codigo_uniq
  ON public.plano_contas (tenant_id, codigo);
-- Um papel por imobiliária: duas contas "de imposto" fariam o gatilho escolher.
CREATE UNIQUE INDEX IF NOT EXISTS plano_contas_papel_uniq
  ON public.plano_contas (tenant_id, papel) WHERE papel IS NOT NULL;

COMMENT ON COLUMN public.plano_contas.papel IS
  'Conta de destino dos lançamentos automáticos. NULL = conta comum, criada pela casa.';

-- ------------------------------------------------------------
-- 2. Contas bancárias
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  banco text NOT NULL DEFAULT '',
  saldo_inicial numeric NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contas_bancarias_idx ON public.contas_bancarias (tenant_id, ativa);

-- ------------------------------------------------------------
-- 3. Lançamentos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receber', 'pagar')),
  conta_id uuid REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0 CHECK (valor >= 0),
  -- O MÊS a que o lançamento pertence, guardado como o primeiro dia dele. O DRE
  -- é por competência, e não por caixa: a venda de setembro recebida em outubro
  -- é resultado de setembro.
  competencia date NOT NULL,
  vencimento date,
  pago_em date,
  valor_pago numeric CHECK (valor_pago IS NULL OR valor_pago >= 0),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'baixado', 'cancelado')),
  -- De onde veio. 'manual' é o único que alguém digita.
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('venda', 'repasse', 'imposto', 'midia', 'manual')),
  origem_id uuid,
  -- Equipe ou empreendimento, texto livre: o plano pede o filtro, não um
  -- cadastro. Um cadastro a mais aqui seria uma tela a mais para manter.
  centro_custo text NOT NULL DEFAULT '',
  anexo text,
  observacao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- A CHAVE QUE IMPEDE DUPLICATA. O gatilho roda em todo UPDATE da venda; sem
-- isto, cada edição criaria outro "a receber" e o DRE somaria a mesma comissão
-- várias vezes. Um lançamento automático por (origem, origem_id).
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_origem_uniq
  ON public.lancamentos_financeiros (tenant_id, origem, origem_id)
  WHERE origem <> 'manual' AND origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lancamentos_competencia_idx
  ON public.lancamentos_financeiros (tenant_id, competencia, tipo);
CREATE INDEX IF NOT EXISTS lancamentos_vencimento_idx
  ON public.lancamentos_financeiros (tenant_id, vencimento) WHERE status = 'aberto';

CREATE OR REPLACE FUNCTION public.lancamento_toca_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_lancamento_atualizado_em ON public.lancamentos_financeiros;
CREATE TRIGGER tr_lancamento_atualizado_em
  BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.lancamento_toca_atualizado_em();

-- O status segue o fato, como na conferência de vendas: tem data de baixa,
-- está baixado. Deixar alguém marcar à mão faria o "a receber" depender de
-- reparar nele.
CREATE OR REPLACE FUNCTION public.lancamento_ajusta_status()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status <> 'cancelado' THEN
    NEW.status := CASE WHEN NEW.pago_em IS NOT NULL THEN 'baixado' ELSE 'aberto' END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_lancamento_status ON public.lancamentos_financeiros;
CREATE TRIGGER tr_lancamento_status
  BEFORE INSERT OR UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.lancamento_ajusta_status();

-- ------------------------------------------------------------
-- 4. As tabelas são fechadas para o front
-- ------------------------------------------------------------
-- `pg_default_acl` desta base dá tudo ao anon em toda relação nova: sem o
-- REVOKE, quanto a imobiliária fatura sairia pela chave pública do site.
REVOKE ALL ON public.plano_contas FROM anon, authenticated;
REVOKE ALL ON public.contas_bancarias FROM anon, authenticated;
REVOKE ALL ON public.lancamentos_financeiros FROM anon, authenticated;
GRANT ALL ON public.plano_contas TO service_role;
GRANT ALL ON public.contas_bancarias TO service_role;
GRANT ALL ON public.lancamentos_financeiros TO service_role;

ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. O plano de contas padrão
-- ------------------------------------------------------------
-- Nasce pronto e editável. Começar vazio deixaria o Financeiro sem funcionar
-- até alguém montar as contas — e o primeiro lançamento automático não teria
-- para onde ir.
CREATE OR REPLACE FUNCTION public.financeiro_cria_plano_padrao(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receitas uuid;
  v_despesas uuid;
  v_criadas integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo)
  VALUES (p_tenant_id, '1', 'Receitas', 'receita')
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
  SELECT id INTO v_receitas FROM plano_contas WHERE tenant_id = p_tenant_id AND codigo = '1';

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo)
  VALUES (p_tenant_id, '2', 'Despesas', 'despesa')
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
  SELECT id INTO v_despesas FROM plano_contas WHERE tenant_id = p_tenant_id AND codigo = '2';

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo, pai_id, papel)
  VALUES
    (p_tenant_id, '1.1', 'Comissões de venda',     'receita', v_receitas, 'comissao_venda'),
    (p_tenant_id, '1.2', 'Comissões de parceria',  'receita', v_receitas, NULL),
    (p_tenant_id, '1.9', 'Outras receitas',        'receita', v_receitas, NULL),
    (p_tenant_id, '2.1', 'Repasses a corretores',  'despesa', v_despesas, 'repasse_corretor'),
    (p_tenant_id, '2.2', 'Marketing e mídia',      'despesa', v_despesas, 'midia'),
    (p_tenant_id, '2.3', 'Pessoal',                'despesa', v_despesas, NULL),
    (p_tenant_id, '2.4', 'Estrutura',              'despesa', v_despesas, NULL),
    (p_tenant_id, '2.5', 'Impostos',               'despesa', v_despesas, 'imposto'),
    (p_tenant_id, '2.6', 'Sistemas',               'despesa', v_despesas, NULL),
    (p_tenant_id, '2.9', 'Outras despesas',        'despesa', v_despesas, NULL)
  ON CONFLICT (tenant_id, codigo) DO NOTHING;

  GET DIAGNOSTICS v_criadas = ROW_COUNT;
  RETURN v_criadas;
END;
$function$;

-- A conta de um papel, criando o plano padrão na primeira vez. Assim o gatilho
-- nunca fica sem destino — e a imobiliária que nunca abriu o Financeiro ganha
-- o plano no dia em que a primeira venda é assinada.
CREATE OR REPLACE FUNCTION public.financeiro_conta_do_papel(p_tenant_id uuid, p_papel text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM plano_contas
   WHERE tenant_id = p_tenant_id AND papel = p_papel AND ativa;
  IF v_id IS NULL THEN
    PERFORM public.financeiro_cria_plano_padrao(p_tenant_id);
    SELECT id INTO v_id FROM plano_contas
     WHERE tenant_id = p_tenant_id AND papel = p_papel AND ativa;
  END IF;
  RETURN v_id;
END;
$function$;

-- ------------------------------------------------------------
-- 6. A venda gera o "a receber" e o imposto
-- ------------------------------------------------------------
-- O valor é a comissão BRUTA: é ela que a construtora deposita. O imposto é
-- despesa da casa, e vira um "a pagar" próprio — decidido com o chefe em
-- 21/09, e é o que a planilha da Lotus mostra (corretor + líder = 60% do
-- bruto, a casa fica com 40%, e é dos 40% que sai o imposto).
CREATE OR REPLACE FUNCTION public.venda_gera_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conta uuid;
  v_competencia date := date_trunc('month', NEW.data_venda)::date;
  v_descricao text;
BEGIN
  -- Venda sem comissão não tem o que lançar. Ela existe na conferência com o
  -- aviso de percentual zerado; criar um "a receber" de R$ 0 encheria o
  -- Financeiro de linha que não é dinheiro.
  --
  -- E se a comissão ZEROU depois de já ter lançamento (alguém desfez o vínculo
  -- da construtora), os automáticos vão junto: deixá-los faria o Financeiro
  -- continuar prometendo uma comissão que a conferência já não mostra.
  IF COALESCE(NEW.comissao_bruta, 0) <= 0 THEN
    DELETE FROM lancamentos_financeiros
     WHERE tenant_id = NEW.tenant_id AND origem IN ('venda', 'imposto')
       AND origem_id = NEW.id AND status <> 'baixado';
    RETURN NEW;
  END IF;

  v_descricao := 'Comissão · ' || COALESCE(NULLIF(NEW.empreendimento, ''), 'venda') ||
                 CASE WHEN COALESCE(NEW.corretor_nome, '') <> ''
                      THEN ' · ' || NEW.corretor_nome ELSE '' END;

  v_conta := public.financeiro_conta_do_papel(NEW.tenant_id, 'comissao_venda');

  INSERT INTO lancamentos_financeiros
    (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
     pago_em, valor_pago, origem, origem_id, centro_custo)
  VALUES
    (NEW.tenant_id, 'receber', v_conta, v_descricao, NEW.comissao_bruta,
     v_competencia, NEW.recebimento_previsto_em,
     NEW.recebido_em, NEW.valor_recebido, 'venda', NEW.id,
     COALESCE(NULLIF(NEW.empreendimento, ''), ''))
  ON CONFLICT (tenant_id, origem, origem_id) WHERE origem <> 'manual' AND origem_id IS NOT NULL
  DO UPDATE SET
    valor = EXCLUDED.valor,
    conta_id = COALESCE(lancamentos_financeiros.conta_id, EXCLUDED.conta_id),
    descricao = EXCLUDED.descricao,
    competencia = EXCLUDED.competencia,
    vencimento = EXCLUDED.vencimento,
    pago_em = EXCLUDED.pago_em,
    valor_pago = EXCLUDED.valor_pago,
    centro_custo = EXCLUDED.centro_custo
  -- Só escreve se algo mudou: é isto que impede o laço com o gatilho que
  -- volta do lançamento para a venda.
  WHERE lancamentos_financeiros.valor IS DISTINCT FROM EXCLUDED.valor
     OR lancamentos_financeiros.vencimento IS DISTINCT FROM EXCLUDED.vencimento
     OR lancamentos_financeiros.pago_em IS DISTINCT FROM EXCLUDED.pago_em
     OR lancamentos_financeiros.valor_pago IS DISTINCT FROM EXCLUDED.valor_pago
     OR lancamentos_financeiros.competencia IS DISTINCT FROM EXCLUDED.competencia
     OR lancamentos_financeiros.descricao IS DISTINCT FROM EXCLUDED.descricao;

  -- O imposto, quando existe.
  IF COALESCE(NEW.imposto_valor, 0) > 0 THEN
    v_conta := public.financeiro_conta_do_papel(NEW.tenant_id, 'imposto');
    INSERT INTO lancamentos_financeiros
      (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
       origem, origem_id, centro_custo)
    VALUES
      (NEW.tenant_id, 'pagar', v_conta,
       'Imposto sobre ' || v_descricao, NEW.imposto_valor,
       v_competencia, NEW.recebimento_previsto_em,
       'imposto', NEW.id, COALESCE(NULLIF(NEW.empreendimento, ''), ''))
    ON CONFLICT (tenant_id, origem, origem_id) WHERE origem <> 'manual' AND origem_id IS NOT NULL
    DO UPDATE SET
      valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao,
      competencia = EXCLUDED.competencia,
      vencimento = EXCLUDED.vencimento
    WHERE lancamentos_financeiros.valor IS DISTINCT FROM EXCLUDED.valor
       OR lancamentos_financeiros.competencia IS DISTINCT FROM EXCLUDED.competencia
       OR lancamentos_financeiros.vencimento IS DISTINCT FROM EXCLUDED.vencimento
       OR lancamentos_financeiros.descricao IS DISTINCT FROM EXCLUDED.descricao;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_venda_gera_financeiro ON public.vendas;
CREATE TRIGGER tr_venda_gera_financeiro
  AFTER INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.venda_gera_financeiro();

-- ------------------------------------------------------------
-- 7. O repasse gera o "a pagar"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repasse_gera_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conta uuid;
  v_venda public.vendas%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Recalcular a folha apaga as linhas antigas; o "a pagar" delas vai junto,
    -- senão o Financeiro ficaria devendo a quem não recebe mais.
    DELETE FROM lancamentos_financeiros
     WHERE tenant_id = OLD.tenant_id AND origem = 'repasse' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT * INTO v_venda FROM vendas WHERE id = NEW.venda_id;
  v_conta := public.financeiro_conta_do_papel(NEW.tenant_id, 'repasse_corretor');

  INSERT INTO lancamentos_financeiros
    (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
     pago_em, valor_pago, origem, origem_id, centro_custo)
  VALUES
    (NEW.tenant_id, 'pagar', v_conta,
     'Repasse · ' || COALESCE(NULLIF(NEW.nome, ''), NEW.papel) ||
       ' · ' || COALESCE(NULLIF(v_venda.empreendimento, ''), 'venda'),
     NEW.valor,
     date_trunc('month', COALESCE(v_venda.data_venda, CURRENT_DATE))::date,
     v_venda.recebimento_previsto_em,
     NEW.pago_em,
     CASE WHEN NEW.pago_em IS NOT NULL THEN NEW.valor END,
     'repasse', NEW.id, COALESCE(NULLIF(v_venda.empreendimento, ''), ''))
  ON CONFLICT (tenant_id, origem, origem_id) WHERE origem <> 'manual' AND origem_id IS NOT NULL
  DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    pago_em = EXCLUDED.pago_em,
    valor_pago = EXCLUDED.valor_pago
  WHERE lancamentos_financeiros.valor IS DISTINCT FROM EXCLUDED.valor
     OR lancamentos_financeiros.pago_em IS DISTINCT FROM EXCLUDED.pago_em
     OR lancamentos_financeiros.valor_pago IS DISTINCT FROM EXCLUDED.valor_pago
     OR lancamentos_financeiros.descricao IS DISTINCT FROM EXCLUDED.descricao;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_repasse_gera_financeiro ON public.venda_repasses;
CREATE TRIGGER tr_repasse_gera_financeiro
  AFTER INSERT OR UPDATE OR DELETE ON public.venda_repasses
  FOR EACH ROW EXECUTE FUNCTION public.repasse_gera_financeiro();

-- ------------------------------------------------------------
-- 8. E a volta: baixar o lançamento marca a origem
-- ------------------------------------------------------------
-- "Marcar recebido na venda baixa o lançamento, E VICE-VERSA", diz o plano.
-- Este é o vice-versa. O `WHERE` com `IS DISTINCT FROM` é o que faz a ida e
-- volta terminar: sem linha afetada, o gatilho do outro lado não dispara.
CREATE OR REPLACE FUNCTION public.lancamento_baixa_a_origem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origem = 'venda' AND NEW.origem_id IS NOT NULL THEN
    UPDATE vendas
       SET recebido_em = NEW.pago_em,
           valor_recebido = NEW.valor_pago
     WHERE id = NEW.origem_id
       AND (recebido_em IS DISTINCT FROM NEW.pago_em
         OR valor_recebido IS DISTINCT FROM NEW.valor_pago);

  ELSIF NEW.origem = 'repasse' AND NEW.origem_id IS NOT NULL THEN
    UPDATE venda_repasses
       SET pago_em = NEW.pago_em,
           status = CASE WHEN NEW.pago_em IS NOT NULL THEN 'pago' ELSE 'a_pagar' END
     WHERE id = NEW.origem_id
       AND pago_em IS DISTINCT FROM NEW.pago_em;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_lancamento_baixa_origem ON public.lancamentos_financeiros;
CREATE TRIGGER tr_lancamento_baixa_origem
  AFTER UPDATE OF pago_em, valor_pago ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.lancamento_baixa_a_origem();

COMMIT;

-- ============================================================
-- 9. O QUE A TELA LÊ
-- ============================================================
-- As três tabelas não têm grant para `authenticated` e estão com RLS ligada
-- sem política nenhuma: no Financeiro, TUDO passa por função. É deliberado —
-- o plano manda restringir a área a quem cuida do dinheiro, e uma política de
-- linha por tabela daria três lugares para essa regra morar.
--
-- A checagem é a mesma da conferência de vendas: dono da plataforma ou
-- admin/gestão da imobiliária.

CREATE OR REPLACE FUNCTION public.financeiro_pode_ver(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id));
$function$;

-- ------------------------------------------------------------
-- O plano de contas, em árvore
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_plano_de_contas(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_r jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'codigo', codigo, 'nome', nome, 'tipo', tipo,
           'pai_id', pai_id, 'papel', papel, 'ativa', ativa,
           'e_grupo', pai_id IS NULL
         ) ORDER BY codigo), '[]'::jsonb)
    INTO v_r
    FROM plano_contas WHERE tenant_id = p_tenant_id;

  RETURN v_r;
END;
$function$;

-- ------------------------------------------------------------
-- A lista: a receber e a pagar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_lancamentos(
  p_tenant_id     uuid,
  p_de            date DEFAULT NULL,
  p_ate           date DEFAULT NULL,
  p_tipo          text DEFAULT NULL,
  p_status        text DEFAULT NULL,
  p_conta_id      uuid DEFAULT NULL,
  p_centro_custo  text DEFAULT NULL,
  -- Por vencimento (é o que a tela de contas quer ver) ou por competência
  -- (é o que fecha com o DRE). Misturar os dois foi o que sempre confundiu
  -- quem compara o "a receber" com o resultado do mês.
  p_por           text DEFAULT 'vencimento'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_por text := CASE WHEN p_por = 'competencia' THEN 'competencia' ELSE 'vencimento' END;
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  WITH filtrados AS (
    SELECT l.*, c.codigo AS conta_codigo, c.nome AS conta_nome, c.tipo AS conta_tipo
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
     WHERE l.tenant_id = p_tenant_id
       AND l.status <> 'cancelado'
       AND CASE
             WHEN v_por = 'competencia' THEN l.competencia BETWEEN v_de AND v_ate
             -- Sem vencimento o lançamento não some da tela: ele entra pela
             -- competência. Sumir seria esconder dinheiro de quem confere.
             ELSE COALESCE(l.vencimento, l.competencia) BETWEEN v_de AND v_ate
           END
       AND (p_tipo IS NULL OR p_tipo = '' OR l.tipo = p_tipo)
       AND (p_status IS NULL OR p_status = '' OR l.status = p_status)
       AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
       AND (p_centro_custo IS NULL OR p_centro_custo = '' OR l.centro_custo = p_centro_custo)
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'tipo', tipo, 'descricao', descricao, 'valor', valor,
      'competencia', competencia, 'vencimento', vencimento,
      'pago_em', pago_em, 'valor_pago', valor_pago, 'status', status,
      'origem', origem, 'origem_id', origem_id, 'centro_custo', centro_custo,
      'anexo', anexo, 'observacao', observacao,
      'conta_id', conta_id, 'conta_codigo', conta_codigo, 'conta_nome', conta_nome,
      -- Vencido é o aberto cujo vencimento já passou. Calculado aqui para a
      -- tela não redescobrir "hoje" no fuso do navegador.
      'vencido', (status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'dias_de_atraso', CASE WHEN status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje
                             THEN (v_hoje - vencimento) END
    ) ORDER BY COALESCE(vencimento, competencia), valor DESC) FROM filtrados), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'lancamentos', count(*),
      'a_receber', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'receber' AND status = 'aberto'), 0), 2),
      'a_pagar', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'pagar' AND status = 'aberto'), 0), 2),
      'recebido', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'receber' AND status = 'baixado'), 0), 2),
      'pago', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'pagar' AND status = 'baixado'), 0), 2),
      'vencidos', count(*) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'valor_vencido', round(COALESCE(sum(valor) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje), 0), 2),
      -- Quantos ainda não têm conta do plano. Um lançamento sem conta some do
      -- DRE, e o DRE deixaria de fechar sem dizer por quê.
      'sem_conta', count(*) FILTER (WHERE conta_id IS NULL)
    ) FROM filtrados)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'por', v_por,
    'linhas', v_linhas, 'totais', v_totais
  );
END;
$function$;

-- ------------------------------------------------------------
-- O DRE gerencial
-- ------------------------------------------------------------
-- Por COMPETÊNCIA, agrupado pelo plano de contas. As linhas e o total saem da
-- mesma consulta: é o segundo critério de pronto do plano ("o DRE do mês fecha
-- com a soma dos lançamentos"), e duas consultas poderiam discordar entre si.
CREATE OR REPLACE FUNCTION public.financeiro_dre(
  p_tenant_id    uuid,
  p_de           date DEFAULT NULL,
  p_ate          date DEFAULT NULL,
  p_centro_custo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  WITH base AS (
    SELECT l.tipo, l.valor, l.conta_id,
           COALESCE(c.codigo, '(sem conta)') AS codigo,
           COALESCE(c.nome, 'Sem conta no plano') AS nome,
           COALESCE(c.tipo, CASE WHEN l.tipo = 'receber' THEN 'receita' ELSE 'despesa' END) AS conta_tipo
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
     WHERE l.tenant_id = p_tenant_id
       AND l.status <> 'cancelado'
       AND l.competencia BETWEEN v_de AND v_ate
       AND (p_centro_custo IS NULL OR p_centro_custo = '' OR l.centro_custo = p_centro_custo)
  ),
  por_conta AS (
    SELECT codigo, nome, conta_tipo, count(*) AS lancamentos, round(sum(valor), 2) AS total
      FROM base GROUP BY codigo, nome, conta_tipo
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'codigo', codigo, 'nome', nome, 'tipo', conta_tipo,
      'lancamentos', lancamentos, 'total', total
    ) ORDER BY conta_tipo DESC, codigo) FROM por_conta), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'receitas', round(COALESCE(sum(total) FILTER (WHERE conta_tipo = 'receita'), 0), 2),
      'despesas', round(COALESCE(sum(total) FILTER (WHERE conta_tipo = 'despesa'), 0), 2),
      'resultado', round(COALESCE(sum(total) FILTER (WHERE conta_tipo = 'receita'), 0)
                       - COALESCE(sum(total) FILTER (WHERE conta_tipo = 'despesa'), 0), 2),
      'lancamentos', COALESCE(sum(lancamentos), 0),
      'sem_conta', COALESCE(sum(lancamentos) FILTER (WHERE codigo = '(sem conta)'), 0)
    ) FROM por_conta)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object('de', v_de, 'ate', v_ate, 'linhas', v_linhas, 'totais', v_totais);
END;
$function$;

-- ------------------------------------------------------------
-- O fluxo de caixa
-- ------------------------------------------------------------
-- PREVISTO pelo vencimento, REALIZADO pela baixa. O saldo acumula a partir do
-- saldo inicial das contas bancárias — sem ele, o gráfico começaria do zero e
-- diria que a casa está quebrada no dia 1.
CREATE OR REPLACE FUNCTION public.financeiro_fluxo_de_caixa(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_gran      text DEFAULT 'dia'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_gran text := CASE WHEN p_gran IN ('dia', 'semana', 'mes') THEN p_gran ELSE 'dia' END;
  v_unidade text := CASE v_gran WHEN 'semana' THEN 'week' WHEN 'mes' THEN 'month' ELSE 'day' END;
  v_saldo_inicial numeric;
  v_linhas jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(saldo_inicial), 0) INTO v_saldo_inicial
    FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa;

  -- O que já foi baixado ANTES do recorte também entrou no caixa: sem somar
  -- isto, o saldo do período começaria ignorando o histórico.
  SELECT v_saldo_inicial
       + COALESCE(sum(CASE WHEN tipo = 'receber' THEN COALESCE(valor_pago, valor)
                           ELSE -COALESCE(valor_pago, valor) END), 0)
    INTO v_saldo_inicial
    FROM lancamentos_financeiros
   WHERE tenant_id = p_tenant_id AND status = 'baixado' AND pago_em < v_de;

  WITH balde AS (
    SELECT date_trunc(v_unidade, d)::date AS quando
      FROM generate_series(v_de, v_ate, CASE v_gran
             WHEN 'mes' THEN interval '1 month'
             WHEN 'semana' THEN interval '1 week'
             ELSE interval '1 day' END) d
    GROUP BY 1
  ),
  mov AS (
    SELECT date_trunc(v_unidade, COALESCE(vencimento, competencia))::date AS quando_prev,
           date_trunc(v_unidade, pago_em)::date AS quando_real,
           tipo, valor, COALESCE(valor_pago, valor) AS pago, status
      FROM lancamentos_financeiros
     WHERE tenant_id = p_tenant_id AND status <> 'cancelado'
  ),
  serie AS (
    SELECT b.quando,
      round(COALESCE((SELECT sum(valor) FROM mov m
        WHERE m.quando_prev = b.quando AND m.tipo = 'receber'), 0), 2) AS previsto_entrada,
      round(COALESCE((SELECT sum(valor) FROM mov m
        WHERE m.quando_prev = b.quando AND m.tipo = 'pagar'), 0), 2) AS previsto_saida,
      round(COALESCE((SELECT sum(pago) FROM mov m
        WHERE m.quando_real = b.quando AND m.tipo = 'receber' AND m.status = 'baixado'), 0), 2) AS entrada,
      round(COALESCE((SELECT sum(pago) FROM mov m
        WHERE m.quando_real = b.quando AND m.tipo = 'pagar' AND m.status = 'baixado'), 0), 2) AS saida
    FROM balde b
  ),
  -- O saldo acumulado sai num passo próprio: uma janela não pode morar dentro
  -- de uma agregação, e juntar os dois numa linha só custou uma execução.
  com_saldo AS (
    SELECT *, v_saldo_inicial + sum(entrada - saida) OVER (ORDER BY quando) AS saldo
      FROM serie
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'quando', quando,
           'previsto_entrada', previsto_entrada,
           'previsto_saida', previsto_saida,
           'entrada', entrada,
           'saida', saida,
           'previsto_liquido', previsto_entrada - previsto_saida,
           'realizado_liquido', entrada - saida,
           'saldo', round(saldo, 2)
         ) ORDER BY quando), '[]'::jsonb)
    INTO v_linhas
    FROM com_saldo;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'granularidade', v_gran,
    'saldo_inicial', round(v_saldo_inicial, 2),
    'linhas', v_linhas
  );
END;
$function$;

-- ------------------------------------------------------------
-- A exportação para o contador
-- ------------------------------------------------------------
-- Devolve as linhas achatadas, com TODAS as colunas. O arquivo é montado no
-- front, que é onde o navegador consegue baixá-lo — aqui fica só a consulta,
-- para a exportação e a tela nunca discordarem sobre o que é o mês.
CREATE OR REPLACE FUNCTION public.financeiro_exportacao(
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
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'linhas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'competencia', l.competencia,
        'tipo', CASE WHEN l.tipo = 'receber' THEN 'Receber' ELSE 'Pagar' END,
        'conta_codigo', COALESCE(c.codigo, ''),
        'conta_nome', COALESCE(c.nome, ''),
        'descricao', l.descricao,
        'centro_custo', l.centro_custo,
        'valor', l.valor,
        'vencimento', l.vencimento,
        'pago_em', l.pago_em,
        'valor_pago', l.valor_pago,
        'status', l.status,
        'origem', l.origem,
        'anexo', COALESCE(l.anexo, ''),
        'observacao', l.observacao
      ) ORDER BY l.competencia, l.tipo, COALESCE(c.codigo, ''), l.descricao)
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
     WHERE l.tenant_id = p_tenant_id AND l.competencia BETWEEN v_de AND v_ate
    ), '[]'::jsonb)
  );
END;
$function$;

-- ------------------------------------------------------------
-- As escritas
-- ------------------------------------------------------------
-- Só o lançamento MANUAL pode ser criado e editado à mão. Os automáticos
-- pertencem à venda e ao repasse: editá-los aqui faria o Financeiro discordar
-- da conferência de vendas na primeira conferência.
CREATE OR REPLACE FUNCTION public.financeiro_lancar(
  p_tenant_id    uuid,
  p_tipo         text,
  p_conta_id     uuid,
  p_descricao    text,
  p_valor        numeric,
  p_competencia  date,
  p_vencimento   date DEFAULT NULL,
  p_centro_custo text DEFAULT '',
  p_observacao   text DEFAULT '',
  p_anexo        text DEFAULT NULL,
  -- Repete o lançamento nos N meses seguintes, mesmo dia. O plano pede
  -- recorrência mensal para as contas da casa (aluguel, sistemas).
  p_repetir_meses integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_criados integer := 0;
  i integer;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF p_tipo NOT IN ('receber', 'pagar') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_valor, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a competência do lançamento.' USING ERRCODE = 'check_violation';
  END IF;

  FOR i IN 0 .. GREATEST(COALESCE(p_repetir_meses, 0), 0) LOOP
    INSERT INTO lancamentos_financeiros
      (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
       origem, centro_custo, observacao, anexo)
    VALUES
      (p_tenant_id, p_tipo, p_conta_id, COALESCE(p_descricao, ''), p_valor,
       (date_trunc('month', p_competencia) + (i || ' months')::interval)::date,
       CASE WHEN p_vencimento IS NULL THEN NULL
            ELSE (p_vencimento + (i || ' months')::interval)::date END,
       'manual', COALESCE(p_centro_custo, ''), COALESCE(p_observacao, ''), p_anexo)
    RETURNING id INTO v_id;
    v_criados := v_criados + 1;
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'criados', v_criados);
END;
$function$;

-- Baixar (ou desfazer a baixa) de qualquer lançamento, automático inclusive:
-- é a baixa que o plano manda refletir na venda e no repasse.
CREATE OR REPLACE FUNCTION public.financeiro_baixar(
  p_lancamento_id uuid,
  p_pago_em       date,
  p_valor_pago    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.lancamentos_financeiros%ROWTYPE;
BEGIN
  SELECT * INTO v_l FROM lancamentos_financeiros WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.financeiro_pode_ver(v_l.tenant_id) THEN RETURN NULL; END IF;

  IF p_pago_em IS NOT NULL AND COALESCE(p_valor_pago, v_l.valor) <= 0 THEN
    RAISE EXCEPTION 'Para baixar, informe um valor maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE lancamentos_financeiros
     SET pago_em = p_pago_em,
         valor_pago = CASE WHEN p_pago_em IS NULL THEN NULL
                           ELSE COALESCE(p_valor_pago, valor) END
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  RETURN to_jsonb(v_l);
END;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_cancelar(p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.lancamentos_financeiros%ROWTYPE;
BEGIN
  SELECT * INTO v_l FROM lancamentos_financeiros WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.financeiro_pode_ver(v_l.tenant_id) THEN RETURN NULL; END IF;

  -- Só o manual se cancela. O automático some quando a venda ou o repasse que
  -- o criou deixa de existir — cancelá-lo aqui deixaria o Financeiro dizendo
  -- que a casa não tem a receber uma comissão que a conferência mostra.
  IF v_l.origem <> 'manual' THEN
    RAISE EXCEPTION 'Este lançamento veio de %, e some junto com a origem. Cancele pela conferência de vendas.', v_l.origem
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE lancamentos_financeiros SET status = 'cancelado', pago_em = NULL, valor_pago = NULL
   WHERE id = p_lancamento_id RETURNING * INTO v_l;
  RETURN to_jsonb(v_l);
END;
$function$;

-- Contas bancárias: o saldo inicial que faz o fluxo de caixa começar do lugar certo.
CREATE OR REPLACE FUNCTION public.financeiro_conta_bancaria(
  p_tenant_id     uuid,
  p_nome          text,
  p_banco         text DEFAULT '',
  p_saldo_inicial numeric DEFAULT 0,
  p_id            uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_c public.contas_bancarias%ROWTYPE;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'A conta precisa de um nome.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO contas_bancarias (tenant_id, nome, banco, saldo_inicial)
    VALUES (p_tenant_id, btrim(p_nome), COALESCE(p_banco, ''), COALESCE(p_saldo_inicial, 0))
    RETURNING * INTO v_c;
  ELSE
    UPDATE contas_bancarias
       SET nome = btrim(p_nome), banco = COALESCE(p_banco, ''),
           saldo_inicial = COALESCE(p_saldo_inicial, 0)
     WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_c;
  END IF;

  RETURN to_jsonb(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_contas_bancarias(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome, 'banco', banco, 'saldo_inicial', saldo_inicial, 'ativa', ativa
    ) ORDER BY nome) FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.financeiro_pode_ver(uuid)',
    'public.financeiro_plano_de_contas(uuid)',
    'public.financeiro_cria_plano_padrao(uuid)',
    'public.financeiro_conta_do_papel(uuid, text)',
    'public.financeiro_lancamentos(uuid, date, date, text, text, uuid, text, text)',
    'public.financeiro_dre(uuid, date, date, text)',
    'public.financeiro_fluxo_de_caixa(uuid, date, date, text)',
    'public.financeiro_exportacao(uuid, date, date)',
    'public.financeiro_lancar(uuid, text, uuid, text, numeric, date, date, text, text, text, integer)',
    'public.financeiro_baixar(uuid, date, numeric)',
    'public.financeiro_cancelar(uuid)',
    'public.financeiro_conta_bancaria(uuid, text, text, numeric, uuid)',
    'public.financeiro_contas_bancarias(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;
