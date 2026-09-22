-- ============================================================
-- P4.8 — Atas de reunião
--
-- O item tem a MESMA FORMA do P4.7, e por isso reusa o mesmo desenho: a IA
-- estrutura, uma pessoa revisa, e só depois aquilo vira coisa de verdade. O
-- plano diz com todas as letras — "revisão humana antes de criar as tarefas".
--
-- E reusa também a mesma divisão de trabalho: a Dash guarda a transcrição e
-- faz a revisão; quem lê é a LIA, que devolve o conteúdo estruturado por rota
-- autenticada. Medido em 22/09: esta Dash não chama modelo nenhum.
--
-- O QUE FOI MEDIDO ANTES DE ESCREVER:
--   · a agenda viva é `agenda_eventos` (28 linhas), e a chave dela é o E-MAIL
--     do corretor, não o identificador — `corretor_email` é NOT NULL e
--     `corretor_id` é texto anulável;
--   · ela já aceita `tipo = 'tarefa'`, então a tarefa da ata não inventa um
--     tipo novo: entra onde as outras tarefas já moram;
--   · `tarefas_semanais` se sincroniza a partir da agenda, então a tarefa
--     aparece também em "Tarefas da Semana" sem código novo.
--
-- A ARMADILHA DESTE ITEM É O RESPONSÁVEL. A transcrição diz "a Ana fica de
-- mandar a proposta". "Ana" não é uma pessoa no banco — é uma palavra. Criar a
-- tarefa adivinhando quem é "Ana" é a forma mais fácil de a tarefa nascer no
-- colo da pessoa errada, ou de ninguém. Por isso a ata guarda O QUE FOI DITO e
-- exige que uma pessoa aponte quem é, antes de criar qualquer coisa.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A ata
--
-- Decisões, riscos e mapa mental moram aqui como lista, e não em tabelas
-- próprias: ninguém consulta "todas as decisões de todas as atas", e três
-- tabelas a mais seriam três telas a mais para manter.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT '',
  data_reuniao date,
  -- O texto que entrou. Fica guardado para quem quiser conferir o que foi dito
  -- contra o que a ata resumiu — que é a única forma de checar o resumo.
  transcricao text NOT NULL DEFAULT '',
  participantes text[] NOT NULL DEFAULT '{}',
  resumo text NOT NULL DEFAULT '',
  decisoes text[] NOT NULL DEFAULT '{}',
  riscos text[] NOT NULL DEFAULT '{}',
  -- [{"nivel":1,"texto":"..."}, ...] — lista hierárquica, como o plano pede.
  mapa jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'lida', 'revisada')),
  lido_por text CHECK (lido_por IN ('ia')),
  lido_em timestamptz,
  erro_leitura text NOT NULL DEFAULT '',
  -- Vínculo opcional, como o plano pede.
  equipe text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  -- Preenchido quando uma pessoa aperta "Criar tarefas". É o que impede o lote
  -- de ser criado duas vezes.
  tarefas_criadas_em timestamptz,
  tarefas_criadas_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atas_tenant_idx ON public.atas (tenant_id, data_reuniao DESC NULLS LAST);

-- ------------------------------------------------------------
-- As tarefas da ata
--
-- Ainda NÃO são tarefas: são linhas da ata esperando revisão. Viram tarefa de
-- verdade quando `agenda_evento_id` deixa de ser nulo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id uuid NOT NULL REFERENCES public.atas(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  -- O QUE A TRANSCRIÇÃO DISSE. "Ana", "o Diego", "o jurídico". Guardado
  -- literal, porque é o que permite a pessoa conferir se o apontamento está
  -- certo — e porque um nome solto não é ninguém.
  responsavel_texto text NOT NULL DEFAULT '',
  -- QUEM É, de verdade. Só uma pessoa preenche, pela tela.
  responsavel_email text,
  prazo date,
  ordem integer NOT NULL DEFAULT 0,
  -- A tarefa que nasceu daqui. Nulo enquanto ninguém criou.
  agenda_evento_id uuid,
  descartada boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ata_tarefas_ata_idx ON public.ata_tarefas (ata_id, ordem);

-- ------------------------------------------------------------
-- Fechado para o navegador
-- ------------------------------------------------------------
REVOKE ALL ON public.atas, public.ata_tarefas FROM anon, authenticated;
GRANT ALL ON public.atas, public.ata_tarefas TO service_role;
ALTER TABLE public.atas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_tarefas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- QUEM PODE VER
--
-- Ata de reunião guarda a conversa inteira da gestão. Vê quem administra ou
-- lidera equipe; o corretor recebe a TAREFA na agenda dele, não a ata. O que
-- foi decidido sobre ele não é a mesma coisa que o que ele tem a fazer.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_pode_ver(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id)
          OR EXISTS (SELECT 1 FROM tenant_memberships m
                      WHERE m.tenant_id = p_tenant_id AND m.user_id = auth.uid()
                        AND m.role = 'team_leader'));
