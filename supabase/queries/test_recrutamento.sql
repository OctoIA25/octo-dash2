-- =============================================================================
-- Verificação da migration 20260905_recrutamento.
-- Rodar no SQL Editor do Supabase DEPOIS de aplicar a migration.
-- Tudo dentro de transação com ROLLBACK no fim: não deixa dado nenhum.
-- Sucesso = "OK: ..." no output. Qualquer assert que falhar aborta com a mensagem.
-- =============================================================================
begin;

do $$
declare
  v_tenant  uuid;
  v_user    uuid;
  v_cand    uuid;
  v_estagio recrut_estagio;
  v_touch   timestamptz;
  v_funil   record;
begin
  select id into v_tenant from public.tenants limit 1;
  select id into v_user   from auth.users     limit 1;
  assert v_tenant is not null, 'nenhum tenant no banco para o teste';

  insert into public.recrut_candidato (tenant_id, nome, telefone, canal)
  values (v_tenant, 'Teste Recrutamento', '5511000000000', 'indicacao')
  returning id into v_cand;

  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'lead', 'candidato novo deveria nascer em lead, veio ' || v_estagio;

  -- Evento move o estágio. A UI nunca escreve `estagio`.
  insert into public.recrut_evento (candidato_id, tipo, autor)
  values (v_cand, 'resposta_candidato', 'lia');
  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'interacao', 'resposta deveria virar interacao, veio ' || v_estagio;

  update public.recrut_candidato
     set cond_regiao = 'aprovado', cond_tempo = 'aprovado', cond_verba = 'aprovado', dias_semana = 4
   where id = v_cand;
  insert into public.recrut_evento (candidato_id, tipo, autor)
  values (v_cand, 'condicoes_respondidas', 'lia');
  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'qualificado', 'tres condicoes deveriam virar qualificado, veio ' || v_estagio;

  insert into public.recrut_evento (candidato_id, tipo, autor) values (v_cand, 'reuniao_realizada', 'erick');
  insert into public.recrut_evento (candidato_id, tipo, autor) values (v_cand, 'matricula_confirmada', 'erick');
  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'matricula', 'matricula confirmada deveria virar matricula, veio ' || v_estagio;

  -- Evento inerte (no_show, decisao, ...) fica na timeline mas nao mexe no card:
  -- nao muda estagio e nao bumpa updated_at.
  select updated_at into v_touch from public.recrut_candidato where id = v_cand;
  insert into public.recrut_evento (candidato_id, tipo, autor) values (v_cand, 'no_show', 'erick');
  assert (select estagio from public.recrut_candidato where id = v_cand) = 'matricula',
         'evento inerte mudou o estagio';
  assert (select updated_at from public.recrut_candidato where id = v_cand) = v_touch,
         'evento inerte bumpou updated_at — o guard do trigger nao esta valendo';

  -- REGRA D062: sem Coordenador não ativa. A constraint tem que recusar.
  begin
    insert into public.recrut_evento (candidato_id, tipo, payload)
    values (v_cand, 'marco_ativacao', '{"marco":"primeiro_plantao"}');
    assert false, 'onboard sem coordenador passou — a regra D062 nao esta valendo';
  exception when check_violation then null;
  end;

  update public.recrut_candidato set coordenador_id = v_user where id = v_cand;
  insert into public.recrut_evento (candidato_id, tipo, payload)
  values (v_cand, 'marco_ativacao', '{"marco":"primeiro_plantao"}');
  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'onboard', 'primeiro plantao deveria virar onboard, veio ' || v_estagio;

  -- O ponto do diagnostico: funil CUMULATIVO. Quem chegou ao Onboard tem que
  -- continuar contando nas etapas anteriores — senao volta o 0·0·0·1.
  select * into v_funil from public.recrut_funil(v_tenant);
  assert v_funil.lead      >= 1, 'candidato sumiu de Lead';
  assert v_funil.interacao >= 1, 'candidato em Onboard sumiu de Interacao — funil voltou a ser excludente';
  assert v_funil.qualificado       >= 1, 'candidato em Onboard sumiu de Qualificado';
  assert v_funil.reuniao_realizada >= 1, 'candidato em Onboard sumiu de Reuniao realizada';
  assert v_funil.matricula         >= 1, 'candidato em Onboard sumiu de Matricula';
  assert v_funil.onboard           >= 1, 'candidato nao chegou em Onboard';

  -- REGRA: card nao fecha sem motivo.
  begin
    insert into public.recrut_evento (candidato_id, tipo) values (v_cand, 'encerrado');
    assert false, 'encerrou sem motivo_perda — a constraint nao esta valendo';
  exception when check_violation then null;
  end;

  update public.recrut_candidato set motivo_perda = 'sumiu' where id = v_cand;
  insert into public.recrut_evento (candidato_id, tipo) values (v_cand, 'encerrado');
  select estagio into v_estagio from public.recrut_candidato where id = v_cand;
  assert v_estagio = 'perdido', 'encerrado deveria virar perdido, veio ' || v_estagio;

  raise notice 'OK: estagio derivado, evento inerte, regra D062, motivo obrigatorio e funil cumulativo';
end $$;

rollback;
