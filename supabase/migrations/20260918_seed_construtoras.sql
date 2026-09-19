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

-- texto que está gravado hoje -> (código estável, nome que vale)
CREATE TEMP TABLE de_para (texto text PRIMARY KEY, codigo text, nome text) ON COMMIT DROP;
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
  ('Emccamp',                             'emccamp',           'Emccamp');

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

UPDATE public.condominios co
   SET construtora_id = c.id
  FROM de_para d
  JOIN public.construtoras c ON c.codigo = d.codigo
 WHERE co.construtora IS NOT NULL
   AND c.tenant_id = co.tenant_id
   AND public.normalizar_texto(co.construtora) = public.normalizar_texto(d.texto)
   AND co.construtora_id IS DISTINCT FROM c.id;

COMMIT;

SELECT (SELECT count(*) FROM public.construtoras) AS construtoras,
       (SELECT count(*) FROM public.lancamentos WHERE construtora IS NOT NULL AND construtora_id IS NULL) AS lanc_sem_vinculo,
       (SELECT count(*) FROM public.condominios WHERE construtora IS NOT NULL AND construtora_id IS NULL) AS cond_sem_vinculo;
