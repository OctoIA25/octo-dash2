-- Migration: Plantão com fila e aprendizado (P2.4)
-- Data: 2026-09-20
--
-- O plantão JÁ EXISTE e é muito usado: 1.540 perguntas em produção (Imobiliária
-- Japi, 03/07 a 27/08/2026), 1.498 respondidas. O que não existe é a TELA — hoje
-- a fila só vive no WhatsApp da LIA, e nada do que o corretor respondeu volta
-- para a base de conhecimento. Esta migration completa a tabela e entrega as
-- três consultas da tela.
--
-- O QUE NÃO SE MEXE, E POR QUÊ
-- `lia_perguntas_corretor` é escrita pelo n8n, fora deste repositório. Quatro
-- colunas que o plano nomeia já existem com outro nome:
--
--   plano            tabela hoje        decisão
--   enviada_para  →  corretor_id        mantida; renomear quebra a LIA calada
--   enviada_em    →  criado_em          mantida
--   resposta      →  resposta_corretor  mantida
--   'aguardando'  →  status='pendente'  mantido; "Aguardando" é o rótulo da ABA
--
-- Renomear qualquer uma delas derrubaria a escrita do n8n sem erro visível aqui
-- — a fila simplesmente pararia de encher. O nome do plano aparece onde importa:
-- na tela e no retorno das funções. Só entram as colunas que faltam de verdade.
--
-- O RELÓGIO COMEÇA EM `criado_em`, NÃO EM `escalated_at`
-- `escalated_at` é NULL em 61% das linhas. Já está documentado assim em
-- server/agent-telemetry/derive/escalations.js, que mede o mesmo tempo para a
-- Telemetria. Uma fonte por dado: a tela do plantão usa a mesma definição.
--
-- ORDEM DO DEPLOY: banco antes do front. A tela só lê pelas funções abaixo.
-- Rollback: as colunas novas são aditivas; dropá-las devolve o estado anterior.

-- ------------------------------------------------------------
-- 1. As colunas que faltavam
-- ------------------------------------------------------------

-- Opcional de propósito. O plano liga o plantão a empreendimento, mas as 1.540
-- perguntas reais são sobre imóveis avulsos (CA1095, AP1191, GA0048) e a Japi
-- não tem um único lançamento cadastrado. Exigir empreendimento deixaria a tela
-- vazia para quem mais usa o plantão. Onde falta, a tela diz o que falta.
ALTER TABLE public.lia_perguntas_corretor
  ADD COLUMN IF NOT EXISTS empreendimento_id uuid
    REFERENCES public.lancamentos(id) ON DELETE SET NULL;

-- O documento que nasceu desta resposta. É ESTE o fato guardado: `aprovada_para_base`
-- abaixo é derivado dele, para não existirem duas versões da mesma verdade — e para
-- que apagar o documento devolva a pergunta à fila de aprendizado sozinho.
ALTER TABLE public.lia_perguntas_corretor
  ADD COLUMN IF NOT EXISTS kb_documento_id uuid
    REFERENCES public.kb_documentos(id) ON DELETE SET NULL;

ALTER TABLE public.lia_perguntas_corretor
  ADD COLUMN IF NOT EXISTS aprovada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.lia_perguntas_corretor
  ADD COLUMN IF NOT EXISTS aprovada_em timestamptz;

-- O nome que o plano pede, sem ser um segundo lugar onde a verdade pode divergir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lia_perguntas_corretor'
      AND column_name = 'aprovada_para_base'
  ) THEN
    ALTER TABLE public.lia_perguntas_corretor
      ADD COLUMN aprovada_para_base boolean
        GENERATED ALWAYS AS (kb_documento_id IS NOT NULL) STORED;
  END IF;
END $$;

-- A fila é sempre lida por tenant + status, ordenada pelo relógio.
CREATE INDEX IF NOT EXISTS lia_perguntas_corretor_fila_idx
  ON public.lia_perguntas_corretor (tenant_id, status, criado_em DESC);