$function$;

-- ============================================================
-- CRIAR A ATA A PARTIR DA TRANSCRIÇÃO
--
-- Só guarda o texto e abre a linha. A ata nasce vazia e fica "enviada" até
-- alguém (a LIA) ler. Uma ata pode ser preenchida à mão: a leitura automática
-- poupa trabalho, não é pré-requisito.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_criar(
  p_tenant_id uuid,
  p_titulo text,
  p_data_reuniao date,
  p_transcricao text,
  p_equipe text DEFAULT '',
  p_lead_id uuid DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.ata_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF length(btrim(COALESCE(p_transcricao, ''))) < 40 THEN
    RAISE EXCEPTION 'A transcrição está vazia ou curta demais para virar ata.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO atas (tenant_id, titulo, data_reuniao, transcricao, equipe,
                    lead_id, proposal_id, criado_por)
  VALUES (p_tenant_id,
          COALESCE(NULLIF(btrim(p_titulo), ''), 'Reunião sem título'),
          p_data_reuniao, p_transcricao, COALESCE(p_equipe, ''),
          p_lead_id, p_proposal_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ata_id', v_id);
END;
$function$;

-- ============================================================
-- A LEITURA CHEGA
--
-- Substitui o conteúdo anterior: reler é refazer.
--
-- A REGRA QUE VALE AQUI, IGUAL À DO P4.7: isto NÃO cria tarefa nenhuma. Ela
-- escreve as linhas da ata e deixa `agenda_evento_id` nulo. Quem cria é uma
-- pessoa, depois de revisar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_conteudo_recebido(
  p_ata_id uuid,
  p_conteudo jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ata public.atas%ROWTYPE;
  v_tarefas integer := 0;
  x jsonb;
  i integer := 0;
BEGIN
  SELECT * INTO v_ata FROM atas WHERE id = p_ata_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_ata.tarefas_criadas_em IS NOT NULL THEN
    RAISE EXCEPTION 'As tarefas desta ata já foram criadas; reler apagaria o que uma pessoa revisou.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE atas
     SET titulo = COALESCE(NULLIF(btrim(COALESCE(p_conteudo->>'titulo','')), ''), titulo),
         data_reuniao = COALESCE((NULLIF(p_conteudo->>'data',''))::date, data_reuniao),
         participantes = COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(p_conteudo->'participantes')), '{}'),
         resumo = COALESCE(p_conteudo->>'resumo', ''),
         decisoes = COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(p_conteudo->'decisoes')), '{}'),
         riscos = COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(p_conteudo->'riscos')), '{}'),
         mapa = CASE WHEN jsonb_typeof(p_conteudo->'mapa') = 'array'
                     THEN p_conteudo->'mapa' ELSE '[]'::jsonb END,
         status = 'lida', lido_por = 'ia', lido_em = now(), erro_leitura = ''
   WHERE id = p_ata_id;

  -- Reler refaz: as linhas anteriores saem, porque somar duplicaria a lista.
  DELETE FROM ata_tarefas WHERE ata_id = p_ata_id;

  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(p_conteudo->'tarefas', '[]'::jsonb)) LOOP
    IF COALESCE(btrim(x->>'descricao'), '') = '' THEN CONTINUE; END IF;
    i := i + 1;
    INSERT INTO ata_tarefas (ata_id, descricao, responsavel_texto, prazo, ordem)
    VALUES (p_ata_id, btrim(x->>'descricao'),
            COALESCE(btrim(x->>'responsavel'), ''),
            -- Prazo ilegível não derruba a ata: fica em branco para a pessoa pôr.
            (SELECT CASE WHEN (x->>'prazo') ~ '^\d{4}-\d{2}-\d{2}$'
                         THEN (x->>'prazo')::date END),
            i);
    v_tarefas := v_tarefas + 1;
  END LOOP;

  RETURN jsonb_build_object('tarefas', v_tarefas, 'status', 'lida');
END;
$function$;

