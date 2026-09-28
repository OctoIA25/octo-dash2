-- Testes de 20260928_plantao_lancamento_escala_ao_diretor.sql.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/plantao_lancamento_escala.test.sql
--
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE FUNCTION pg_temp.erro_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.checa(boolean, text), pg_temp.erro_de(text) TO authenticated, anon;

-- Casa, gestora de lançamentos, diretor com WhatsApp, e uma vizinha.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('5e5c0000-0000-4000-a000-000000000001', 'gestora@teste-esc.dev', '{"name":"Fernanda Teste"}'),
  ('5e5c0000-0000-4000-a000-000000000002', 'diretor@teste-esc.dev', '{"name":"Erick Teste"}')
ON CONFLICT DO NOTHING;
INSERT INTO tenants (id, code, name) VALUES
  ('5e5c1111-0000-4000-a000-000000000001', 'teste-esc', 'Teste Escala'),
  ('5e5c1111-0000-4000-a000-000000000002', 'teste-esc-2', 'Vizinha')
ON CONFLICT DO NOTHING;
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('5e5c1111-0000-4000-a000-000000000001', '5e5c0000-0000-4000-a000-000000000001', 'team_leader', '{}'),
  ('5e5c1111-0000-4000-a000-000000000001', '5e5c0000-0000-4000-a000-000000000002', 'admin',
   '{"whatsapp_phones": ["11 98888-7777"]}')
ON CONFLICT DO NOTHING;
INSERT INTO lancamentos (id, tenant_id, nome) VALUES
  ('5e5c2222-0000-4000-a000-000000000001', '5e5c1111-0000-4000-a000-000000000001', 'Reserva Teste')
ON CONFLICT DO NOTHING;

-- Sem configuração, nada escala.
INSERT INTO lia_perguntas_corretor (id, tenant_id, pergunta, status, criado_em, corretor_id, empreendimento_id) VALUES
  ('esc-sem-config', '5e5c1111-0000-4000-a000-000000000001', 'Tem vaga coberta?', 'pendente',
   now() - interval '30 hours', '5e5c0000-0000-4000-a000-000000000001', '5e5c2222-0000-4000-a000-000000000001');

