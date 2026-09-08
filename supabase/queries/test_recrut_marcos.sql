-- Verificação dos marcos automáticos (20260906_recrut_marcos_automaticos).
-- Rodar no SQL Editor. Transação com ROLLBACK: não deixa dado.
begin;

do $$
declare
  v_tenant uuid;
  v_cand   uuid;
  n        int;
  v_prazo  date;
begin
  select id into v_tenant from public.tenants limit 1;

  insert into public.recrut_candidato (tenant_id, nome, telefone)
  values (v_tenant, 'Teste Marcos', '5511000000002') returning id into v_cand;

  -- Decisão sem resultado aprovado nao abre ativacao.
  insert into public.recrut_evento (candidato_id, tipo, payload)
  values (v_cand, 'decisao', '{"resultado":"reprovado"}');
  select count(*) into n from public.recrut_ativacao_marco where candidato_id = v_cand;
  assert n = 0, 'decisao reprovada nao deveria criar marcos, criou ' || n;

  insert into public.recrut_evento (candidato_id, tipo, payload)
  values (v_cand, 'decisao', '{"resultado":"aprovado"}');
  select count(*) into n from public.recrut_ativacao_marco where candidato_id = v_cand;
  assert n = 5, 'decisao aprovada deveria criar os 5 marcos, criou ' || n;

  select prazo into v_prazo from public.recrut_ativacao_marco
   where candidato_id = v_cand and marco = 'checkpoint_30d';
  assert v_prazo = (now() at time zone 'America/Sao_Paulo')::date + 30,
         'checkpoint deveria cair em D+30, veio ' || v_prazo;

  -- Reentrante: uma segunda decisao aprovada nao duplica.
  insert into public.recrut_evento (candidato_id, tipo, payload)
  values (v_cand, 'decisao', '{"resultado":"aprovado"}');
  select count(*) into n from public.recrut_ativacao_marco where candidato_id = v_cand;
  assert n = 5, 'segunda decisao duplicou marcos: ' || n;

  -- Marco vencido cai na fila de acao (gatilho 5 da spec).
  update public.recrut_ativacao_marco set prazo = current_date - 1
   where candidato_id = v_cand and marco = 'primeira_visita';
  select count(*) into n from public.vw_recrut_fila_acao
   where id = v_cand and motivo = 'marco_atrasado:primeira_visita';
  assert n = 1, 'marco vencido deveria estar na fila de acao, veio ' || n;

  raise notice 'OK: 5 marcos na decisao aprovada, prazos relativos, reentrante e fila de acao';
end $$;

rollback;
