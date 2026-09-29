-- ============================================================
-- Recrutamento: VOLTAR de etapa (e reabrir um perdido) pelo Kanban.
--
-- Pedido do dono em 29/09/2026: no Kanban tem que dar para retroceder o card
-- — inclusive para Lead — e tirar um candidato de Perdido.
--
-- Até aqui o modelo só andava para frente: `recrut_aplica_evento` carimba os
-- `ts_*` com coalesce (a primeira ocorrência vence) e recalcula `estagio` como
-- o MAIOR alcançado. Não existe evento que desfaça isso; a UI nunca escreve
-- `estagio` direto. Um "volta" à mão (UPDATE em estagio) duraria até o próximo
-- evento, quando o recálculo devolveria o candidato para onde estava.
--
-- O que entra: o evento `estagio_retrocedido` com `payload.para`. O gatilho
-- zera os `ts_*` das etapas DEPOIS da etapa-alvo (na ordem do funil), zera
-- `ts_encerrado` e `motivo_perda` (reabrir) e grava `estagio` explicitamente —
-- e sai sem passar pelo recálculo de máximo. O `recrut_carimba_etapa` (BEFORE
-- UPDATE) preenche o ts da etapa-alvo se estiver vazio.
--
-- O evento fica em `recrut_evento` como qualquer outro: a timeline mostra
-- "Voltou para X", com quem mandou em `payload.responsavel`. A "data de
-- alcance" das etapas anteriores à alvo é preservada (não se zera o que já
-- foi conquistado antes dela).
--
-- Constraints: `encerrado_exige_motivo` fica satisfeita porque o estágio deixa
-- de ser 'perdido'. `onboard_exige_coordenador` só é tocada ao reabrir DIRETO
-- em onboard sem coordenador — aí o INSERT do evento falha (23514), que é a
-- regra D062, não um bug; a tela traduz a mensagem.
-- ============================================================

-- ------------------------------------------------------------
-- BLOCO 1 — rodar e COMMITAR antes do resto: valor novo de enum não pode ser
-- usado na mesma transação em que foi criado (o BLOCO 2 o cita na função).
-- ------------------------------------------------------------
ALTER TYPE public.recrut_evento_tipo ADD VALUE IF NOT EXISTS 'estagio_retrocedido';

-- ------------------------------------------------------------
-- BLOCO 2 — a função do gatilho, com o ramo de retroceder no início. Todo o
-- resto é a função de 20260905_recrutamento.sql, copiada, não reescrita.
-- ------------------------------------------------------------
BEGIN;

create or replace function public.recrut_aplica_evento()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_para  text;
  v_nivel int;