-- 1. Sem ninguém para receber a escalada, a função não devolve nada.
SELECT pg_temp.checa(
  (SELECT count(*) FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')) = 0,
  'sem configuracao nao escala');

INSERT INTO tenant_plantao_config (tenant_id, lancamento_responsavel_id, lancamento_escala_para_id)
VALUES ('5e5c1111-0000-4000-a000-000000000001',
        '5e5c0000-0000-4000-a000-000000000001', '5e5c0000-0000-4000-a000-000000000002');

-- 2. O padrão é 24 horas.
SELECT pg_temp.checa(
  (SELECT lancamento_escala_horas FROM tenant_plantao_config
    WHERE tenant_id = '5e5c1111-0000-4000-a000-000000000001') = 24,
  'o padrao e 24 horas');

INSERT INTO lia_perguntas_corretor (id, tenant_id, pergunta, status, criado_em, corretor_id, empreendimento_id, escalated_at) VALUES
  ('esc-23h',        '5e5c1111-0000-4000-a000-000000000001', 'Aceita FGTS?', 'pendente',   now() - interval '23 hours', '5e5c0000-0000-4000-a000-000000000001', '5e5c2222-0000-4000-a000-000000000001', null),
  ('esc-respondida', '5e5c1111-0000-4000-a000-000000000001', 'Qual a metragem?', 'respondida', now() - interval '40 hours', '5e5c0000-0000-4000-a000-000000000001', '5e5c2222-0000-4000-a000-000000000001', null),
  ('esc-avulso',     '5e5c1111-0000-4000-a000-000000000001', 'Aceita pet?', 'pendente',   now() - interval '40 hours', '5e5c0000-0000-4000-a000-000000000001', null, null),
  ('esc-ja-subiu',   '5e5c1111-0000-4000-a000-000000000001', 'Tem piscina?', 'pendente',  now() - interval '50 hours', '5e5c0000-0000-4000-a000-000000000001', '5e5c2222-0000-4000-a000-000000000001', now() - interval '26 hours');
INSERT INTO lia_perguntas_corretor (id, tenant_id, pergunta, status, criado_em, empreendimento_id) VALUES
  ('esc-vizinha', '5e5c1111-0000-4000-a000-000000000002', 'Outra casa', 'pendente', now() - interval '40 hours', null);

-- 3. Só a de lançamento, pendente, passada das 24h e ainda não escalada.
SELECT pg_temp.checa(
  (SELECT array_agg(pergunta_id ORDER BY pergunta_id) FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001'))
    IS NOT DISTINCT FROM ARRAY['esc-sem-config'],
  'so a de lancamento pendente passada das 24h e nao escalada');

-- 4. Devolve quem avisar e por qual número, e o empreendimento.
SELECT pg_temp.checa(
  (SELECT escalar_para_nome = 'Erick Teste'
          AND escalar_para_whatsapp = '["11 98888-7777"]'::jsonb
          AND empreendimento = 'Reserva Teste'
          AND responsavel_id = '5e5c0000-0000-4000-a000-000000000001'
          AND horas_esperando >= 29.9
     FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')),
  'devolve o diretor, o whatsapp, o empreendimento e a gestora');

-- 5. Listar NÃO marca: chamar de novo devolve a mesma, até a LIA gravar.
SELECT pg_temp.checa(
  (SELECT count(*) FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')) = 1
  AND (SELECT escalated_at FROM lia_perguntas_corretor WHERE id = 'esc-sem-config') IS NULL,
  'listar nao marca como escalada');

-- 6. Depois que a LIA grava escalated_at, sai da lista — e o dono NÃO muda.
UPDATE lia_perguntas_corretor SET escalated_at = now() WHERE id = 'esc-sem-config';
SELECT pg_temp.checa(
  (SELECT count(*) FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')) = 0
  AND (SELECT corretor_id FROM lia_perguntas_corretor WHERE id = 'esc-sem-config') = '5e5c0000-0000-4000-a000-000000000001',
  'marcada sai da lista e continua com a gestora');

-- 7. O prazo vem da configuração: com 20h, a de 23h também sobe.
UPDATE tenant_plantao_config SET lancamento_escala_horas = 20 WHERE tenant_id = '5e5c1111-0000-4000-a000-000000000001';
SELECT pg_temp.checa(
  (SELECT array_agg(pergunta_id) FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001'))
    IS NOT DISTINCT FROM ARRAY['esc-23h'],
  'o prazo vem da configuracao');

-- 8. A fila da tela diz quando subiu.
SELECT pg_temp.checa(
  (SELECT bool_or(l->>'id' = 'esc-sem-config' AND l->>'escalada_em' IS NOT NULL)
     FROM jsonb_array_elements(plantao_fila('5e5c1111-0000-4000-a000-000000000001', 'todas')->'linhas') l),
  'a fila mostra escalada_em');

-- 9. Ninguém de fora chama a função: nem logado, nem anônimo.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '5e5c0000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);
SELECT pg_temp.checa(
  pg_temp.erro_de($q$SELECT * FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')$q$) = '42501',
  'authenticated nao executa');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.checa(
  pg_temp.erro_de($q$SELECT * FROM plantao_lancamentos_a_escalar('5e5c1111-0000-4000-a000-000000000001')$q$) = '42501',
  'anon nao executa');
RESET ROLE;

-- 10. O servidor da LIA executa.
SELECT pg_temp.checa(has_function_privilege('service_role', 'public.plantao_lancamentos_a_escalar(uuid)', 'EXECUTE'),
  'service_role executa');

-- 11. O admin grava a configuração nova pela tela (grant da tabela cobre as colunas).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '5e5c0000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);
SELECT pg_temp.checa(
  pg_temp.erro_de($q$UPDATE tenant_plantao_config SET lancamento_escala_horas = 48
                     WHERE tenant_id = '5e5c1111-0000-4000-a000-000000000001'$q$) IS NULL,
  'admin grava as colunas novas (sem erro)');
RESET ROLE;
-- e gravou mesmo — RLS que filtra em silêncio devolveria "sem erro" com 0 linhas.
SELECT pg_temp.checa(
  (SELECT lancamento_escala_horas FROM tenant_plantao_config
    WHERE tenant_id = '5e5c1111-0000-4000-a000-000000000001') = 48,
  'admin grava as colunas novas (e o valor mudou)');

SELECT 'OK: plantao_lancamento_escala - 12 casos passaram' AS resultado;

ROLLBACK;
