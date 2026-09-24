-- ============================================================
-- As construtoras que existem hoje, e o vínculo dos lançamentos e condomínios.
--
-- O de-para abaixo foi FECHADO COM O CHEFE em 18/09/2026, depois de medir as
-- duas fontes. Não é heurística: cada linha é uma decisão tomada por quem
-- conhece as empresas.
--
--   "os seis são a mesma"  -> Applausi=APLAUSI · Manduca Empreendimentos=Manducca
--                             Zarin=GRUPO ZARIN · REM=REM Construtora e Incorporadora
--                             VVC Construtora=VVC · Sebel Empreendimentos=Sebel=SEBEL EMPREENDIMENTOS
--                             Onde as duas fontes divergem, vale o NOME DO BANCO.
--   "tudo, das duas fontes" -> entram também VIC Engenharia e Emccamp, que só
--                             existiam na planilha, e Tecnisa, Ezetec e ARACATU,
--                             que só existiam no banco (todas em condomínio).
--
-- Os agrupamentos puramente de grafia (Santa Ângela / Santa  Angela / SANTA
-- ANGELA, FA Oliva / F A Oliva, Tebas / tebas, Mac Lucer / MAC LUCER, Auten /
-- AUTEN) não precisaram de decisão: são a mesma palavra escrita diferente.
--
-- Roda em qualquer banco: o cadastro nasce para CADA imobiliária que tenha
-- lançamento ou condomínio com aquele texto. Num banco sem esses dados, não
-- cria nada — e não quebra.
-- ============================================================

BEGIN;

-- ============================================================
-- O de-para vira FUNÇÃO, e não um bloco solto de migration.
--
-- Motivo concreto: o teste em `supabase/tests/` precisa rodar esta MESMA
-- lógica contra uma imobiliária de mentira, dentro de uma transação que
-- desfaz tudo. Com o de-para preso num bloco de migration, o teste teria de
-- reescrever as 34 linhas — e aí passaria a conferir a própria cópia, que é o
-- oposto de conferir.
--
-- É a mesma decisão do simulador da distribuição, que importa a regra do
-- servidor em vez de copiá-la.
--
-- Roda em qualquer banco e quantas vezes quiser: só acrescenta e vincula,
-- nunca apaga nem renomeia.
-- ============================================================
CREATE OR REPLACE FUNCTION public.semear_construtoras()
RETURNS TABLE (construtoras_criadas bigint, lancamentos_vinculados bigint, condominios_vinculados bigint)
LANGUAGE plpgsql
AS $semear$
DECLARE
  v_criadas bigint := 0;
  v_lanc    bigint := 0;
  v_cond    bigint := 0;
