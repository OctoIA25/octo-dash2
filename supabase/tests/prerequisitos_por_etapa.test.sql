-- ============================================================
-- `tenant_etapa_config` — as chaves de pré-requisito (P1.6).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/prerequisitos_por_etapa.test.sql
--
-- O caso mais importante é o primeiro. O `pg_default_acl` deste Postgres
-- concede TUDO a anon em toda relação nova de public: sem o REVOKE da
-- migration, estas chaves nasceriam legíveis E GRAVÁVEIS pela chave que vai
-- dentro do bundle do navegador — qualquer visitante do site poderia afrouxar
-- o processo da imobiliária.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t uuid := '44444444-4444-4444-a444-444444444444';
  n int;
  r record;
BEGIN
  -- ----------------------------------------------------------
  -- 1. A CHAVE DO NAVEGADOR NÃO ESCREVE, E `anon` NÃO LÊ.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'tenant_etapa_config' AND grantee = 'anon';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: anon tem % privilegio(s) em tenant_etapa_config', n;
  END IF;

  SELECT count(*) INTO n
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'tenant_etapa_config'
    AND grantee = 'authenticated' AND privilege_type IN ('DELETE', 'TRUNCATE');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: authenticated pode apagar as chaves da imobiliaria';
  END IF;

  -- E a RLS tem de estar ligada: sem ela o GRANT de SELECT valeria para
  -- TODAS as imobiliárias de uma vez.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.tenant_etapa_config'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FALHOU: RLS desligada em tenant_etapa_config';
  END IF;

  -- ----------------------------------------------------------
  -- 2. TUDO NASCE DESLIGADO.
  --
  -- Uma chave que começasse ligada passaria a avisar em quase todo arrastar
  -- sem ninguém ter pedido — e o gestor descobriria pela reclamação da
  -- equipe, não por ter decidido.
  -- ----------------------------------------------------------
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-etapa', 'Teste Etapa') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_etapa_config (tenant_id) VALUES (t);

  SELECT * INTO r FROM tenant_etapa_config WHERE tenant_id = t;
  IF r.exigir_visita_agendada OR r.exigir_dados_da_proposta
     OR r.exigir_proposta_assinada OR r.registrar_hora_da_assinatura THEN
    RAISE EXCEPTION 'FALHOU: alguma chave nasce ligada';
  END IF;
  IF r.relato_minimo_caracteres <> 20 THEN
    RAISE EXCEPTION 'FALHOU: relato minimo padrao mudou (veio %)', r.relato_minimo_caracteres;
  END IF;

  -- ----------------------------------------------------------
  -- 3. UMA LINHA POR IMOBILIÁRIA.
  --
  -- Duas linhas fariam a tela ler uma e gravar na outra, e o gestor veria a
  -- chave "voltar sozinha" depois de salvar.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO tenant_etapa_config (tenant_id) VALUES (t);
    RAISE EXCEPTION 'FALHOU: aceitou duas linhas para a mesma imobiliaria';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- esperado
  END;

  -- ----------------------------------------------------------
  -- 4. O RELATO MÍNIMO TEM LIMITES.
  --
  -- Negativo viraria "exige -5 caracteres" e o número apareceria na tela;
  -- um número absurdo tornaria a etapa inalcançável de fato.
  -- ----------------------------------------------------------
  BEGIN
    UPDATE tenant_etapa_config SET relato_minimo_caracteres = -1 WHERE tenant_id = t;
    RAISE EXCEPTION 'FALHOU: aceitou relato minimo negativo';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE tenant_etapa_config SET relato_minimo_caracteres = 999999 WHERE tenant_id = t;
    RAISE EXCEPTION 'FALHOU: aceitou relato minimo absurdo';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Zero é válido: é o jeito de desligar só a exigência de relato.
  UPDATE tenant_etapa_config SET relato_minimo_caracteres = 0 WHERE tenant_id = t;

  -- ----------------------------------------------------------
  -- 5. IMOBILIÁRIA APAGADA LEVA AS CHAVES JUNTO.
  -- ----------------------------------------------------------
  DELETE FROM tenants WHERE id = t;
  SELECT count(*) INTO n FROM tenant_etapa_config WHERE tenant_id = t;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: chaves sobraram apos apagar a imobiliaria';
  END IF;

  RAISE NOTICE 'prerequisitos_por_etapa: 5 casos OK';
END $$;

ROLLBACK;
