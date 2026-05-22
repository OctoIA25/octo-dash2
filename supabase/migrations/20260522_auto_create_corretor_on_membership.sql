-- =============================================================================
-- Trigger: criar automaticamente uma linha em "Corretores" quando alguém
-- é inserido em tenant_memberships com role='corretor'.
--
-- Motivação: a tabela "Corretores" guarda os dados de negócio do corretor
-- (nome, email, resultados DISC/Eneagrama/MBTI) e é usada por toda a trilha
-- de testes comportamentais. Hoje a criação de conta cria auth.users +
-- tenant_memberships, mas NÃO cria a linha em "Corretores", deixando o
-- corretor preso na tela de "Carregando..." porque o código não consegue
-- resolver a identidade dele.
--
-- Esta trigger fecha o gap. Também inclui um backfill para corretores que
-- já foram criados sem a linha correspondente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Função: insere em "Corretores" se ainda não existir uma linha para
-- (email, tenant_id). Roda como SECURITY DEFINER para bypass de RLS.
-- Dispara em INSERT e também em UPDATE quando role transiciona PARA 'corretor'
-- (ex.: admin rebaixou um gestor a corretor) — sem isso, esse usuário
-- também cairia no bug original de "identidade não resolvida".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_corretor_row_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Só age para memberships com role='corretor'.
  IF NEW.role IS DISTINCT FROM 'corretor' THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE: só age quando o role TRANSICIONOU para 'corretor'.
  -- Se já era corretor antes, o registro em "Corretores" já deve existir e
  -- não há porque tentar de novo (o existence check abaixo cobriria, mas
  -- evita trabalho desnecessário a cada update de permissions).
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM 'corretor' THEN
    RETURN NEW;
  END IF;

  -- Buscar email e nome do auth.users.
  SELECT
    u.email,
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(TRIM(u.raw_user_meta_data ->> 'full_name'), ''),
      INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
    )
  INTO v_email, v_name
  FROM auth.users u
  WHERE u.id = NEW.user_id;

  -- Sem email não dá pra criar Corretor coerente.
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Idempotente: só insere se não existir linha com mesmo email e tenant.
  IF NOT EXISTS (
    SELECT 1 FROM public."Corretores" c
    WHERE LOWER(c.email) = LOWER(v_email)
      AND c.tenant_id = NEW.tenant_id
  ) THEN
    -- Envolto em bloco BEGIN/EXCEPTION para não quebrar o signup caso
    -- algum NOT NULL desconhecido da tabela Corretores falhe — o pior
    -- caso é o usuário cair no fluxo de identidade não resolvida.
    BEGIN
      INSERT INTO public."Corretores" (email, nm_corretor, tenant_id)
      VALUES (v_email, v_name, NEW.tenant_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha ao criar linha em Corretores para user_id=% tenant_id=%: %',
        NEW.user_id, NEW.tenant_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: dispara depois do INSERT em tenant_memberships, e também em
-- UPDATE quando o campo `role` for alterado (cobre o caso de rebaixamento
-- de gestor → corretor sem precisar deletar e recriar membership).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_ensure_corretor_row_on_membership ON public.tenant_memberships;
CREATE TRIGGER tr_ensure_corretor_row_on_membership
  AFTER INSERT OR UPDATE OF role ON public.tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_corretor_row_on_membership();

-- ---------------------------------------------------------------------------
-- Backfill: cria a linha em "Corretores" para corretores que já existem
-- em tenant_memberships mas ainda não têm o registro de negócio.
--
-- Usa a mesma lógica do gatilho: email + nome derivado, tenant_id da
-- membership. Apenas para role='corretor', e somente se NÃO existir linha
-- com mesmo email + tenant_id.
-- ---------------------------------------------------------------------------
INSERT INTO public."Corretores" (email, nm_corretor, tenant_id)
SELECT
  u.email,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
  ) AS nm_corretor,
  tm.tenant_id
FROM public.tenant_memberships tm
JOIN auth.users u ON u.id = tm.user_id
WHERE tm.role = 'corretor'
  AND u.email IS NOT NULL
  AND u.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public."Corretores" c
    WHERE LOWER(c.email) = LOWER(u.email)
      AND c.tenant_id = tm.tenant_id
  );

COMMENT ON FUNCTION public.ensure_corretor_row_on_membership() IS
  'Cria automaticamente uma linha em "Corretores" quando um usuário é inserido em tenant_memberships com role=corretor. Idempotente: só insere se (email, tenant_id) ainda não existir.';
