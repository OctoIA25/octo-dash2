-- =============================================================================
-- Marcos de ativação criados sozinhos (spec do Dash, §4).
--
--   "Criados automaticamente no evento `decisao` com resultado aprovado:
--    D+5 matrícula, D+7 plantão, D+7 lista de leads, D+15 visita, D+30 checkpoint.
--    Marco vencido sem concluido_em entra na fila de ação."
--
-- Sem isto, o quinto gatilho da fila ('marco_atrasado') nunca dispara — ninguém
-- cria marco à mão. Os prazos saem da data do evento, não de now(), para que um
-- registro lançado com atraso não ganhe prazo futuro.
--
-- Rodar DEPOIS de 20260905_recrutamento.sql.
-- =============================================================================

create or replace function public.recrut_cria_marcos_ativacao()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_base date := (new.created_at at time zone 'America/Sao_Paulo')::date;
begin
  -- Só a decisão APROVADA abre a ativação. Uma reprovação não gera marcos.
  if new.tipo <> 'decisao' or coalesce(new.payload->>'resultado', '') <> 'aprovado' then
    return null;
  end if;

  insert into public.recrut_ativacao_marco (candidato_id, marco, prazo, dono_id)
  select new.candidato_id, m.marco, v_base + m.dias, c.coordenador_id
    from (values
      ('matricula',            5),
      ('primeiro_plantao',     7),
      ('primeira_lista_leads', 7),
      ('primeira_visita',     15),
      ('checkpoint_30d',      30)
    ) as m(marco, dias)
    join public.recrut_candidato c on c.id = new.candidato_id
  on conflict (candidato_id, marco) do nothing;   -- reentrante

  return null;
end
$fn$;

drop trigger if exists tr_recrut_cria_marcos_ativacao on public.recrut_evento;
create trigger tr_recrut_cria_marcos_ativacao
  after insert on public.recrut_evento
  for each row execute function public.recrut_cria_marcos_ativacao();
