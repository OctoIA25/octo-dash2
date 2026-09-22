-- ============================================================
-- Porta aberta: a lista de gente da plataforma inteira
--
-- ACHADO NA AUDITORIA DE 16/09 e reconferido em produção em 22/09, com o
-- número pior: a view `user_profiles` devolve os 126 usuários da plataforma —
-- nome, e-mail e telefone — para QUALQUER pessoa autenticada.
--
-- Simulado em produção com um corretor de verdade: ele tem 20 colegas na
-- imobiliária dele, e leu o e-mail de 126 pessoas. Ou seja, a lista de
-- funcionários das imobiliárias CONCORRENTES.
--
-- Por que passou despercebido: a view lê `auth.users`, que o `authenticated`
-- não alcança direto. Como ela não declara `security_invoker`, roda com os
-- poderes de quem a criou — e nesse caminho a RLS de ninguém se aplica. Uma
-- view assim é um furo sem policy para consertar: o conserto é a própria
-- consulta.
--
-- O QUE NÃO FOI FEITO, de propósito: revogar. Seis telas leem esta view —
-- roleta, times, Central de Leads, recrutamento, vendas — e todas buscam gente
-- da PRÓPRIA casa. Tirar o acesso quebraria as seis para consertar um vazamento
-- que se resolve com um filtro.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.user_profiles AS
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data ->> 'name'       AS full_name,
    u.raw_user_meta_data ->> 'phone'      AS phone,
    u.raw_user_meta_data ->> 'avatar_url' AS avatar_url,
    u.raw_user_meta_data ->> 'role'       AS role,
    u.raw_user_meta_data ->> 'tenant_id'  AS tenant_id
  FROM auth.users u
  WHERE
    -- O SERVIDOR. Ele lê como `service_role`, sem usuário no token, e precisa
    -- da lista inteira para sincronizações e relatórios. Mesma porta que o
    -- resto do sistema já usa.
    auth.uid() IS NULL

    -- O DONO DA PLATAFORMA, que entra nas imobiliárias por impersonação.
    OR public.is_platform_owner()

    -- EU MESMO. Vale para quem ainda não tem vínculo nenhum — sem isto, um
    -- usuário recém-criado não conseguiria ver o próprio perfil.
    OR u.id = auth.uid()

    -- E QUEM DIVIDE IMOBILIÁRIA COMIGO. Uma subconsulta só, resolvida de uma
    -- vez: um EXISTS por linha custaria uma varredura por usuário da base.
    OR u.id IN (
      SELECT colega.user_id
        FROM tenant_memberships eu
        JOIN tenant_memberships colega ON colega.tenant_id = eu.tenant_id
       WHERE eu.user_id = auth.uid()
    );

-- ============================================================
-- E A PARTE GRAVE, ACHADA AO CONFERIR ESTA MIGRATION
--
-- A view é AUTO-ATUALIZÁVEL (`is_updatable = YES`) e roda com os poderes de
-- quem a criou. O `authenticated` tinha INSERT, UPDATE e DELETE nela.
--
-- Somado, isso quer dizer: qualquer pessoa logada podia APAGAR QUALQUER CONTA
-- DA PLATAFORMA, por e-mail, com uma chamada do console do navegador — a de um
-- administrador, a do dono, a de alguém de outra imobiliária.
--
-- Provado no banco local: um corretor comum rodou
--   DELETE FROM user_profiles WHERE email = 'vitima@outracasa.dev'
-- e a linha sumiu de `auth.users`. Antes: 1. Depois: 0.
--
-- A view existe para LER. Escrita em `auth.users` é assunto do servidor, com a
-- chave de serviço, e de mais ninguém.
-- ============================================================
REVOKE ALL ON public.user_profiles FROM anon;
REVOKE ALL ON public.user_profiles FROM authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO service_role;

-- ============================================================
-- O QUE O RECRUTAMENTO PRECISAVA, SEM O QUE ELE USAVA
--
-- A tela de Recrutamento fazia duas coisas por esta view, e as duas são o
-- motivo de ela estar aberta:
--
--   1. buscava por e-mail para saber se o candidato já tem conta — e um
--      candidato, por definição, ainda não é da casa, então o filtro de
--      colegas o esconderia e a tela concluiria "não existe";
--   2. APAGAVA o usuário quando o candidato saía de "Aprovado".
--
-- A primeira vira uma pergunta de sim ou não: quem recruta precisa saber que o
-- e-mail já está em uso, não quem é a pessoa nem onde ela trabalha.
-- ============================================================
CREATE OR REPLACE FUNCTION public.usuario_ja_tem_conta(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Devolve SÓ sim ou não. Nome, telefone e imobiliária da pessoa não são
  -- assunto de quem está recrutando — e era justamente isso que vazava.
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE lower(u.email) = lower(btrim(COALESCE(p_email, '')))
       AND COALESCE(btrim(p_email), '') <> ''
  );
$function$;

-- A segunda não vira função nenhuma, de propósito.
--
-- "O candidato saiu de Aprovado" não pode significar "apague a conta dessa
-- pessoa da plataforma". A conta pode ser de outra imobiliária, pode ser de um
-- administrador, e apagá-la é irreversível. O que a tela quer dizer é "esta
-- pessoa não é mais da minha equipe" — e isso é tirar o VÍNCULO, não a conta.
CREATE OR REPLACE FUNCTION public.recrutamento_desvincular(
  p_tenant_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_removidos integer;
BEGIN
  IF NOT public.is_tenant_admin_or_owner(p_tenant_id)
     AND NOT public.is_platform_owner() THEN RETURN NULL; END IF;

  SELECT id INTO v_user FROM auth.users
   WHERE lower(email) = lower(btrim(COALESCE(p_email, ''))) LIMIT 1;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('desvinculado', false, 'motivo', 'não há conta com este e-mail');
  END IF;

  -- SÓ da imobiliária de quem chamou. O vínculo da pessoa com outras casas não
  -- é assunto daqui.
  DELETE FROM tenant_memberships
   WHERE tenant_id = p_tenant_id AND user_id = v_user;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('desvinculado', v_removidos > 0, 'conta_preservada', true);
END;
$function$;

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.usuario_ja_tem_conta(text)',
    'public.recrutamento_desvincular(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

COMMENT ON VIEW public.user_profiles IS
  'Perfis vindos de auth.users. Desde 22/09/2026 mostra apenas quem divide imobiliária com quem consulta — antes disso devolvia a plataforma inteira para qualquer pessoa autenticada.';

NOTIFY pgrst, 'reload schema';

COMMIT;