begin
  -- RETROCEDER (29/09/2026). `payload.para` é obrigatório e é uma etapa do
  -- funil — 'perdido' não é destino de retrocesso (encerrar tem evento próprio).
  if new.tipo = 'estagio_retrocedido' then
    v_para := new.payload->>'para';
    if v_para is null
       or v_para not in ('lead','interacao','qualificado','reuniao_realizada','matricula','onboard') then
      raise exception 'estagio_retrocedido exige payload.para com uma etapa do funil (lead, interacao, qualificado, reuniao_realizada, matricula ou onboard); veio "%"',
        coalesce(v_para, 'nulo')
        using errcode = '22023';
    end if;

    -- Ordem do funil: lead(0) < interacao(1) < qualificado(2)
    --   < reuniao_realizada(3) < matricula(4) < onboard(5).
    v_nivel := case v_para
      when 'lead'              then 0
      when 'interacao'         then 1
      when 'qualificado'       then 2
      when 'reuniao_realizada' then 3
      when 'matricula'         then 4
      else                          5
    end;

    -- UM update: reabre, apaga o que vem DEPOIS da etapa-alvo e grava o estágio.
    -- O que vem antes fica — é a data de alcance de verdade.
    update public.recrut_candidato c set
      ts_encerrado         = null,
      motivo_perda         = null,
      ts_primeiro_contato  = case when v_nivel < 1 then null else c.ts_primeiro_contato  end,
      ts_primeira_resposta = case when v_nivel < 1 then null else c.ts_primeira_resposta end,
      ts_qualificado       = case when v_nivel < 2 then null else c.ts_qualificado       end,
      ts_reuniao_agendada  = case when v_nivel < 3 then null else c.ts_reuniao_agendada  end,
      ts_reuniao_realizada = case when v_nivel < 3 then null else c.ts_reuniao_realizada end,
      ts_matricula         = case when v_nivel < 4 then null else c.ts_matricula         end,
      ts_onboard           = case when v_nivel < 5 then null else c.ts_onboard           end,
      estagio              = v_para::recrut_estagio,
      updated_at           = now()
    where c.id = new.candidato_id;

    return null;
  end if;

  -- Saída antecipada: 6 dos 14 tipos (reuniao_confirmada, no_show, decisao,
  -- link_matricula_enviado, prazo_matricula_vencido, candidatura_recebida) não
  -- movem timestamp nenhum. Sair aqui evita 2 UPDATEs e evita bumpar updated_at
  -- à toa — eles continuam gravados em recrut_evento, que é o que a timeline lê.
  -- ponytail: a spec não diz qual evento marca o Onboard. Uso o primeiro plantão
  -- (D+7), que é quando a pessoa passa a operar. Se o Erick entender Onboard como
  -- outro momento, troca-se o payload testado aqui.
  if new.tipo not in ('primeiro_contato','resposta_candidato','condicoes_respondidas',
                      'reuniao_agendada','reuniao_realizada','matricula_confirmada',
                      'marco_ativacao','encerrado')
     or (new.tipo = 'marco_ativacao'
         and new.payload->>'marco' is distinct from 'primeiro_plantao') then
    return null;
  end if;

  -- Primeira ocorrência vence (coalesce), exceto reunião agendada — remarcação
  -- sobrescreve — e encerramento, que sempre reflete o último.
  update public.recrut_candidato c set
    ts_primeiro_contato  = case when new.tipo = 'primeiro_contato'      then coalesce(c.ts_primeiro_contato,  new.created_at) else c.ts_primeiro_contato  end,
    ts_primeira_resposta = case when new.tipo = 'resposta_candidato'    then coalesce(c.ts_primeira_resposta, new.created_at) else c.ts_primeira_resposta end,
    ts_qualificado       = case when new.tipo = 'condicoes_respondidas' then coalesce(c.ts_qualificado,       new.created_at) else c.ts_qualificado       end,
    -- Guarda QUANDO É a reunião (payload.horario), não quando foi marcada: a fila
    -- de ação procura "reunião amanhã sem confirmação" por esta coluna. Sem
    -- horario no payload, cai no created_at. Horario malformado falha o INSERT
    -- do evento de propósito — dado ruim aqui vira reunião que ninguém confirma.
    ts_reuniao_agendada  = case when new.tipo = 'reuniao_agendada'      then coalesce((new.payload->>'horario')::timestamptz, new.created_at) else c.ts_reuniao_agendada  end,
    ts_reuniao_realizada = case when new.tipo = 'reuniao_realizada'     then coalesce(c.ts_reuniao_realizada, new.created_at) else c.ts_reuniao_realizada end,
    ts_matricula         = case when new.tipo = 'matricula_confirmada'  then coalesce(c.ts_matricula,         new.created_at) else c.ts_matricula         end,
    ts_onboard           = case when new.tipo = 'marco_ativacao'        then coalesce(c.ts_onboard,           new.created_at) else c.ts_onboard           end,
    ts_encerrado         = case when new.tipo = 'encerrado'             then new.created_at                                   else c.ts_encerrado         end
  where c.id = new.candidato_id;

  -- Estágio máximo alcançado. Encerrado vence tudo.
  -- Se cair em 'perdido' sem motivo_perda, ou em 'onboard' sem coordenador_id,
  -- as constraints acima recusam o INSERT do evento — é a regra, não um bug:
  -- a API grava o motivo/coordenador ANTES de gravar o evento.
  update public.recrut_candidato set
    estagio = (case
      when ts_encerrado         is not null then 'perdido'
      when ts_onboard           is not null then 'onboard'
      when ts_matricula         is not null then 'matricula'
      when ts_reuniao_realizada is not null then 'reuniao_realizada'
      when ts_qualificado       is not null then 'qualificado'
      when ts_primeira_resposta is not null then 'interacao'
      else 'lead'
    end)::recrut_estagio,
    updated_at = now()
  where id = new.candidato_id;

  return null;
end
$fn$;

-- O gatilho já existe (20260905) e aponta para esta função; não se recria.

-- ------------------------------------------------------------
-- Prova — sem inserir linha real: um evento de mentira apareceria na
-- timeline de um candidato de verdade.
-- ------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (
           SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'recrut_evento_tipo' AND e.enumlabel = 'estagio_retrocedido'
         ), 'recrut_evento_tipo sem o valor estagio_retrocedido (o BLOCO 1 rodou e foi commitado?)';
  ASSERT pg_get_functiondef('public.recrut_aplica_evento()'::regprocedure) LIKE '%estagio_retrocedido%',
         'recrut_aplica_evento sem o ramo de retroceder';
  ASSERT EXISTS (
           SELECT 1 FROM pg_trigger WHERE tgname = 'tr_recrut_aplica_evento' AND NOT tgisinternal
         ), 'gatilho tr_recrut_aplica_evento sumiu';
  RAISE NOTICE 'OK — retroceder etapa pronto';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Valor de enum não se remove no PostgreSQL; fica inofensivo sem o ramo.
-- Para desfazer a função, reaplicar a definição de
-- supabase/migrations/20260905_recrutamento.sql (seção "5 · Trigger").
