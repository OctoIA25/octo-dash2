-- ============================================================
-- A importação de corretores pelo XML (edge function xml-create-broker-access)
-- criava o login com a senha = 4 últimos dígitos do telefone, ou "0000" sem
-- telefone: 10 mil tentativas adivinham. Em 01/10 eram 41 contas, todas
-- corretores da Japi com acesso à Japi e à "imobiliaria 9"; nenhuma na Lotus.
--
-- Cada conta que AINDA usa essa senha ganha uma aleatória que ninguém conhece,
-- e as sessões abertas caem. Quem trocou pela sua fica como está. Para voltar
-- a entrar: o admin define a senha em Gestão de Equipe, ou "Esqueci minha senha".
--
-- A função passou a gerar senha aleatória no mesmo dia; isto limpa o passado.
-- ============================================================
DO $$
DECLARE
  v_id uuid;
  v_trocadas int := 0;
BEGIN
  FOR v_id IN
    SELECT u.id
      FROM auth.users u
     WHERE u.id IN (SELECT b.auth_user_id FROM public.tenant_brokers b WHERE b.source = 'xml')
       AND u.encrypted_password LIKE '$2%'
       AND EXISTS (
         -- o telefone que gerou a senha: o do cadastro (metadata) ou o de qualquer importação
         SELECT 1
           FROM (SELECT regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') AS tel
                 UNION
                 SELECT regexp_replace(coalesce(b.phone, ''), '\D', '', 'g')
                   FROM public.tenant_brokers b WHERE b.auth_user_id = u.id) t
          WHERE u.encrypted_password = extensions.crypt(
                  CASE WHEN length(t.tel) >= 4 THEN right(t.tel, 4) ELSE '0000' END,
                  u.encrypted_password))
  LOOP
    PERFORM public.gravar_senha(v_id, encode(extensions.gen_random_bytes(24), 'base64'));
    DELETE FROM auth.sessions WHERE user_id = v_id;
    v_trocadas := v_trocadas + 1;
  END LOOP;
  RAISE NOTICE 'contas do XML com senha de 4 dígitos trocadas: %', v_trocadas;
END $$;
