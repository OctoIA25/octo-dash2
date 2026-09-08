-- =============================================================================
-- Campos que a tela de Recrutamento já usa e que a spec não previu.
--
-- A spec modelou o candidato do zero, sem saber que o app já tinha um módulo de
-- recrutamento em produção desde abril. A RecrutamentoPage lê e edita cargo,
-- experiencia, linkedin e curriculo — migrar a tela para recrut_candidato sem
-- essas colunas seria perder funcionalidade que hoje funciona.
--
-- Nada da spec muda: são colunas adicionais, todas opcionais.
-- Rodar DEPOIS de 20260906_backfill_recrutamento_legado.sql.
-- =============================================================================

alter table public.recrut_candidato add column if not exists cargo       text;
alter table public.recrut_candidato add column if not exists experiencia text;
alter table public.recrut_candidato add column if not exists linkedin    text;
alter table public.recrut_candidato add column if not exists curriculo   text;

-- No legado, `creci` guarda o NÚMERO do registro (texto livre). No modelo novo,
-- `creci` é a situação (ativo | em_curso | nao_tem). São duas informações
-- diferentes com o mesmo nome: o número ganha coluna própria.
alter table public.recrut_candidato add column if not exists creci_numero text;

-- Completa quem o backfill anterior já trouxe (casa por tenant + telefone
-- canônico, a mesma chave do unique). Idempotente: só preenche o que está nulo.
update public.recrut_candidato c
   set cargo        = coalesce(c.cargo,        l.cargo),
       experiencia  = coalesce(c.experiencia,  l.experiencia),
       linkedin     = coalesce(c.linkedin,     l.linkedin),
       curriculo    = coalesce(c.curriculo,    l.curriculo),
       creci_numero = coalesce(c.creci_numero, nullif(trim(l.creci), '')),
       -- Ter número de CRECI no legado é a única evidência de registro ativo
       -- que existe ali. Sem número, fica indefinido em vez de 'nao_tem' —
       -- o legado não pergunta isso, e afirmar seria inventar.
       creci        = coalesce(c.creci, case when nullif(trim(l.creci), '') is not null
                                             then 'ativo'::recrut_creci end)
  from public.recruitment_candidates l
 where l.tenant_id = c.tenant_id
   and public.recrut_norm_phone(l.telefone) = c.telefone
   and (c.cargo is null or c.experiencia is null or c.linkedin is null
        or c.curriculo is null or c.creci_numero is null or c.creci is null);

-- O backfill anterior guardou o cargo dentro de `observacoes` porque não havia
-- coluna. Agora há: tira a linha para a ficha não mostrar a informação duas vezes.
update public.recrut_candidato
   set observacoes = nullif(trim(both E'\n' from
         regexp_replace(observacoes, '(^|\n)Cargo no legado: [^\n]*\.', '', 'g')), '')
 where observacoes like '%Cargo no legado:%';

-- A busca da tela é ilike sobre nome/email/cargo (não usa o search_vector do
-- legado). Índice trigram deixa isso sargable; sem a extensão, o ilike segue
-- funcionando com seq scan — a tabela é pequena, então não vale bloquear a
-- migration por causa disso.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists idx_recrut_candidato_nome_trgm
      on public.recrut_candidato using gin (nome gin_trgm_ops);
  else
    raise notice 'pg_trgm ausente: busca por nome segue em seq scan (ok no volume atual)';
  end if;
end $$;
