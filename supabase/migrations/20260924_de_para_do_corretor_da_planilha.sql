-- ============================================================
-- De quem é cada venda da planilha — as respostas do chefe, 24/09
--
-- Ele respondeu os dez nomes órfãos, e DUAS das respostas não cabiam no
-- formato que eu tinha feito uma hora antes:
--
--   "Flávia e Humberto — conta como meia cada um (e ai precisa aparecer o nome
--    dos 2 na conferência de vendas, e somar a comissão que cada um recebeu
--    (metade), e não 2 valores cheios)"
--
--   "David é ex membro / Natalia tb ex membro / Eduardo tb ex membro"
--
-- Uma lista de apelidos POR PESSOA (`tenant_memberships.apelidos`) não diz
-- "meia venda" nem "esta pessoa saiu". O de-para é por NOME DA PLANILHA, e
-- cada nome pode apontar para nenhuma, uma ou duas pessoas, com fração.
--
-- Por isso a coluna sai e esta tabela entra. Ela nasceu hoje e não chegou a
-- produção; trocá-la agora é mais barato que conviver com duas formas de
-- responder a mesma pergunta.
--
-- ============================================================
-- O QUE FOI MEDIDO, e uma correção minha
-- ============================================================
--
-- Na primeira medição eu disse que 19 das 37 vendas casavam. Estava errado: a
-- consulta NÃO filtrava por imobiliária, e casou nomes de outras casas.
--
-- Refeito só com a Lotus: **9 vendas casam, 28 não** — R$ 10,2 milhões. A
-- diferença é "André Marcondes", com 10 vendas: existe alguém com esse nome
-- exato, mas vinculado à *imobiliaria 9*, não à Lotus.
--
-- Com as respostas do chefe, os 14 nomes da planilha ficam resolvidos: 3
-- casam pelo nome cadastrado, 5 por apelido, 1 é a venda a quatro mãos e 5
-- são ex-membros. Nenhuma venda fica sem dono — e nenhuma foi adivinhada.
-- ============================================================

BEGIN;

-- A coluna de uma hora atrás. Some, com o motivo escrito acima.
ALTER TABLE public.tenant_memberships DROP COLUMN IF EXISTS apelidos;
DROP FUNCTION IF EXISTS public.corretor_da_planilha_por_apelido(uuid, text);
DROP FUNCTION IF EXISTS public.corretores_da_planilha_sem_dono(uuid);

CREATE TABLE IF NOT EXISTS public.planilha_corretor_de_para (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- O texto como está escrito na planilha: "Gabi", "Flávia e Humberto".
  nome_na_planilha text NOT NULL,

  -- Quem é. NULO quando ninguém da casa reivindica — ex-membro, ou ainda não
  -- conciliado. Nulo é resposta, não falha.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Quanto desta venda é desta pessoa. 1 no caso comum; 0,5 quando a venda é
  -- a quatro mãos. A soma das frações de um nome tem de dar 1 — senão a
  -- comissão total cresce ou encolhe sozinha, que é o pior defeito possível
  -- num relatório que vira pagamento.
  fracao numeric(5,4) NOT NULL DEFAULT 1,

  -- 'membro' | 'ex_membro'. O ex-membro NÃO some do relatório: a venda
  -- aconteceu, e o VGV é da casa. Some o vínculo, não a história.
  situacao text NOT NULL DEFAULT 'membro',

  -- Distingue as duas linhas de uma venda dividida.
  ordem smallint NOT NULL DEFAULT 1,

  observacao text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planilha_de_para_pk PRIMARY KEY (tenant_id, nome_na_planilha, ordem),
  CONSTRAINT planilha_de_para_situacao_ck CHECK (situacao IN ('membro', 'ex_membro')),
  CONSTRAINT planilha_de_para_fracao_ck CHECK (fracao > 0 AND fracao <= 1),
  -- Membro sem pessoa apontada é um de-para pela metade: ou aponta, ou diz
  -- que saiu.
  CONSTRAINT planilha_de_para_membro_ck CHECK (situacao = 'ex_membro' OR user_id IS NOT NULL)
);

COMMENT ON TABLE public.planilha_corretor_de_para IS
  'De quem e cada nome escrito na planilha comercial. Uma linha por pessoa: duas linhas com fracao 0,5 quando a venda e a quatro maos. Ex-membro entra com user_id nulo — a venda aconteceu e o VGV e da casa.';

CREATE INDEX IF NOT EXISTS planilha_de_para_user_idx
  ON public.planilha_corretor_de_para (tenant_id, user_id);

REVOKE ALL ON public.planilha_corretor_de_para FROM anon, authenticated;
GRANT SELECT ON public.planilha_corretor_de_para TO authenticated;
GRANT ALL ON public.planilha_corretor_de_para TO service_role;