-- ============================================================
-- A REVISÃO
--
-- A pessoa aponta quem é cada "Ana" e ajusta prazo e texto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_tarefa_revisar(
  p_tarefa_id uuid,
  p_descricao text DEFAULT NULL,
  p_responsavel_email text DEFAULT NULL,
  p_prazo date DEFAULT NULL,
  p_descartada boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_t public.ata_tarefas%ROWTYPE;
  v_tenant uuid;
BEGIN
  SELECT * INTO v_t FROM ata_tarefas WHERE id = p_tarefa_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT tenant_id INTO v_tenant FROM atas WHERE id = v_t.ata_id;
  IF NOT public.ata_pode_ver(v_tenant) THEN RETURN NULL; END IF;
  IF v_t.agenda_evento_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta tarefa já foi criada na agenda; altere-a por lá.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- O responsável tem de ser gente DESTA imobiliária. Um e-mail digitado à mão
  -- que não é de ninguém criaria uma tarefa que nunca aparece para ninguém.
  IF p_responsavel_email IS NOT NULL AND btrim(p_responsavel_email) <> ''
     AND NOT EXISTS (SELECT 1 FROM tenant_memberships m
                     JOIN auth.users u ON u.id = m.user_id
                     WHERE m.tenant_id = v_tenant
                       AND lower(u.email) = lower(btrim(p_responsavel_email))) THEN
    RAISE EXCEPTION 'Não há ninguém nesta imobiliária com o e-mail %.', btrim(p_responsavel_email)
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ata_tarefas
     SET descricao = COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), descricao),
         responsavel_email = CASE
           WHEN p_responsavel_email IS NULL THEN responsavel_email
           WHEN btrim(p_responsavel_email) = '' THEN NULL
           ELSE lower(btrim(p_responsavel_email)) END,
         prazo = COALESCE(p_prazo, prazo),
         descartada = COALESCE(p_descartada, descartada)
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('revisada', true);
END;
$function$;

-- ============================================================
-- CRIAR AS TAREFAS — o único ponto em que a ata vira trabalho
--
-- Recusa o lote inteiro se faltar responsável em alguma, e DIZ QUAIS. Criar as
-- que dá e calar sobre as outras faria a reunião terminar com tarefas
-- perdidas que ninguém procura — que é exatamente o que a ata existe para
-- evitar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_criar_tarefas(p_ata_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ata public.atas%ROWTYPE;
  v_sem_dono jsonb;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  t record;
  v_evento uuid;
  v_criadas integer := 0;
BEGIN
  SELECT * INTO v_ata FROM atas WHERE id = p_ata_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.ata_pode_ver(v_ata.tenant_id) THEN RETURN NULL; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Criar as tarefas é decisão de uma pessoa: o servidor não cria.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ata.tarefas_criadas_em IS NOT NULL THEN
    RETURN jsonb_build_object('criadas', 0, 'ja_criadas', true);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'descricao', descricao,
           'responsavel_texto', NULLIF(responsavel_texto, '')))
    INTO v_sem_dono
    FROM ata_tarefas
   WHERE ata_id = p_ata_id AND NOT descartada
     AND COALESCE(responsavel_email, '') = '';

  IF v_sem_dono IS NOT NULL THEN
    RETURN jsonb_build_object('criadas', 0, 'sem_responsavel', v_sem_dono);
  END IF;

  FOR t IN SELECT * FROM ata_tarefas
            WHERE ata_id = p_ata_id AND NOT descartada AND agenda_evento_id IS NULL
            ORDER BY ordem
  LOOP
    INSERT INTO agenda_eventos
      (tenant_id, corretor_email, titulo, descricao, data, tipo, status, prioridade, lead_uuid)
    VALUES (v_ata.tenant_id, t.responsavel_email,
            left(t.descricao, 120),
            format('Da reunião "%s"%s.', v_ata.titulo,
                   CASE WHEN COALESCE(t.responsavel_texto,'') <> ''
                        THEN format(' — combinado com %s', t.responsavel_texto) ELSE '' END),
            -- Sem prazo, a tarefa nasce para hoje: uma tarefa sem data some da
            -- agenda, e a reunião decidiu que ela existe.
            COALESCE(t.prazo, v_hoje),
            'tarefa', 'pendente', 'media', v_ata.lead_id)
    RETURNING id INTO v_evento;

    UPDATE ata_tarefas SET agenda_evento_id = v_evento WHERE id = t.id;
    v_criadas := v_criadas + 1;
  END LOOP;

  UPDATE atas
     SET status = 'revisada', tarefas_criadas_em = now(), tarefas_criadas_por = auth.uid()
   WHERE id = p_ata_id;

  RETURN jsonb_build_object('criadas', v_criadas);
