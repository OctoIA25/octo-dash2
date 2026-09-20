-- ============================================================
-- Os 27 leads que tinham corretor só no nome (P0.2).
--
-- Havia 44 leads na Lotus com `assigned_agent_name` preenchido e
-- `assigned_agent_id` NULO. Na prática eles não existem para ninguém: não
-- aparecem em "Meus Leads" do corretor, não entram nas métricas dele e a
-- distribuição não sabe de quem são.
--
--   17 em "LOTUS LEADS" — não é gente, é caixa de entrada. Já tratados em
--                         20260918_lotus_leads_sem_corretor.sql.
--   27 em cinco nomes de pessoas — são estes.
--
-- CADA NOME FOI CONFIRMADO PELO CHEFE EM 20/09/2026, um a um. Não é
-- casamento automático por nome, e não podia ser: "FERNANDA SOUZA" tem TRÊS
-- cadastros parecidos na base, dois deles com o nome idêntico e e-mails
-- diferentes. Ligar pelo nome daria 12 leads à pessoa errada, e ela passaria
-- a ver contato de cliente que não é dela.
--
-- O QUE DECIDIU CADA CASO
--   FERNANDA SOUZA (12) -> fernanda.souza@japilancamentos.com.br
--     É a única das três que é membro da Lotus e trabalha hoje: 417 leads já
--     ligados, o mais recente de 18/09. As outras duas têm zero leads e nem
--     vínculo com a imobiliária.
--   ERICK CESAR FERRIGATTI MAMEDE (1) -> erickferrigatti@imobiliariajapi.com.br
--     O e-mail de outra imobiliária engana: ele É membro da Lotus, com 35
--     leads ligados. O vínculo existe; faltava este lead apontar para ele.
--   GABRIELE FÁVARO (8), FABIO GONCALVES (4), HUMBERTO MARTINEZ (2)
--     Um cadastro cada, todos @lotusbrokers.com.br, sem ambiguidade.
--
-- LIGA PELO E-MAIL, NÃO PELO NOME. O e-mail é o que identifica a pessoa sem
-- ambiguidade — é justamente o nome que trouxe o problema até aqui.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_tenant uuid;
  v_par record;
  v_uid text;
  v_mexidos int;
  v_total int := 0;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE name = 'Lotus Brokers';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Lotus Brokers não existe nesta base — nada a fazer.';
    RETURN;
  END IF;

  FOR v_par IN
    SELECT * FROM (VALUES
      ('FERNANDA SOUZA',                'fernanda.souza@japilancamentos.com.br', 12),
      ('GABRIELE FÁVARO',               'gabriele.favaro@lotusbrokers.com.br',    8),
      ('FABIO GONCALVES',               'fabio.goncalves@lotusbrokers.com.br',    4),
      ('HUMBERTO MARTINEZ',             'humberto.martinez@lotusbrokers.com.br',  2),
      ('ERICK CESAR FERRIGATTI MAMEDE', 'erickferrigatti@imobiliariajapi.com.br', 1)
    ) AS v(nome_no_lead, email, esperados)
  LOOP
    SELECT b.auth_user_id::text INTO v_uid
    FROM tenant_brokers b
    WHERE b.tenant_id = v_tenant AND b.email = v_par.email AND b.auth_user_id IS NOT NULL;

    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FALHOU: não achei login para % (%)', v_par.nome_no_lead, v_par.email;
    END IF;

    -- O GATILHO `tg_leads_assignee_must_be_member` ANULA silenciosamente o
    -- corretor de quem não é membro. Sem esta checagem, o UPDATE rodaria,
    -- diria "27 linhas" e deixaria tudo como estava.
    IF NOT EXISTS (
      SELECT 1 FROM tenant_memberships m
      WHERE m.tenant_id = v_tenant AND m.user_id::text = v_uid
    ) THEN
      RAISE EXCEPTION 'FALHOU: % não é membro da Lotus — o gatilho anularia o vínculo', v_par.nome_no_lead;
    END IF;

    UPDATE leads l
       SET assigned_agent_id = v_uid,
           updated_at = now()
     WHERE l.tenant_id = v_tenant
       AND l.assigned_agent_id IS NULL
       AND l.assigned_agent_name = v_par.nome_no_lead;

    GET DIAGNOSTICS v_mexidos = ROW_COUNT;
    v_total := v_total + v_mexidos;

    -- Conferência em voz alta: se o número mudou desde 20/09/2026, alguém
    -- mexeu nesses leads e o que está escrito aqui deixou de valer.
    IF v_mexidos <> v_par.esperados THEN
      RAISE NOTICE 'ATENÇÃO: % tinha % lead(s) em 20/09 e agora ligou %',
        v_par.nome_no_lead, v_par.esperados, v_mexidos;
    END IF;
  END LOOP;

  -- E confere que o gatilho não desfez o trabalho por baixo.
  IF EXISTS (
    SELECT 1 FROM leads l
    WHERE l.tenant_id = v_tenant
      AND l.assigned_agent_id IS NULL
      AND l.assigned_agent_name IN (
        'FERNANDA SOUZA', 'GABRIELE FÁVARO', 'FABIO GONCALVES',
        'HUMBERTO MARTINEZ', 'ERICK CESAR FERRIGATTI MAMEDE')
  ) THEN
    RAISE EXCEPTION 'FALHOU: sobrou lead sem vínculo — o gatilho anulou o UPDATE';
  END IF;

  RAISE NOTICE 'P0.2: % lead(s) passaram a apontar para o corretor certo.', v_total;
END $$;

COMMIT;