BEGIN
-- texto que está gravado hoje -> (código estável, nome que vale)
CREATE TEMP TABLE IF NOT EXISTS de_para (texto text PRIMARY KEY, codigo text, nome text) ON COMMIT DROP;
DELETE FROM de_para;
INSERT INTO de_para (texto, codigo, nome) VALUES
  ('Santa Ângela',                        'santa_angela',      'Santa Ângela'),
  ('Santa  Angela',                       'santa_angela',      'Santa Ângela'),
  ('SANTA ANGELA',                        'santa_angela',      'Santa Ângela'),
  ('Mac Lucer',                           'mac_lucer',         'Mac Lucer'),
  ('MAC LUCER',                           'mac_lucer',         'Mac Lucer'),
  ('Tebas',                               'tebas',             'Tebas'),
  ('tebas',                               'tebas',             'Tebas'),
  ('Applausi',                            'applausi',          'Applausi'),
  ('APLAUSI',                             'applausi',          'Applausi'),
  ('FA Oliva',                            'fa_oliva',          'FA Oliva'),
  ('F A Oliva',                           'fa_oliva',          'FA Oliva'),
  ('Diretiva',                            'diretiva',          'Diretiva'),
  ('Inkkorp',                             'inkkorp',           'Inkkorp'),
  ('Auten',                               'auten',             'Auten'),
  ('AUTEN',                               'auten',             'Auten'),
  ('Sebel Empreendimentos',               'sebel',             'Sebel Empreendimentos'),
  ('Sebel',                               'sebel',             'Sebel Empreendimentos'),
  ('SEBEL EMPREENDIMENTOS',               'sebel',             'Sebel Empreendimentos'),
  ('Tecnisa',                             'tecnisa',           'Tecnisa'),
  ('REM',                                 'rem',               'REM'),
  ('REM Construtora e Incorporadora',     'rem',               'REM'),
  ('VVC Construtora',                     'vvc',               'VVC Construtora'),
  ('VVC',                                 'vvc',               'VVC Construtora'),
  ('Manduca Empreendimentos',             'manduca',           'Manduca Empreendimentos'),
  ('Manducca',                            'manduca',           'Manduca Empreendimentos'),
  ('Zarin',                               'zarin',             'Zarin'),
  ('GRUPO ZARIN',                         'zarin',             'Zarin'),
  ('GP Desenvolvimento Urbano',           'gp_desenvolvimento','GP Desenvolvimento Urbano'),
  ('Ezetec',                              'ezetec',            'Ezetec'),
  ('ARACATU EMPREENDIMENTOS IMOBILIÁRIOS','aracatu',           'ARACATU Empreendimentos Imobiliários'),
  -- Só existiam na planilha do Google. Entram por decisão do chefe ("tudo, das
  -- duas fontes"), para não sumirem da aba quando ela passar a ler o CRM.
  ('VIC Engenharia',                      'vic_engenharia',    'VIC Engenharia'),
  ('Emccamp',                             'emccamp',           'Emccamp'),
  -- 24/09: duas que o levantamento de 18/09 nao pegou. Estao nas DUAS fontes
  -- (1 lancamento cada em producao, 1 linha cada na planilha) e nao tem
  -- variante de grafia nenhuma — nao ha o que decidir, so o que cadastrar.
  -- Sem elas, 2 lancamentos ficam sem vinculo e 2 linhas da planilha ficam
  -- em "fora do cadastro" para sempre.
  ('MRV',                                 'mrv',               'MRV'),
  ('Trend Canadá',                        'trend_canada',      'Trend Canadá');

-- ------------------------------------------------------------
-- 1. Cada imobiliária ganha as construtoras que ela de fato usa.
-- ------------------------------------------------------------
WITH usados AS (
  SELECT l.tenant_id, public.normalizar_texto(l.construtora) AS chave
    FROM public.lancamentos l WHERE l.construtora IS NOT NULL
  UNION
  SELECT c.tenant_id, public.normalizar_texto(c.construtora)
    FROM public.condominios c WHERE c.construtora IS NOT NULL
),
-- As duas da planilha não têm linha no banco: vão para quem tem lançamento.
so_na_planilha AS (
  SELECT DISTINCT l.tenant_id, public.normalizar_texto(d.texto) AS chave
    FROM public.lancamentos l
   CROSS JOIN de_para d
   WHERE d.codigo IN ('vic_engenharia', 'emccamp')
),
alvos AS (SELECT * FROM usados UNION SELECT * FROM so_na_planilha)
INSERT INTO public.construtoras (tenant_id, codigo, nome)
SELECT DISTINCT a.tenant_id, d.codigo, d.nome
  FROM alvos a
  JOIN de_para d ON public.normalizar_texto(d.texto) = a.chave
ON CONFLICT (tenant_id, codigo) DO NOTHING;
GET DIAGNOSTICS v_criadas = ROW_COUNT;

-- ------------------------------------------------------------
-- 2. O vínculo. A coluna de texto FICA — o Portal público lê ela.
-- ------------------------------------------------------------
UPDATE public.lancamentos l
   SET construtora_id = c.id
  FROM de_para d
  JOIN public.construtoras c ON c.codigo = d.codigo
 WHERE l.construtora IS NOT NULL
   AND c.tenant_id = l.tenant_id
   AND public.normalizar_texto(l.construtora) = public.normalizar_texto(d.texto)
   AND l.construtora_id IS DISTINCT FROM c.id;
GET DIAGNOSTICS v_lanc = ROW_COUNT;

UPDATE public.condominios co
   SET construtora_id = c.id
  FROM de_para d
  JOIN public.construtoras c ON c.codigo = d.codigo
 WHERE co.construtora IS NOT NULL
   AND c.tenant_id = co.tenant_id
   AND public.normalizar_texto(co.construtora) = public.normalizar_texto(d.texto)
   AND co.construtora_id IS DISTINCT FROM c.id;
GET DIAGNOSTICS v_cond = ROW_COUNT;

-- ------------------------------------------------------------
-- 3. Os apelidos vao para o CADASTRO, nao ficam so aqui dentro.
--
-- Sem isto, o de-para acima resolve o BANCO e nao resolve a TELA: a aba
-- Construtoras casa as 82 linhas da planilha do Google com o cadastro, e ela
-- so enxerga o que o banco devolve. "APLAUSI" nao acharia "Applausi",
-- "GRUPO ZARIN" nao acharia "Zarin" — 12 das 82 linhas ficariam em "fora do
-- cadastro" com o cadastro inteiro certo, e pareceria defeito do cadastro.
--
-- O nome canonico NAO entra na lista: quem casa por nome ja acha por ele.
-- Aqui vao so as OUTRAS grafias.
-- ------------------------------------------------------------
-- A lista é REESCRITA, não acrescentada — e isso é decisão, não descuido.
--
-- Acrescentar parece mais seguro e é o contrário: um apelido que um dia foi
-- parar na construtora errada ficaria ali para sempre, e o efeito na tela é o
-- empreendimento aparecer sob a construtora errada, sem erro nenhum. Foi uma
-- sabotagem de 24/09 que mostrou isso — ela sujou o cadastro e a rodada limpa
-- seguinte não limpou.
--
-- Por isso o LEFT JOIN: quem está no de-para e não tem apelido volta para a
-- lista vazia. O de-para é a única fonte destes textos; não há edição à mão
-- para preservar.
UPDATE public.construtoras c
   SET aliases = COALESCE(sub.apelidos, '{}')
  FROM (
    SELECT dd.codigo,
           (SELECT array_agg(DISTINCT d.texto ORDER BY d.texto)
              FROM de_para d
             WHERE d.codigo = dd.codigo
               AND public.normalizar_texto(d.texto) IS DISTINCT FROM public.normalizar_texto(d.nome)
           ) AS apelidos
      FROM (SELECT DISTINCT codigo FROM de_para) dd
  ) sub
 WHERE c.codigo = sub.codigo
   AND c.aliases IS DISTINCT FROM COALESCE(sub.apelidos, '{}');

  RETURN QUERY SELECT v_criadas, v_lanc, v_cond;
END;
$semear$;

COMMENT ON FUNCTION public.semear_construtoras() IS
  'Cadastra as construtoras que cada imobiliaria de fato usa, vincula lancamentos e condominios, e grava os apelidos que a TELA precisa para casar a planilha. So acrescenta: roda quantas vezes quiser.';

-- Ninguem chama isto pelo navegador: e manutencao de cadastro.
REVOKE ALL ON FUNCTION public.semear_construtoras() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.semear_construtoras() TO service_role;

SELECT * FROM public.semear_construtoras();

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT (SELECT count(*) FROM public.construtoras) AS construtoras,
       (SELECT count(*) FROM public.lancamentos WHERE construtora IS NOT NULL AND construtora_id IS NULL) AS lanc_sem_vinculo,
       (SELECT count(*) FROM public.condominios WHERE construtora IS NOT NULL AND construtora_id IS NULL) AS cond_sem_vinculo;