-- ------------------------------------------------------------
-- 2. A configuração do plantão
-- ------------------------------------------------------------
-- Quem recebe e quanto tempo pode esperar. Convenção da casa:
-- tenant_<assunto>_config, uma linha por imobiliária, colunas explícitas.
--
-- Sobre o padrão de 30 minutos: é o número do plano, e fica. Vale saber o que ele
-- significa contra o dado real — mediana de resposta 2h43, e só 31,6% das 1.498
-- respondidas vieram em até 30 min. A função `plantao_regua()` mede isso para a
-- imobiliária e a tela de Configurações mostra o resultado ao lado do campo, para
-- a régua ser escolhida com o número na frente em vez de no escuro.
CREATE TABLE IF NOT EXISTS public.tenant_plantao_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  espera_maxima_minutos int NOT NULL DEFAULT 30
    CHECK (espera_maxima_minutos BETWEEN 1 AND 10080),

  -- Quem recebe a pergunta. É valor CONSULTADO pela LIA, não regra executada
  -- aqui: quem envia ao corretor é ela. Mesma divisão decidida no P1.1 — a LIA
  -- distribui, o Octo responde.
  destino text NOT NULL DEFAULT 'corretor_do_lead'
    CHECK (destino IN ('corretor_do_lead', 'lider_da_equipe', 'plantonista')),

  plantonista_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- O pg_default_acl do Supabase concede tudo a anon em toda tabela nova; sem este
-- REVOKE a configuração nasceria gravável pela chave que vai no bundle.
REVOKE ALL ON public.tenant_plantao_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_plantao_config TO authenticated;
GRANT ALL ON public.tenant_plantao_config TO service_role;

ALTER TABLE public.tenant_plantao_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_plantao_config_select ON public.tenant_plantao_config;
CREATE POLICY tenant_plantao_config_select ON public.tenant_plantao_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS tenant_plantao_config_write ON public.tenant_plantao_config;
CREATE POLICY tenant_plantao_config_write ON public.tenant_plantao_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 3. A base de conhecimento aceita documento GERAL
-- ------------------------------------------------------------
-- Decisão de 20/09/2026. O P2.3 amarrou todo documento a um lançamento. Uma
-- resposta de plantão sobre imóvel avulso — 100% das 1.540 de hoje — não tem
-- lançamento nenhum, e o "Salvar na base" nasceria morto.
--
-- Documento sem lançamento é conhecimento da IMOBILIÁRIA: aceita pet, horário
-- de visita, como funciona a análise de cadastro. Vale para qualquer pergunta,
-- e por isso a busca passa a somá-lo sempre (ver item 4).
ALTER TABLE public.kb_documentos ALTER COLUMN lancamento_id DROP NOT NULL;
ALTER TABLE public.kb_trechos    ALTER COLUMN lancamento_id DROP NOT NULL;

-- Os índices por lançamento não cobrem o trecho geral; a busca por tenant precisa
-- do seu.
CREATE INDEX IF NOT EXISTS kb_trechos_tenant_geral_idx
  ON public.kb_trechos (tenant_id) WHERE lancamento_id IS NULL;

