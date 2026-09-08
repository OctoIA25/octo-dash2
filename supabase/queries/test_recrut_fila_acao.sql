-- =============================================================================
-- Verificação da view vw_recrut_fila_acao (20260905_recrutamento_fila_acao).
-- Rodar no SQL Editor DEPOIS de aplicar as duas migrations de recrutamento.
-- Transação com ROLLBACK: não deixa dado.
-- =============================================================================
begin;

do $$
declare
  v_tenant uuid;
  v_cand   uuid;
  v_ts     timestamptz;
  n        int;
begin
  select id into v_tenant from public.tenants limit 1;
  assert v_tenant is not null, 'nenhum tenant no banco para o teste';

  -- Candidatura de 2h atrás, ninguém contatou: tem que estar na fila.
  insert into public.recrut_candidato (tenant_id, nome, telefone, canal, ts_candidatura)
  values (v_tenant, 'Teste Fila', '5511000000001', 'anuncio_meta', now() - interval '2 hours')
  returning id into v_cand;

  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'sla_primeiro_contato';
  assert n = 1, 'candidatura de 2h sem contato deveria estar na fila, veio ' || n;

  -- Contatou: sai da fila.
  insert into public.recrut_evento (candidato_id, tipo, autor) values (v_cand, 'primeiro_contato', 'lia');
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'sla_primeiro_contato';
  assert n = 0, 'apos o primeiro contato o candidato deveria sair da fila de SLA';

  -- Reuniao marcada para AMANHA. O trigger tem que gravar o horario da reuniao
  -- (payload.horario), nao a hora em que foi marcada — senao o bloco 3 da fila
  -- nunca acha ninguem.
  insert into public.recrut_evento (candidato_id, tipo, autor, payload)
  values (v_cand, 'reuniao_agendada', 'lia',
          jsonb_build_object('horario', (current_date + 1 + time '15:00')::timestamptz));
  select ts_reuniao_agendada into v_ts from public.recrut_candidato where id = v_cand;
  assert v_ts::date = current_date + 1,
         'ts_reuniao_agendada deveria ser a data da reuniao, veio ' || v_ts;

  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'confirmar_reuniao';
  assert n = 1, 'reuniao de amanha sem confirmacao deveria estar na fila, veio ' || n;

  -- Confirmou: sai da fila. É o passo que hoje nao existe e custou 4 reunioes.
  insert into public.recrut_evento (candidato_id, tipo, autor) values (v_cand, 'reuniao_confirmada', 'lia');
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'confirmar_reuniao';
  assert n = 0, 'apos confirmar, a reuniao deveria sair da fila';

  -- Prazo da matricula vencido ontem, sem matricula.
  update public.recrut_candidato set prazo_matricula = current_date - 1 where id = v_cand;
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'prazo_matricula';
  assert n = 1, 'prazo de matricula vencido deveria estar na fila, veio ' || n;

  -- Marco de ativacao vencido.
  insert into public.recrut_ativacao_marco (candidato_id, marco, prazo)
  values (v_cand, 'primeira_lista_leads', current_date - 3);
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'marco_atrasado:primeira_lista_leads';
  assert n = 1, 'marco vencido deveria estar na fila, veio ' || n;

  -- A fila tem que carregar tenant_id: e por ele que a rota separa os tenants.
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and tenant_id = v_tenant;
  assert n >= 1, 'fila sem tenant_id — a rota nao consegue filtrar por tenant';

  raise notice 'OK: SLA, confirmacao de reuniao, prazo de matricula, marco atrasado e tenant_id';
end $$;

rollback;
