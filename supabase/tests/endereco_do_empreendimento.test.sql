-- ============================================================
-- Endereço do empreendimento (20261019_endereco_do_empreendimento.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/endereco_do_empreendimento.test.sql
--
-- Roda numa transação e DESFAZ tudo. Sucesso = um NOTICE "OK" por bloco.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

INSERT INTO tenants (id, code, name)
VALUES ('7e1a0000-0000-4000-a000-000000000001', 'teste-emp', 'Teste Empreendimento');

INSERT INTO lancamentos (id, tenant_id, nome, endereco_plantao, endereco_empreendimento, bairro, cidade) VALUES
  ('7e1b0000-0000-4000-a000-000000000001', '7e1a0000-0000-4000-a000-000000000001', 'Com os dois',
   'Av. do Estande, 10', 'Rua do Prédio, 250', 'Centro', 'Jundiaí'),
  ('7e1b0000-0000-4000-a000-000000000002', '7e1a0000-0000-4000-a000-000000000001', 'Só plantão',
   'Av. do Estande, 10', '  ', 'Centro', 'Jundiaí');

-- 1. A fila de geocodificação usa o empreendimento; sem ele, o plantão.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(endereco, ' | ' ORDER BY endereco) INTO v
    FROM public.mapa_fila_de_geocodificacao('7e1a0000-0000-4000-a000-000000000001', 10, true);
  PERFORM pg_temp.checa(
    v IS NOT DISTINCT FROM 'Av. do Estande, 10, Centro, Jundiaí, Brasil | Rua do Prédio, 250, Centro, Jundiaí, Brasil',
    format('fila: empreendimento primeiro, plantão de reserva (veio %s)', v));
  RAISE NOTICE 'OK 1: fila usa o empreendimento, e o plantão quando ele falta';
END $$;

-- 2. O mapa (contagem "sem endereço") enxerga o mesmo endereço.
DO $$
DECLARE v jsonb;
BEGIN
  v := public.mapa_pontos('7e1a0000-0000-4000-a000-000000000001');
  PERFORM pg_temp.checa((v -> 'totais' -> 'lancamentos' ->> 'sem_endereco') IS NOT DISTINCT FROM '0',
    format('nenhum lançamento sem endereço (veio %s)', v -> 'totais' -> 'lancamentos'));
  RAISE NOTICE 'OK 2: mapa_pontos conta os dois como com endereço';
END $$;

-- 3. As permissões das funções sobreviveram ao CREATE OR REPLACE.
DO $$
BEGIN
  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.mapa_pontos(uuid)', 'EXECUTE'), 'anon não chama mapa_pontos');
  PERFORM pg_temp.checa(NOT has_function_privilege('authenticated', 'public.mapa_fila_de_geocodificacao(uuid,int,boolean)', 'EXECUTE'),
    'só o servidor chama a fila');
  PERFORM pg_temp.checa(has_column_privilege('authenticated', 'public.lancamentos', 'endereco_empreendimento', 'UPDATE'),
    'a tela grava a coluna nova');
  RAISE NOTICE 'OK 3: permissões intactas, coluna gravável pela tela';
END $$;

ROLLBACK;