ALTER TABLE public.planilha_corretor_de_para ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planilha_de_para_select ON public.planilha_corretor_de_para;
CREATE POLICY planilha_de_para_select ON public.planilha_corretor_de_para
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- ------------------------------------------------------------
-- A soma das frações de um nome tem de fechar em 1
--
-- Gatilho, e não CHECK: a regra é sobre o CONJUNTO de linhas do nome, e um
-- CHECK só enxerga a linha. Sem isto, "Flávia e Humberto" com 0,5 e 0,6
-- entraria calado, e a comissão daquela venda cresceria 10% no relatório.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_de_para_fracao_fecha()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_nome   text := COALESCE(NEW.nome_na_planilha, OLD.nome_na_planilha);
  v_soma   numeric;
BEGIN
  SELECT COALESCE(sum(fracao), 0) INTO v_soma
    FROM public.planilha_corretor_de_para
   WHERE tenant_id = v_tenant AND nome_na_planilha = v_nome;

  -- Zero é válido: é o nome inteiro sendo apagado.
  IF v_soma <> 0 AND abs(v_soma - 1) > 0.0001 THEN
    RAISE EXCEPTION
      'As fracoes de "%" somam % — tem de somar 1. Venda dividida usa 0,5 e 0,5.', v_nome, v_soma
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_de_para_fracao_fecha ON public.planilha_corretor_de_para;
CREATE CONSTRAINT TRIGGER tr_de_para_fracao_fecha
  AFTER INSERT OR UPDATE OR DELETE ON public.planilha_corretor_de_para
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.tg_de_para_fracao_fecha();

