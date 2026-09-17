-- Testes de 20260917_leads_phone_key.sql: chave canônica do telefone do lead.
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra
-- o banco real depois da migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leads_phone_key.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.
--
-- Os MESMOS casos estão em server/utils/phone.test.js e src/lib/contato.test.ts.
-- São três cópias da regra (banco, servidor, dash) porque nenhuma consegue
-- chamar a outra; se divergirem, o lead que a tela mostra como válido é o que o
-- servidor recusa. Este arquivo é a cópia de baixo.
--
-- Fixture: tenant "Área de Teste".

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid AS tenant;

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_chave text;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Mesmo número, formatos diferentes → mesma chave (CA-01)
  -- ------------------------------------------------------------------
  PERFORM pg_temp.checa(
    (SELECT count(DISTINCT public.lead_phone_key(v)) = 1
       FROM unnest(ARRAY['(19) 99999-9999', '19999999999', '+5519999999999',
                         '+55 19 99999-9999', '55 19 99999-9999']) v),
    'formatos do mesmo número deveriam dar uma chave só');

  PERFORM pg_temp.checa(
    public.lead_phone_key('+55 19 99999-9999') = '5519999999999',
    'chave canônica deveria ser 55 + DDD + número');

  -- Celular sem o 9º dígito é o MESMO número (é como o wa_id chega da Lia —
  -- foi assim que nasceram as fichas repetidas de 12/09).
  PERFORM pg_temp.checa(
    public.lead_phone_key('+559184643261') = public.lead_phone_key('+5591984643261'),
    'celular com e sem o 9º dígito deveriam ser o mesmo lead');

  -- '+' colado no DDD (Santa Ângela) é o mesmo número que o E.164 completo.
  PERFORM pg_temp.checa(
    public.lead_phone_key('+19987654321') = public.lead_phone_key('+5519987654321'),
    'DDD com + deveria casar com o número completo');

  -- ------------------------------------------------------------------
  -- 2. O que NÃO pode virar chave (CA-03/CA-10)
  -- ------------------------------------------------------------------
  PERFORM pg_temp.checa(public.lead_phone_key('+5519') IS NULL,
    'telefone incompleto não pode ter chave');
  PERFORM pg_temp.checa(public.lead_phone_key('+55129999999999') IS NULL,
    'telefone com dígito a mais não pode ter chave');
  PERFORM pg_temp.checa(public.lead_phone_key('+5520987654321') IS NULL,
    'DDD que não existe não pode ter chave');
  PERFORM pg_temp.checa(public.lead_phone_key('') IS NULL AND public.lead_phone_key(NULL) IS NULL,
    'vazio não pode ter chave');

  -- Dois leads incompletos NÃO podem ser agrupados pela chave.
  PERFORM pg_temp.checa(
    public.lead_phone_key('+5519') IS NULL AND public.lead_phone_key('+5511') IS NULL,
    'telefones incompletos diferentes não podem cair na mesma chave');

  -- ------------------------------------------------------------------
  -- 3. Conservadorismo: não inventar dígito
  -- ------------------------------------------------------------------
  PERFORM pg_temp.checa(public.lead_phone_key('1133334444') = '551133334444',
    'fixo NÃO pode ganhar o 9º dígito');
  PERFORM pg_temp.checa(public.lead_phone_key('+556298765432') = '5562998765432',
    'celular de 8 dígitos ganha o 9 (faixa de celular da Anatel)');
  PERFORM pg_temp.checa(public.lead_phone_key('351912345678') = '351912345678',
    'número de outro país vale como identificador, sem virar brasileiro');

  -- ------------------------------------------------------------------
  -- 4. A coluna é derivada e acompanha o phone
  -- ------------------------------------------------------------------
  INSERT INTO public.leads (tenant_id, name, phone, source, status)
  SELECT tenant, 'E2E dedup A', '(19) 99999-0001', 'Manual', 'Novos Leads' FROM fx
  RETURNING id INTO v_a;

  SELECT phone_key INTO v_chave FROM public.leads WHERE id = v_a;
  PERFORM pg_temp.checa(v_chave = '5519999990001',
    'phone_key deveria ser calculada no INSERT');

  UPDATE public.leads SET phone = '+55 19 99999-0002' WHERE id = v_a;
  SELECT phone_key INTO v_chave FROM public.leads WHERE id = v_a;
  PERFORM pg_temp.checa(v_chave = '5519999990002',
    'phone_key deveria acompanhar o UPDATE do phone');

  -- O valor original continua como a origem mandou: a chave compara, o phone
  -- guarda o que chegou (auditoria).
  PERFORM pg_temp.checa(
    (SELECT phone FROM public.leads WHERE id = v_a) = '+55 19 99999-0002',
    'phone não pode ser reescrito pela normalização');

  -- Outra ficha, mesmo número em outro formato: é assim que a dash e o
  -- servidor encontram a duplicidade que a constraint de string não vê.
  INSERT INTO public.leads (tenant_id, name, phone, source, status)
  SELECT tenant, 'E2E dedup B', '19999990002', 'ZAP Imóveis', 'Novos Leads' FROM fx
  RETURNING id INTO v_b;

  PERFORM pg_temp.checa(
    (SELECT count(*) FROM public.leads WHERE id IN (v_a, v_b) GROUP BY phone_key HAVING count(*) = 2) = 2,
    'as duas fichas deveriam cair na mesma phone_key');

  RAISE NOTICE 'OK — lead_phone_key: 15 casos';
END $$;

ROLLBACK;