END;
$function$;

-- ============================================================
-- LEITURA
-- ============================================================
CREATE OR REPLACE FUNCTION public.ata_abrir(p_ata_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ata public.atas%ROWTYPE;
BEGIN
  SELECT * INTO v_ata FROM atas WHERE id = p_ata_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.ata_pode_ver(v_ata.tenant_id) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_ata.id, 'titulo', v_ata.titulo, 'data_reuniao', v_ata.data_reuniao,
    'participantes', to_jsonb(v_ata.participantes), 'resumo', v_ata.resumo,
    'decisoes', to_jsonb(v_ata.decisoes), 'riscos', to_jsonb(v_ata.riscos),
    'mapa', v_ata.mapa, 'status', v_ata.status, 'lido_por', v_ata.lido_por,
    'erro_leitura', v_ata.erro_leitura,
    'tarefas_criadas_em', v_ata.tarefas_criadas_em,
    'equipe', v_ata.equipe, 'lead_id', v_ata.lead_id,
    'transcricao', v_ata.transcricao,
    'tarefas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'descricao', t.descricao,
        'responsavel_texto', t.responsavel_texto,
        'responsavel_email', t.responsavel_email,
        'prazo', t.prazo, 'descartada', t.descartada,
        'na_agenda', t.agenda_evento_id IS NOT NULL
      ) ORDER BY t.ordem) FROM ata_tarefas t WHERE t.ata_id = p_ata_id
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.atas_lista(p_tenant_id uuid, p_limite integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ata_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'data_reuniao' DESC NULLS LAST, x->>'criado_em' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', a.id, 'titulo', a.titulo, 'data_reuniao', a.data_reuniao,
          'status', a.status, 'equipe', a.equipe, 'criado_em', a.criado_em,
          'tarefas', (SELECT count(*) FROM ata_tarefas t WHERE t.ata_id = a.id AND NOT t.descartada),
          'sem_responsavel', (SELECT count(*) FROM ata_tarefas t
                               WHERE t.ata_id = a.id AND NOT t.descartada
                                 AND COALESCE(t.responsavel_email,'') = ''),
          'tarefas_criadas', a.tarefas_criadas_em IS NOT NULL
        ) AS x
          FROM atas a
         WHERE a.tenant_id = p_tenant_id
         ORDER BY a.data_reuniao DESC NULLS LAST, a.criado_em DESC
         LIMIT GREATEST(COALESCE(p_limite, 50), 1)
      ) s
  ), '[]'::jsonb);
END;
$function$;

/** Quem pode receber tarefa: os membros da casa, por e-mail. */
CREATE OR REPLACE FUNCTION public.ata_responsaveis(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ata_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'email', lower(u.email),
      'nome', COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''), lower(u.email)),
      'papel', m.role
    ) ORDER BY lower(u.email))
      FROM tenant_memberships m JOIN auth.users u ON u.id = m.user_id
     WHERE m.tenant_id = p_tenant_id AND u.email IS NOT NULL
  ), '[]'::jsonb);
END;
$function$;

/** A LIA avisa que não conseguiu estruturar, para ninguém ficar esperando. */
CREATE OR REPLACE FUNCTION public.ata_leitura_falhou(p_ata_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE atas SET erro_leitura = left(COALESCE(p_motivo, ''), 500), status = 'enviada'
   WHERE id = p_ata_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('registrado', true);
END;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.ata_pode_ver(uuid)',
    'public.ata_criar(uuid, text, date, text, text, uuid, uuid)',
    'public.ata_tarefa_revisar(uuid, text, text, date, boolean)',
    'public.ata_criar_tarefas(uuid)',
    'public.ata_abrir(uuid)',
    'public.atas_lista(uuid, integer)',
    'public.ata_responsaveis(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- O conteúdo estruturado só entra pela rota da LIA. Se o navegador pudesse
  -- chamar, bastaria mandar o conteúdo e criar as tarefas em seguida — a
  -- revisão humana viraria um passo que dá para pular.
  FOREACH f IN ARRAY ARRAY[
    'public.ata_conteudo_recebido(uuid, jsonb)',
    'public.ata_leitura_falhou(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