-- ------------------------------------------------------------
-- De quem é a venda, e quanto dela
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretores_da_venda(p_tenant_id uuid, p_nome text)
RETURNS TABLE (user_id uuid, nome text, fracao numeric, situacao text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- 1. O de-para, quando alguém já respondeu por este nome.
  SELECT d.user_id,
         COALESCE(u.raw_user_meta_data ->> 'name', u.email, d.nome_na_planilha) AS nome,
         d.fracao, d.situacao
    FROM public.planilha_corretor_de_para d
    LEFT JOIN auth.users u ON u.id = d.user_id
   WHERE d.tenant_id = p_tenant_id
     AND public.normalizar_texto(d.nome_na_planilha) = public.normalizar_texto(p_nome)

  UNION ALL

  -- 2. O nome cadastrado NA CASA, quando não há de-para. O filtro por
  --    imobiliária não é opcional: sem ele, "André Marcondes" casaria com um
  --    corretor de outra casa — foi o erro da minha primeira medição.
  --
  --    O LIMIT vive DENTRO do subselect, e isso não é estilo: no Postgres um
  --    `LIMIT` depois de um `UNION ALL` corta o resultado INTEIRO. Escrito
  --    solto, ele devolvia uma pessoa só — e a venda a quatro mãos perdia a
  --    segunda metade em silêncio. O teste pegou.
  SELECT * FROM (
    SELECT tm.user_id,
           COALESCE(u.raw_user_meta_data ->> 'name', u.email) AS nome,
           1::numeric AS fracao, 'membro'::text AS situacao
      FROM public.tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = p_tenant_id
       AND public.normalizar_texto(COALESCE(u.raw_user_meta_data ->> 'name', u.email))
           = public.normalizar_texto(p_nome)
       AND NOT EXISTS (
         SELECT 1 FROM public.planilha_corretor_de_para d
          WHERE d.tenant_id = p_tenant_id
            AND public.normalizar_texto(d.nome_na_planilha) = public.normalizar_texto(p_nome))
     LIMIT 1
  ) cadastrado
$function$;

COMMENT ON FUNCTION public.corretores_da_venda(uuid, text) IS
  'Quem recebe a venda que a planilha atribui a este nome, e que fracao cada um. Vazio = ninguem reivindicou ainda. Nunca adivinha por primeiro nome: ha duas "Fernanda Souza" na base, e o P0.2 mediu o preco disso.';

-- ------------------------------------------------------------
-- O que falta conciliar, do que pesa mais para o que pesa menos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretores_da_planilha_sem_dono(p_tenant_id uuid)
RETURNS TABLE (nome text, vendas bigint, vgv numeric, comissao numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(btrim(cs.corretor_nome), '') AS nome,
         count(*) AS vendas,
         round(COALESCE(sum(cs.valor_vgv), 0), 2) AS vgv,
         round(COALESCE(sum(cs.comissao_total_venda), 0), 2) AS comissao
    FROM public.commercial_sales cs
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND public.financeiro_pode_ver(p_tenant_id)
     AND NULLIF(btrim(cs.corretor_nome), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.corretores_da_venda(p_tenant_id, cs.corretor_nome))
   GROUP BY 1
   ORDER BY 3 DESC NULLS LAST
$function$;

REVOKE ALL ON FUNCTION public.corretores_da_venda(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.corretores_da_planilha_sem_dono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corretores_da_venda(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corretores_da_planilha_sem_dono(uuid) TO authenticated, service_role;

-- ============================================================
-- AS RESPOSTAS DO CHEFE, de 24/09 — uma linha cada
--
-- Escritas pelo NOME da pessoa, e não por uuid colado à mão: um uuid numa
-- migration é impossível de conferir na revisão, e se estiver errado a venda
-- vai para a pessoa errada em silêncio. Pelo nome, quem lê vê a intenção — e
-- se não encontrar, a linha não é escrita e a tela continua pedindo.
--
-- O filtro por imobiliária está em toda busca: na Lotus há UMA Fernanda, mas
-- na base há quatro.
-- ============================================================
DO $$
DECLARE
  lotus uuid := '65c69875-dc83-4062-90f6-6f6adc30df26';
  u_fernanda uuid; u_gabriele uuid; u_flavia uuid; u_humberto uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = lotus) THEN RETURN; END IF;

  SELECT tm.user_id INTO u_fernanda FROM public.tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = lotus AND public.normalizar_texto(u.raw_user_meta_data->>'name') = 'fernanda souza' LIMIT 1;
  SELECT tm.user_id INTO u_gabriele FROM public.tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = lotus AND public.normalizar_texto(u.raw_user_meta_data->>'name') = 'gabriele favaro' LIMIT 1;
  SELECT tm.user_id INTO u_flavia FROM public.tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = lotus AND public.normalizar_texto(u.raw_user_meta_data->>'name') = 'flavia ceolin' LIMIT 1;
  SELECT tm.user_id INTO u_humberto FROM public.tenant_memberships tm JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = lotus AND public.normalizar_texto(u.raw_user_meta_data->>'name') = 'humberto martinez' LIMIT 1;

  -- "Fernanda só tem 1, unificar" — na Lotus há uma só, conferido em 24/09.
  IF u_fernanda IS NOT NULL THEN
    INSERT INTO public.planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, observacao)
    VALUES (lotus, 'Fernanda', u_fernanda, 'chefe em 24/09: "Fernanda so tem 1, unificar"')
    ON CONFLICT DO NOTHING;
  END IF;

  IF u_gabriele IS NOT NULL THEN
    INSERT INTO public.planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, observacao) VALUES
      (lotus, 'Gabi',      u_gabriele, 'chefe em 24/09'),
      (lotus, 'Gabrielle', u_gabriele, 'chefe em 24/09')
    ON CONFLICT DO NOTHING;
  END IF;

  IF u_flavia IS NOT NULL THEN
    INSERT INTO public.planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, observacao)
    VALUES (lotus, 'Flávia', u_flavia, 'chefe em 24/09') ON CONFLICT DO NOTHING;
  END IF;

  IF u_humberto IS NOT NULL THEN
    INSERT INTO public.planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, observacao)
    VALUES (lotus, 'Humberto', u_humberto, 'chefe em 24/09') ON CONFLICT DO NOTHING;
  END IF;

  -- A VENDA A QUATRO MÃOS. Duas linhas, meia para cada — e é por isso que a
  -- tela mostra os dois nomes e a metade da comissão em cada um, "e não 2
  -- valores cheios", como ele escreveu.
  IF u_flavia IS NOT NULL AND u_humberto IS NOT NULL THEN
    INSERT INTO public.planilha_corretor_de_para
      (tenant_id, nome_na_planilha, user_id, fracao, ordem, observacao) VALUES
      (lotus, 'Flávia e Humberto', u_flavia,   0.5, 1, 'chefe em 24/09: meia venda para cada'),
      (lotus, 'Flávia e Humberto', u_humberto, 0.5, 2, 'chefe em 24/09: meia venda para cada')
    ON CONFLICT DO NOTHING;
  END IF;

  -- OS EX-MEMBROS. A venda aconteceu e o VGV é da casa: eles entram com o
  -- vínculo nulo e a situação dita, para o relatório mostrar o nome em vez de
  -- perder a linha.
  INSERT INTO public.planilha_corretor_de_para
    (tenant_id, nome_na_planilha, user_id, situacao, observacao) VALUES
    (lotus, 'David Venturini', NULL, 'ex_membro', 'chefe em 24/09: "David e ex membro"'),
    (lotus, 'Nathalia Lobo',   NULL, 'ex_membro', 'chefe em 24/09: "Natalia tb ex membro"'),
    (lotus, 'Eduardo',         NULL, 'ex_membro', 'chefe em 24/09: "Eduardo tb ex membro"'),
    -- 10 vendas e R$ 1,4 milhão — o maior nome sozinho da lista. Existe uma
    -- conta com esse nome exato, mas vinculada à *imobiliaria 9*. Sem esta
    -- linha, o casamento por nome levaria a venda para um corretor de outra
    -- casa — foi exatamente o erro da minha primeira medição.
    (lotus, 'André Marcondes', NULL, 'ex_membro', 'chefe em 24/09: "nao trabalha mais com a lotus"'),
    (lotus, 'Andre',           NULL, 'ex_membro', 'chefe em 24/09: mesma pessoa, sem acento')
  ON CONFLICT DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
