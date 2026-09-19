-- Testes de 20260918_seed_construtoras.sql — o de-para fechado com o chefe.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seed_construtoras.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.
--
-- Reproduz os 19 textos de construtora medidos em produção em 18/09/2026 mais
-- os 2 que só existiam na planilha, roda a MESMA lógica da migration e confere
-- o agrupamento. Tudo dentro de BEGIN/ROLLBACK.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

INSERT INTO public.tenants (id, code, name)
VALUES ('5eed0000-0000-4000-a000-00000000000a', 'teste-seed-constr', 'Teste Seed Construtoras');

-- Os textos exatos de produção, com a distribuição real entre as duas tabelas.
INSERT INTO public.lancamentos (tenant_id, nome, construtora) VALUES
  ('5eed0000-0000-4000-a000-00000000000a', 'L01', 'Santa Ângela'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L02', 'Mac Lucer'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L03', 'Tebas'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L04', 'Applausi'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L05', 'FA Oliva'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L06', 'Diretiva'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L07', 'Inkkorp'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L08', 'Auten'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L09', 'Sebel Empreendimentos'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L10', 'REM'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L11', 'VVC Construtora'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L12', 'Manduca Empreendimentos'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L13', 'Zarin'),
  ('5eed0000-0000-4000-a000-00000000000a', 'L14', 'GP Desenvolvimento Urbano'),
  -- Sem construtora: existem 2 assim em produção.
  ('5eed0000-0000-4000-a000-00000000000a', 'L15', NULL);

INSERT INTO public.condominios (tenant_id, nome, construtora) VALUES
  ('5eed0000-0000-4000-a000-00000000000a', 'C01', 'Santa  Angela'),   -- dois espaços, sem acento
  ('5eed0000-0000-4000-a000-00000000000a', 'C02', 'F A Oliva'),       -- espaço no meio da sigla
  ('5eed0000-0000-4000-a000-00000000000a', 'C03', 'Tecnisa'),
  ('5eed0000-0000-4000-a000-00000000000a', 'C04', 'Ezetec'),
  ('5eed0000-0000-4000-a000-00000000000a', 'C05', 'ARACATU EMPREENDIMENTOS IMOBILIÁRIOS'),
  ('5eed0000-0000-4000-a000-00000000000a', 'C06', 'Tebas'),
  ('5eed0000-0000-4000-a000-00000000000a', 'C07', NULL);

-- ============================================================
-- A MESMA lógica da migration. Manter em sincronia: se o de-para mudar lá,
-- muda aqui e o teste acusa a divergência de contagem.
-- ============================================================
CREATE TEMP TABLE de_para (texto text PRIMARY KEY, codigo text, nome text) ON COMMIT DROP;
INSERT INTO de_para (texto, codigo, nome) VALUES
  ('Santa Ângela','santa_angela','Santa Ângela'),
  ('Santa  Angela','santa_angela','Santa Ângela'),
  ('SANTA ANGELA','santa_angela','Santa Ângela'),
  ('Mac Lucer','mac_lucer','Mac Lucer'),
  ('MAC LUCER','mac_lucer','Mac Lucer'),
  ('Tebas','tebas','Tebas'),
  ('tebas','tebas','Tebas'),
  ('Applausi','applausi','Applausi'),
  ('APLAUSI','applausi','Applausi'),
  ('FA Oliva','fa_oliva','FA Oliva'),
  ('F A Oliva','fa_oliva','FA Oliva'),
  ('Diretiva','diretiva','Diretiva'),
  ('Inkkorp','inkkorp','Inkkorp'),
  ('Auten','auten','Auten'),
  ('AUTEN','auten','Auten'),
  ('Sebel Empreendimentos','sebel','Sebel Empreendimentos'),
  ('Sebel','sebel','Sebel Empreendimentos'),
  ('SEBEL EMPREENDIMENTOS','sebel','Sebel Empreendimentos'),
  ('Tecnisa','tecnisa','Tecnisa'),
  ('REM','rem','REM'),
  ('REM Construtora e Incorporadora','rem','REM'),
  ('VVC Construtora','vvc','VVC Construtora'),
  ('VVC','vvc','VVC Construtora'),
  ('Manduca Empreendimentos','manduca','Manduca Empreendimentos'),
  ('Manducca','manduca','Manduca Empreendimentos'),
  ('Zarin','zarin','Zarin'),
  ('GRUPO ZARIN','zarin','Zarin'),
  ('GP Desenvolvimento Urbano','gp_desenvolvimento','GP Desenvolvimento Urbano'),
  ('Ezetec','ezetec','Ezetec'),
  ('ARACATU EMPREENDIMENTOS IMOBILIÁRIOS','aracatu','ARACATU Empreendimentos Imobiliários'),
  ('VIC Engenharia','vic_engenharia','VIC Engenharia'),
  ('Emccamp','emccamp','Emccamp');