-- ------------------------------------------------------------
-- 3b. DOIS DEFEITOS DA BUSCA, ENCONTRADOS NO NAVEGADOR
-- ------------------------------------------------------------
-- Salvei uma resposta de plantão pela tela e perguntei como o cliente
-- perguntaria — "posso visitar no sabado?". A busca não achou nada, com o
-- trecho gravado e indexado. Duas causas, ambas do P2.3 (commit 0549ce6):
--
-- 1. TODAS AS PALAVRAS ERAM EXIGIDAS JUNTAS. `websearch_to_tsquery` devolve
--    `'poss' & 'visit' & 'sáb'`, e "posso" não está no texto — então nada casa.
--    Das seis formas naturais de fazer a mesma pergunta, só duas achavam.
--
-- 2. ACENTO DECIDIA. "sabado" gera o radical 'sab' e o texto guarda 'sáb': não
--    casam. Cliente digita sem acento o tempo todo.
--
-- Nenhum dos dois aparecia nos testes porque os testes perguntavam com as
-- palavras exatas do documento — que é o único jeito de perguntar que ninguém
-- usa de verdade.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- `unaccent()` é STABLE (depende do dicionário), e índice exige IMMUTABLE. A
-- forma de dois argumentos fixa o dicionário, e aí a promessa é verdadeira.
CREATE OR REPLACE FUNCTION public.sem_acento(text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO 'public'
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- O índice passa a guardar o texto sem acento — senão a consulta sem acento
-- não o alcança.
DROP INDEX IF EXISTS public.kb_trechos_texto_fts_idx;
CREATE INDEX kb_trechos_texto_fts_idx
  ON public.kb_trechos
  USING gin (to_tsvector('portuguese', public.sem_acento(texto)));

-- ------------------------------------------------------------
-- 4. A busca soma os documentos gerais
-- ------------------------------------------------------------
-- Assinatura muda (entra p_tenant_id), então é DROP + CREATE: um CREATE OR REPLACE
-- criaria uma SEGUNDA função sobrecarregada, e a chamada por nome viraria ambígua.
-- As DUAS assinaturas: a de 4 argumentos (P2.3) e a de 5 (esta). Sem dropar
-- também a nova, reaplicar a migration morre em "already exists with same
-- argument types" — encontrado ao restaurar o banco depois de uma sabotagem.
DROP FUNCTION IF EXISTS public.buscar_kb(uuid, text, int, vector);
DROP FUNCTION IF EXISTS public.buscar_kb(uuid, text, int, vector, uuid);

CREATE FUNCTION public.buscar_kb(
  p_lancamento_id uuid,
  p_pergunta      text,
  p_k             int DEFAULT 5,
  p_embedding     vector DEFAULT NULL,
  -- Obrigatório quando não há lançamento (pergunta geral). Ignorado quando há:
  -- nesse caso o tenant vem do próprio lançamento, que ninguém pode forjar.
  p_tenant_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  trecho_id uuid,
  documento_id uuid,
  documento_titulo text,
  documento_tipo text,
  texto text,
  /** 0 a 1. Quanto maior, mais parecido. */
  semelhanca real,
  /** 'significado' ou 'palavra' — a tela precisa poder dizer qual foi usada. */
  modo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_k int := LEAST(GREATEST(COALESCE(p_k, 5), 1), 50);
  v_pergunta text := btrim(COALESCE(p_pergunta, ''));
  v_tem_embedding boolean;
  v_tsq_e  tsquery;   -- todas as palavras
  v_tsq_ou tsquery;   -- qualquer palavra
  v_tsq    tsquery;
BEGIN
  IF p_lancamento_id IS NOT NULL THEN
    SELECT l.tenant_id INTO v_tenant FROM lancamentos l WHERE l.id = p_lancamento_id;
  ELSE
    v_tenant := p_tenant_id;
  END IF;
  IF v_tenant IS NULL THEN RETURN; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = v_tenant
     )
  THEN
    RETURN;
  END IF;

  -- Só vale documento ATIVO e DENTRO DA VALIDADE. Um memorial vencido
  -- responderia com condição que não existe mais, e a LIA repetiria ao
  -- cliente como se fosse de hoje.
  --
  -- O trecho entra quando é DO lançamento perguntado ou GERAL da imobiliária.
  -- `d.tenant_id = v_tenant` guarda os dois casos: sem ele, o trecho geral de
  -- outra imobiliária entraria na resposta desta.
  v_tem_embedding := p_embedding IS NOT NULL AND EXISTS (
    SELECT 1 FROM kb_trechos t
    JOIN kb_documentos d ON d.id = t.documento_id
    WHERE d.tenant_id = v_tenant
      AND (t.lancamento_id = p_lancamento_id OR t.lancamento_id IS NULL)
      AND t.embedding IS NOT NULL
      AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
  );

  IF v_tem_embedding THEN
    RETURN QUERY
    SELECT t.id, d.id, d.titulo, d.tipo, t.texto,
           (1 - (t.embedding <=> p_embedding))::real,
           'significado'::text
    FROM kb_trechos t
    JOIN kb_documentos d ON d.id = t.documento_id
    WHERE d.tenant_id = v_tenant
      AND (t.lancamento_id = p_lancamento_id OR t.lancamento_id IS NULL)
      AND t.embedding IS NOT NULL
      AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
    ORDER BY t.embedding <=> p_embedding
    LIMIT v_k;
    RETURN;
  END IF;

  IF v_pergunta = '' THEN RETURN; END IF;

  -- Duas consultas a partir da MESMA pergunta, já sem acento:
  --   v_tsq_e  — todas as palavras ('visit' & 'sáb'): preciso
  --   v_tsq_ou — qualquer palavra ('visit' | 'sáb'):  abrangente
  --
  -- Os radicais do OU saem de `to_tsvector`, que já descarta as palavras vazias
  -- ("no", "de", "o"). `quote_literal` é o que impede a pergunta do cliente de
  -- virar operador de tsquery.
  v_tsq_e := websearch_to_tsquery('portuguese', public.sem_acento(v_pergunta));

  SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery
    INTO v_tsq_ou
    FROM unnest(to_tsvector('portuguese', public.sem_acento(v_pergunta)));

  IF v_tsq_e IS NULL AND v_tsq_ou IS NULL THEN RETURN; END IF;

  -- Tenta o preciso; só afrouxa quando ele não acha NADA. Assim a pergunta bem
  -- formulada continua trazendo só o que casa inteiro, e a pergunta solta
  -- ("posso visitar no sabado?") ainda encontra a resposta — ordenada pelo
  -- ranking, que põe na frente o trecho que casou mais palavras.
  IF v_tsq_e IS NOT NULL AND EXISTS (
    SELECT 1 FROM kb_trechos t
    JOIN kb_documentos d ON d.id = t.documento_id
    WHERE d.tenant_id = v_tenant
      AND (t.lancamento_id = p_lancamento_id OR t.lancamento_id IS NULL)
      AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
      AND to_tsvector('portuguese', public.sem_acento(t.texto)) @@ v_tsq_e
  ) THEN
    v_tsq := v_tsq_e;
  ELSE
    v_tsq := v_tsq_ou;
  END IF;

  RETURN QUERY
  SELECT t.id, d.id, d.titulo, d.tipo, t.texto,
         ts_rank(to_tsvector('portuguese', public.sem_acento(t.texto)), v_tsq)::real,
         'palavra'::text
  FROM kb_trechos t
  JOIN kb_documentos d ON d.id = t.documento_id
  WHERE d.tenant_id = v_tenant
    AND (t.lancamento_id = p_lancamento_id OR t.lancamento_id IS NULL)
    AND d.ativo AND (d.valido_ate IS NULL OR d.valido_ate >= current_date)
    AND to_tsvector('portuguese', public.sem_acento(t.texto)) @@ v_tsq
  ORDER BY 6 DESC
  LIMIT v_k;
END;
$function$;

REVOKE ALL ON FUNCTION public.buscar_kb(uuid, text, int, vector, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_kb(uuid, text, int, vector, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. A fila — o que as três abas mostram
-- ------------------------------------------------------------
-- Por que função e não SELECT direto: `lia_perguntas_corretor` foi REVOGADA de
-- `authenticated` em 18/09 (migration 20260918_rls_fecha_tabelas_lia), porque
-- carrega telefone de cliente. A tela não pode ler a tabela — lê esta função,
-- que devolve só o tenant de quem chama e só as colunas da tela.
--
-- Devolve jsonb e não SETOF: os contadores das três abas vêm junto das linhas,
-- numa chamada só. E jsonb não passa pelo teto de 1.000 linhas do PostgREST,
-- que já escondeu 645 conversas no P1.9.
--
-- O relógio NÃO é calculado aqui. A função devolve `criado_em` e a tela conta os
-- minutos, como o Painel de Distribuição do P1.3: assim o relógio anda sozinho,
-- sem ida ao servidor a cada segundo.
CREATE OR REPLACE FUNCTION public.plantao_fila(
  p_tenant_id uuid,
  p_aba       text DEFAULT 'aguardando',
  p_limite    int  DEFAULT 200,
  p_dias      int  DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_aba text := COALESCE(NULLIF(btrim(p_aba), ''), 'aguardando');
  v_cfg record;
  v_contadores jsonb;
  v_linhas jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- Mesma checagem de get_tenant_members: SECURITY DEFINER passa por cima da RLS,
  -- então a pertinência é conferida à mão. Sem isto, qualquer usuário logado leria
  -- o plantão — com telefone de cliente — de qualquer imobiliária.
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT espera_maxima_minutos, destino, plantonista_id
    INTO v_cfg
    FROM tenant_plantao_config WHERE tenant_id = p_tenant_id;

  -- Contadores das TRÊS abas sempre, seja qual for a aba pedida: as abas mostram
  -- o número mesmo quando não são a aba aberta.
  SELECT jsonb_build_object(
           'aguardando',  count(*) FILTER (WHERE p.status = 'pendente'),
           'respondidas', count(*) FILTER (WHERE p.status = 'respondida'),
           'expiradas',   count(*) FILTER (WHERE p.status = 'expirada'),
           'na_janela',   count(*),
           -- Quantas ainda não viraram conhecimento. É o tamanho da dívida de
           -- aprendizado, e o motivo da aba "Mais perguntadas" existir.
           'por_aprender', count(*) FILTER (
             WHERE p.status = 'respondida' AND p.kb_documento_id IS NULL
           ),
           'sem_empreendimento', count(*) FILTER (WHERE p.empreendimento_id IS NULL)
         )
    INTO v_contadores
    FROM lia_perguntas_corretor p
   WHERE p.tenant_id = p_tenant_id AND p.criado_em >= v_desde;

  -- "Aguardando" inclui as expiradas: uma pergunta que estourou o prazo continua
  -- sem resposta e continua sendo problema do gestor. Escondê-la faria a fila
  -- parecer limpa exatamente quando não está.
  SELECT COALESCE(jsonb_agg(linha ORDER BY ordem), '[]'::jsonb)
    INTO v_linhas
    FROM (
      SELECT
        CASE WHEN v_aba = 'aguardando' THEN p.criado_em ELSE COALESCE(p.respondida_em, p.criado_em) END AS ordem,
        jsonb_build_object(
          'id', p.id,
          'pergunta', p.pergunta,
          'contexto', p.contexto,
          'status', p.status,
          'criado_em', p.criado_em,
          'respondida_em', p.respondida_em,
          'resposta', p.resposta_corretor,
          'nudges', p.nudge_count,
          'lead_id', p.lead_id,
          'lead_nome', l.name,
          'corretor_id', p.corretor_id,
          'corretor_nome', up.full_name,
          'corretor_email', up.email,
          'empreendimento_id', p.empreendimento_id,
          'empreendimento_nome', lan.nome,
          'kb_documento_id', p.kb_documento_id,
          'aprovada_para_base', p.aprovada_para_base,
          'aprovada_em', p.aprovada_em,
          -- 331 das 1.540 respostas começam com "[resolvida fora do canal]": o
          -- corretor falou direto com o cliente e escreveu só o aviso. Não é
          -- resposta à pergunta, e salvar isso na base ensinaria a LIA a dizer
          -- "resolvida fora do canal" ao próximo cliente.
          'fora_do_canal', p.resposta_corretor LIKE '[resolvida fora do canal]%'
        ) AS linha
      FROM lia_perguntas_corretor p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN user_profiles up
             ON p.corretor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND up.id = p.corretor_id::uuid
      LEFT JOIN lancamentos lan ON lan.id = p.empreendimento_id
      WHERE p.tenant_id = p_tenant_id
        AND p.criado_em >= v_desde
        AND CASE v_aba
              WHEN 'aguardando'  THEN p.status IN ('pendente', 'expirada')
              WHEN 'respondidas' THEN p.status = 'respondida'
              ELSE true
            END
      ORDER BY 1 DESC
      LIMIT v_limite
    ) s;

  RETURN jsonb_build_object(
    'aba', v_aba,
    'espera_maxima_minutos', COALESCE(v_cfg.espera_maxima_minutos, 30),
    'destino', COALESCE(v_cfg.destino, 'corretor_do_lead'),
    'plantonista_id', v_cfg.plantonista_id,
    'configurado', v_cfg.espera_maxima_minutos IS NOT NULL,
    'dias', LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730),
    'limite', v_limite,
    'contadores', v_contadores,
    'linhas', v_linhas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.plantao_fila(uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_fila(uuid, text, int, int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. O que a régua faz — medido, não suposto
-- ------------------------------------------------------------
-- Para a tela de Configurações mostrar, ao lado do campo de espera máxima, o que
-- aquele número teria feito com o plantão real da imobiliária. É a diferença
-- entre escolher 30 minutos porque o plano sugeriu e escolher sabendo que 30
-- minutos marcam 68% dos seus plantões como atrasados.
--
-- Mediana, nunca média: a distribuição é de cauda longa (P50 2h43, P95 7 dias) e
-- a média mentiria. Mesma decisão já tomada em escalations.js.
CREATE OR REPLACE FUNCTION public.plantao_regua(
  p_tenant_id uuid,
  p_minutos   int,
  p_dias      int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_minutos int := GREATEST(COALESCE(p_minutos, 30), 1);
  v_total int;
  v_dentro int;
  v_mediana numeric;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE extract(epoch FROM (respondida_em - criado_em)) / 60 <= v_minutos),
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM (respondida_em - criado_em)) / 60
         )
    INTO v_total, v_dentro, v_mediana
    FROM lia_perguntas_corretor
   WHERE tenant_id = p_tenant_id
     AND status = 'respondida'
     AND respondida_em IS NOT NULL
     AND respondida_em >= criado_em   -- o relógio do n8n às vezes inverte
     AND criado_em >= v_desde;

  RETURN jsonb_build_object(
    'minutos', v_minutos,
    'dias', LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730),
    'respondidas', v_total,
    'dentro_do_prazo', v_dentro,
    -- NULL e não 0 quando não há amostra: zero por cento diria "nenhuma cumpriu",
    -- e a verdade é "não houve plantão para medir". Foi assim que a visit_date
    -- enganou todo mundo por meses.
    'pct_dentro', CASE WHEN v_total > 0 THEN round(v_dentro * 100.0 / v_total, 1) END,
    'mediana_minutos', CASE WHEN v_total > 0 THEN round(v_mediana) END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.plantao_regua(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_regua(uuid, int, int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 7. O ciclo fecha: a resposta vira conhecimento
-- ------------------------------------------------------------
-- O critério do plano é "depois de salva na base, a mesma pergunta é respondida
-- pela LIA sem plantão". Para isso a resposta precisa estar BUSCÁVEL na hora —
-- por isso esta função grava o documento E o trecho, já indexado por palavra.
--
-- Esperar a LIA indexar deixaria o ciclo aberto: o gestor salvaria, a próxima
-- pergunta igual abriria plantão de novo, e ninguém entenderia por quê. Se a LIA
-- depois reindexar o documento com embedding, a rota /kb/documentos/:id/trechos
-- substitui este trecho — reindexar é refazer.
--
-- Uma transação só: documento, trecho e marcação da pergunta. Metade disto
-- gravado deixaria uma pergunta marcada como aprendida apontando para um
-- documento que não existe.
CREATE OR REPLACE FUNCTION public.plantao_salvar_na_base(
  p_pergunta_id text,
  p_titulo      text,
  p_conteudo    text,
  p_valido_ate  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_p record;
  v_titulo text := btrim(COALESCE(p_titulo, ''));
  v_conteudo text := btrim(COALESCE(p_conteudo, ''));
  v_doc uuid;
BEGIN
  SELECT id, tenant_id, pergunta, resposta_corretor, empreendimento_id, kb_documento_id
    INTO v_p
    FROM lia_perguntas_corretor
   WHERE id = p_pergunta_id;

  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'pergunta_nao_encontrada');
  END IF;

  IF v_caller IS NULL
     OR (NOT public.is_platform_owner()
         AND NOT EXISTS (
           SELECT 1 FROM tenant_memberships tm
           WHERE tm.user_id = v_caller AND tm.tenant_id = v_p.tenant_id
         ))
  THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  END IF;

  -- Já salva: devolve o documento existente em vez de criar um segundo. Dois
  -- cliques no botão criariam duas respostas iguais na base, e a busca passaria
  -- a devolver a mesma coisa duas vezes.
  IF v_p.kb_documento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'documento_id', v_p.kb_documento_id, 'ja_existia', true);
  END IF;

  IF v_conteudo = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conteudo_vazio');
  END IF;
  IF v_titulo = '' THEN
    v_titulo := left(v_p.pergunta, 120);
  END IF;

  INSERT INTO kb_documentos (
    tenant_id, lancamento_id, titulo, tipo, conteudo, valido_ate,
    status_indexacao, qtd_trechos
  ) VALUES (
    v_p.tenant_id,
    v_p.empreendimento_id,   -- NULL = conhecimento geral da imobiliária
    v_titulo,
    'resposta_plantao',
    v_conteudo,
    p_valido_ate,
    'indexado',
    1
  )
  RETURNING id INTO v_doc;

  -- A pergunta entra junto do texto: quem procurar com as palavras da PERGUNTA
  -- ("tem elevador?") acha o trecho, mesmo que a resposta tenha sido "não, esse
  -- prédio é de três andares" e não repita a palavra.
  INSERT INTO kb_trechos (tenant_id, documento_id, lancamento_id, ordem, texto)
  VALUES (v_p.tenant_id, v_doc, v_p.empreendimento_id, 0,
          v_p.pergunta || E'\n\n' || v_conteudo);

  UPDATE lia_perguntas_corretor
     SET kb_documento_id = v_doc,
         aprovada_por    = v_caller,
         aprovada_em     = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object('ok', true, 'documento_id', v_doc, 'ja_existia', false,
                            'geral', v_p.empreendimento_id IS NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.plantao_salvar_na_base(text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_salvar_na_base(text, text, text, date) TO authenticated, service_role;
