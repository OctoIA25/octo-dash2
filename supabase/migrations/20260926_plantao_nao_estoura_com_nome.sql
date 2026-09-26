-- ============================================================
-- A tela LIA › Plantão parava de abrir quando o corretor vinha como NOME
--
-- Achado pela equipe da Lia em 26/09, na análise dos 8 pedidos, e conferido
-- aqui em produção no mesmo dia:
--
--   select public.plantao_fila('<lotus>', 'respondidas', 50, 30)
--   ERROR: invalid input syntax for type uuid: "Fernanda Emilia"
--
-- Quatro das cinco abas morriam para a Lotus.
-- ============================================================
--
-- A CAUSA IMEDIATA É DELES; A QUE IMPORTA É NOSSA.
--
-- A Lia grava o nome do corretor em `corretor_id` — 11 de 11 linhas da Lotus.
-- Eles já vão corrigir. Mas o motivo de isso derrubar a TELA é nosso:
--
--     LEFT JOIN user_profiles up
--            ON p.corretor_id ~ '^[0-9a-f]{8}-...-[0-9a-f]{12}$'
--           AND up.id = p.corretor_id::uuid
--
-- A guarda está escrita. Ela não protege. O Postgres NÃO garante ordem de
-- avaliação entre as condições de um JOIN: o planejador pode rodar o cast
-- antes do regex, e roda.
--
-- Guarda que depende de curto-circuito numa condição de JOIN é guarda que não
-- existe — e é pior que nenhuma, porque quem lê acha que o caso está coberto.
-- É o mesmo defeito do aviso de truncagem que eu havia escrito contra o
-- limite errado (24/09): defesa presente, e por isso ninguém procura mais.
--
-- A correção TIRA o cast em vez de tentar ordenar a avaliação. Comparar
-- `up.id::text = p.corretor_id` não pode estourar com texto nenhum, e dá o
-- mesmo resultado para um uuid de verdade.
--
-- DE QUEBRA, A TELA MOSTRA O NOME. Antes, corretor fora do cadastro aparecia
-- em branco. Se a Lia escreveu "Fernanda Emilia", é isso que o gestor precisa
-- ler — e `corretor_cadastrado` diz se aquilo é uma pessoa do sistema ou só o
-- texto que chegou, para ninguém confundir os dois.
--
-- O RESTO DA FUNÇÃO É BYTE A BYTE O QUE JÁ ESTAVA NO AR. Reescrevê-la de
-- memória teria trocado os padrões (200/90 viraram 100/30), perdido os
-- contadores das abas e a leitura de `tenant_plantao_config` — tudo sem erro
-- nenhum na tela.
-- ============================================================

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
          'corretor_nome', COALESCE(up.full_name, NULLIF(btrim(p.corretor_id), '')),
          'corretor_cadastrado', up.id IS NOT NULL,
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
      -- SEM CAST, de proposito. A guarda por regex que estava aqui NAO
      -- protegia: o Postgres nao garante avaliar as condicoes de um JOIN em
      -- ordem, e o cast rodava antes do regex. Comparar texto com texto nunca
      -- estoura, e da o mesmo resultado para um uuid de verdade.
      LEFT JOIN user_profiles up ON up.id::text = lower(btrim(p.corretor_id))
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
COMMENT ON FUNCTION public.plantao_fila(uuid, text, integer, integer) IS
  'A fila do plantao da LIA. Casa o corretor comparando TEXTO, nunca com cast para uuid: a Lia grava nome em corretor_id e o cast derrubava 4 das 5 abas (26/09).';

REVOKE ALL ON FUNCTION public.plantao_fila(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_fila(uuid, text, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
