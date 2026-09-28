-- Testes de 20260928_lead_imoveis_interesse.sql.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/lead_imoveis_interesse.test.sql
--
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Tenta um comando e devolve o SQLSTATE (NULL = passou).
CREATE FUNCTION pg_temp.erro_de(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.checa(boolean, text), pg_temp.erro_de(text) TO authenticated, anon;

INSERT INTO auth.users (id, email) VALUES
  ('1a1a0000-0000-4000-a000-000000000001', 'ana@teste-imi.dev'),
  ('1a1a0000-0000-4000-a000-000000000009', 'fora@teste-imi.dev')
ON CONFLICT DO NOTHING;
INSERT INTO tenants (id, code, name) VALUES
  ('1a1a1111-0000-4000-a000-000000000001', 'teste-imi', 'Teste Imóveis'),
  ('1a1a1111-0000-4000-a000-000000000002', 'teste-imi-2', 'Vizinha')
ON CONFLICT DO NOTHING;
INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
  ('1a1a1111-0000-4000-a000-000000000001', '1a1a0000-0000-4000-a000-000000000001', 'corretor'),
  ('1a1a1111-0000-4000-a000-000000000002', '1a1a0000-0000-4000-a000-000000000009', 'admin')
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, tenant_id, name, property_code) VALUES
  ('1a1a2222-0000-4000-a000-000000000001', '1a1a1111-0000-4000-a000-000000000001', 'Cliente', 'AP0001');

-- ---------- A corretora da casa ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '1a1a0000-0000-4000-a000-000000000001', 'role', 'authenticated')::text, true);

-- 1. Adiciona um segundo imóvel ao lead dela.
SELECT pg_temp.checa(pg_temp.erro_de($$
  INSERT INTO lead_imoveis_interesse (tenant_id, lead_id, codigo)
  VALUES ('1a1a1111-0000-4000-a000-000000000001', '1a1a2222-0000-4000-a000-000000000001', 'CA0002')
$$) IS NULL, 'corretora adiciona imovel ao lead da casa');

-- 2. E um terceiro — "um ou mais".
SELECT pg_temp.checa(pg_temp.erro_de($$
  INSERT INTO lead_imoveis_interesse (tenant_id, lead_id, codigo)
  VALUES ('1a1a1111-0000-4000-a000-000000000001', '1a1a2222-0000-4000-a000-000000000001', 'TE0003')
$$) IS NULL, 'corretora adiciona mais um');

-- 3. O mesmo código com outra grafia é o mesmo imóvel.
SELECT pg_temp.checa(pg_temp.erro_de($$
  INSERT INTO lead_imoveis_interesse (tenant_id, lead_id, codigo)
  VALUES ('1a1a1111-0000-4000-a000-000000000001', '1a1a2222-0000-4000-a000-000000000001', ' ca0002 ')
$$) = '23505', 'grafia diferente do mesmo codigo e recusada como duplicada');

-- 4. Não existe UPDATE: trocar é apagar e adicionar.
SELECT pg_temp.checa(pg_temp.erro_de($$
  UPDATE lead_imoveis_interesse SET codigo = 'XX' WHERE codigo = 'CA0002'
$$) = '42501', 'sem UPDATE para authenticated');

-- 5. Remove um dos extras; o principal (property_code) continua no lead.
DELETE FROM lead_imoveis_interesse WHERE codigo = 'TE0003';
SELECT pg_temp.checa(
  (SELECT count(*) FROM lead_imoveis_interesse) = 1
  AND (SELECT property_code FROM leads WHERE id = '1a1a2222-0000-4000-a000-000000000001') = 'AP0001',
  'remover extra deixa o principal intacto');

-- ---------- Alguém de outra imobiliária ----------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '1a1a0000-0000-4000-a000-000000000009', 'role', 'authenticated')::text, true);

-- 6. Não vê os imóveis do lead da vizinha.
SELECT pg_temp.checa((SELECT count(*) FROM lead_imoveis_interesse) = 0,
  'outra casa nao le');

-- 7. Não pendura imóvel no lead da vizinha informando o PRÓPRIO tenant.
SELECT pg_temp.checa(pg_temp.erro_de($$
  INSERT INTO lead_imoveis_interesse (tenant_id, lead_id, codigo)
  VALUES ('1a1a1111-0000-4000-a000-000000000002', '1a1a2222-0000-4000-a000-000000000001', 'ZZ9')
$$) = '42501', 'outra casa nao insere com o proprio tenant');

-- 8. Nem informando o tenant da vizinha.
SELECT pg_temp.checa(pg_temp.erro_de($$
  INSERT INTO lead_imoveis_interesse (tenant_id, lead_id, codigo)
  VALUES ('1a1a1111-0000-4000-a000-000000000001', '1a1a2222-0000-4000-a000-000000000001', 'ZZ9')
$$) = '42501', 'outra casa nao insere com o tenant do lead');

-- 9. Não apaga (o DELETE não enxerga a linha; a contagem prova).
DELETE FROM lead_imoveis_interesse;
RESET ROLE;
SELECT pg_temp.checa((SELECT count(*) FROM lead_imoveis_interesse
  WHERE lead_id = '1a1a2222-0000-4000-a000-000000000001') = 1, 'outra casa nao apaga');

-- ---------- Visitante anônimo ----------
SET LOCAL ROLE anon;
SELECT pg_temp.checa(pg_temp.erro_de('SELECT 1 FROM lead_imoveis_interesse') = '42501',
  'anon recebe permission denied');
RESET ROLE;

-- 11. Apagar o lead leva os imóveis junto.
DELETE FROM leads WHERE id = '1a1a2222-0000-4000-a000-000000000001';
SELECT pg_temp.checa((SELECT count(*) FROM lead_imoveis_interesse
  WHERE lead_id = '1a1a2222-0000-4000-a000-000000000001') = 0, 'cascade ao apagar o lead');

SELECT 'OK: lead_imoveis_interesse - 11 casos passaram' AS resultado;

ROLLBACK;