WITH usados AS (
  SELECT l.tenant_id, public.normalizar_texto(l.construtora) AS chave
    FROM public.lancamentos l WHERE l.construtora IS NOT NULL
  UNION
  SELECT c.tenant_id, public.normalizar_texto(c.construtora)
    FROM public.condominios c WHERE c.construtora IS NOT NULL
),
so_na_planilha AS (
  SELECT DISTINCT l.tenant_id, public.normalizar_texto(d.texto) AS chave
    FROM public.lancamentos l CROSS JOIN de_para d
   WHERE d.codigo IN ('vic_engenharia', 'emccamp')
),
alvos AS (SELECT * FROM usados UNION SELECT * FROM so_na_planilha)
INSERT INTO public.construtoras (tenant_id, codigo, nome)
SELECT DISTINCT a.tenant_id, d.codigo, d.nome
  FROM alvos a JOIN de_para d ON public.normalizar_texto(d.texto) = a.chave
ON CONFLICT (tenant_id, codigo) DO NOTHING;

UPDATE public.lancamentos l SET construtora_id = c.id
  FROM de_para d JOIN public.construtoras c ON c.codigo = d.codigo
 WHERE l.construtora IS NOT NULL AND c.tenant_id = l.tenant_id
   AND public.normalizar_texto(l.construtora) = public.normalizar_texto(d.texto);

UPDATE public.condominios co SET construtora_id = c.id
  FROM de_para d JOIN public.construtoras c ON c.codigo = d.codigo
 WHERE co.construtora IS NOT NULL AND c.tenant_id = co.tenant_id
   AND public.normalizar_texto(co.construtora) = public.normalizar_texto(d.texto);

-- ============================================================
-- O que tem de ser verdade depois
-- ============================================================
SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras WHERE tenant_id='5eed0000-0000-4000-a000-00000000000a') = 19,
  '19 construtoras: 17 vindas dos 19 textos (duas juntadas por grafia) + VIC Engenharia e Emccamp');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.lancamentos
               WHERE tenant_id='5eed0000-0000-4000-a000-00000000000a'
                 AND construtora IS NOT NULL AND construtora_id IS NULL),
  'nenhum lancamento com texto ficou sem vinculo');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.condominios
               WHERE tenant_id='5eed0000-0000-4000-a000-00000000000a'
                 AND construtora IS NOT NULL AND construtora_id IS NULL),
  'nenhum condominio com texto ficou sem vinculo');

-- O agrupamento de grafia: "Santa Ângela" e "Santa  Angela" apontam para a MESMA.
SELECT pg_temp.checa(
  (SELECT l.construtora_id FROM public.lancamentos l WHERE l.nome='L01')
  = (SELECT c.construtora_id FROM public.condominios c WHERE c.nome='C01'),
  '"Santa Ângela" e "Santa  Angela" viram a mesma construtora');

SELECT pg_temp.checa(
  (SELECT l.construtora_id FROM public.lancamentos l WHERE l.nome='L05')
  = (SELECT c.construtora_id FROM public.condominios c WHERE c.nome='C02'),
  '"FA Oliva" e "F A Oliva" viram a mesma construtora');

SELECT pg_temp.checa(
  (SELECT l.construtora_id FROM public.lancamentos l WHERE l.nome='L03')
  = (SELECT c.construtora_id FROM public.condominios c WHERE c.nome='C06'),
  'o mesmo texto em tabelas diferentes aponta para a mesma construtora');

-- Onde o banco e a planilha divergiam, vale o NOME DO BANCO (decisão do chefe).
SELECT pg_temp.checa(
  (SELECT nome FROM public.construtoras WHERE codigo='rem'
    AND tenant_id='5eed0000-0000-4000-a000-00000000000a') = 'REM',
  'o nome do banco prevalece sobre o da planilha (REM, nao "REM Construtora e Incorporadora")');

SELECT pg_temp.checa(
  (SELECT nome FROM public.construtoras WHERE codigo='applausi'
    AND tenant_id='5eed0000-0000-4000-a000-00000000000a') = 'Applausi',
  'Applausi (banco) prevalece sobre APLAUSI (planilha)');

-- As duas que só existiam na planilha entram, e sem lançamento nenhum.
SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras
    WHERE tenant_id='5eed0000-0000-4000-a000-00000000000a'
      AND codigo IN ('vic_engenharia','emccamp')) = 2,
  'VIC Engenharia e Emccamp entram mesmo sem linha no banco');

-- Lançamento sem construtora continua sem vínculo — e isso é o esperado.
SELECT pg_temp.checa(
  (SELECT construtora_id FROM public.lancamentos WHERE nome='L15') IS NULL,
  'lancamento sem construtora fica sem vinculo, nao ganha um chute');

-- A coluna de texto continua lá: o Portal público lê ela.
SELECT pg_temp.checa(
  (SELECT construtora FROM public.lancamentos WHERE nome='L01') = 'Santa Ângela',
  'o texto original fica guardado (renomeia antes de dropar)');

ROLLBACK;

\echo 'OK: seed_construtoras — 11 casos passaram.'
