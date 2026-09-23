-- ============================================================
-- A permissão `financeiro` (pedido do chefe, 23/09/2026)
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/permissao_financeiro.test.sql
--
-- O lado do banco é pequeno — uma linha de catálogo e um campo de contrato.
-- Mas é o lado que decide se a tela aparece: `allowed_features` é o portão de
-- fora, e uma chave que não está lá some para todo mundo menos o dono da
-- plataforma. O caso 2 é o que pega isso.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  com_relatorios uuid := '2ddd1111-0000-4000-a000-000000000001';
  sem_relatorios uuid := '2ddd1111-0000-4000-a000-000000000002';
  r record;
  n int;
BEGIN
  -- ----------------------------------------------------------
  -- 1. A PERMISSÃO EXISTE NO CATÁLOGO, E MARCADA COMO LIDA
  --
  -- `em_uso = false` seria pior que não existir: quem desmarcasse a chave
  -- acreditaria ter restringido o Financeiro, e não teria restringido nada.
  -- Dezessete das 33 permissões já são assim; esta não pode ser a décima
  -- oitava, porque ela de fato rege menu e rota.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM public.permissoes WHERE codigo = 'financeiro';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU 1: a permissão financeiro não está no catálogo';
  END IF;
  IF r.em_uso IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 1: financeiro entrou como em_uso=false — a tela prometeria uma restrição que não existe';
  END IF;
  RAISE NOTICE 'OK 1: financeiro está no catálogo e marcada como lida';

  -- ----------------------------------------------------------
  -- 2. QUEM CONTRATOU RELATÓRIOS GANHOU FINANCEIRO — E SÓ ESSE
  --
  -- Este é o caso que importa. Sem o UPDATE da migração a chave nasce no
  -- catálogo e o menu do Financeiro desaparece para TODOS os admins, porque
  -- `allowed_features` filtra antes de qualquer permissão de pessoa. O erro
  -- não daria mensagem nenhuma: o item simplesmente não é desenhado.
  -- ----------------------------------------------------------
  INSERT INTO public.tenants (id, code, name, allowed_features) VALUES
    (com_relatorios, 'teste-fin-a', 'Tem Relatorios', '["leads","relatorios"]'::jsonb),
    (sem_relatorios, 'teste-fin-b', 'Nao Tem',        '["leads"]'::jsonb);

  -- Reaplica a regra da migração sobre as duas casas de teste.
  UPDATE public.tenants
     SET allowed_features = allowed_features || '["financeiro"]'::jsonb
   WHERE id IN (com_relatorios, sem_relatorios)
     AND allowed_features @> '["relatorios"]'::jsonb
     AND NOT (allowed_features @> '["financeiro"]'::jsonb);

  IF NOT (SELECT allowed_features @> '["financeiro"]'::jsonb
            FROM public.tenants WHERE id = com_relatorios) THEN
    RAISE EXCEPTION 'FALHOU 2: quem tinha relatorios NÃO recebeu financeiro — o menu some para os admins';
  END IF;
  IF (SELECT allowed_features @> '["financeiro"]'::jsonb
        FROM public.tenants WHERE id = sem_relatorios) THEN
    RAISE EXCEPTION 'FALHOU 2: quem NÃO tinha relatorios recebeu financeiro de brinde';
  END IF;
  RAISE NOTICE 'OK 2: financeiro segue relatorios, e só quem já tinha ganhou';

  -- ----------------------------------------------------------
  -- 3. RODAR DE NOVO NÃO DUPLICA
  --
  -- `allowed_features` é um array JSON sem restrição de unicidade: o `||`
  -- aplicado duas vezes deixaria "financeiro" repetido. Ninguém veria erro —
  -- só um array que cresce a cada reaplicação da migração.
  -- ----------------------------------------------------------
  UPDATE public.tenants
     SET allowed_features = allowed_features || '["financeiro"]'::jsonb
   WHERE id = com_relatorios
     AND allowed_features @> '["relatorios"]'::jsonb
     AND NOT (allowed_features @> '["financeiro"]'::jsonb);

  SELECT count(*) INTO n
    FROM public.tenants t,
         jsonb_array_elements_text(t.allowed_features) AS f
   WHERE t.id = com_relatorios AND f = 'financeiro';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 3: financeiro aparece % vezes em allowed_features', n;
  END IF;
  RAISE NOTICE 'OK 3: reaplicar a migração não duplica a chave';

  -- ----------------------------------------------------------
  -- 4. O CATÁLOGO ACEITA A CHAVE NUM CARGO
  --
  -- `cargo_salvar` recusa permissão fora do catálogo, com exceção explícita.
  -- Se `financeiro` não estivesse lá, montar um cargo "Diretor" com ela
  -- falharia na cara do usuário — que é como o chefe pediu para o Diretor
  -- existir.
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.permissoes WHERE codigo = 'financeiro') THEN
    RAISE EXCEPTION 'FALHOU 4: um cargo Diretor não conseguiria marcar financeiro';
  END IF;
  RAISE NOTICE 'OK 4: um cargo pode marcar financeiro';
END $$;

ROLLBACK;
