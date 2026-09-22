-- ============================================================
-- P4.7 — Leitura de documentos, com as 6 regras
--
-- O QUE FOI MEDIDO ANTES DE ESCREVER (produção, 22/09/2026):
--   · o bucket `lead-documentos` existe e tem ZERO arquivos;
--   · 134 proponentes, ZERO com CPF (a coluna guarda string vazia, não nulo);
--   · `leads.cpf` preenchido em 0 de 5.321;
--   · as abas Documentos e Certidões da proposta são checklists FALSOS —
--     pintam de verde pelo índice da lista contra um booleano da etapa, sem
--     olhar arquivo nenhum;
--   · não existe validação de dígito de CPF em lugar nenhum do repositório;
--   · a Dash NÃO chama modelo de IA: os dois caminhos OpenAI são código morto,
--     não há visão nem OCR, e o `.env.example` nem tem chave.
--
-- DAÍ AS DUAS DECISÕES QUE DÃO FORMA A ISTO:
--
--   1. QUEM LÊ É A LIA. Mesma divisão que já vale para a base de conhecimento
--      (server/baseConhecimento): a Dash guarda o arquivo e faz a conferência,
--      a LIA extrai os campos e devolve por rota autenticada. A Dash continua
--      sem chamar modelo nenhum — e a tela funciona igual se a LIA nunca
--      responder, com os campos em branco para a pessoa digitar.
--
--   2. A CHAVE É O LEAD, A JANELA É A PROPOSTA. O upload já existe em
--      `lead-documentos/<tenant>/<lead>`; a pasta do cliente é essa. A
--      proposta passa a ser a tela que a mostra, no lugar dos dois checklists
--      falsos.
--
-- A REGRA 1 É A QUE MANDA NO ARQUIVO INTEIRO: a IA nunca grava direto. Ela
-- escreve em `valor_sugerido`; `valor_final` só existe depois que uma pessoa
-- confirmou, e o banco recusa qualquer outro caminho.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- O catálogo de tipos e o que se espera de cada um (Regra 4)
--
-- É isto que vira o esquema fixo mandado à LIA: ela só pode responder nos
-- campos declarados aqui. Sem o catálogo, cada leitura devolveria um formato
-- diferente e a conferência viraria texto livre.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documento_tipos (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  -- Ordem em que aparece no checklist da pasta.
  ordem integer NOT NULL DEFAULT 100,
  -- Documento de identidade tem validade; holerite tem prazo; certidão também.
  valida_em_dias integer,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.documento_tipo_campos (
  tipo text NOT NULL REFERENCES public.documento_tipos(codigo) ON DELETE CASCADE,
  campo text NOT NULL,
  rotulo text NOT NULL,
  -- 'texto' | 'cpf' | 'cnpj' | 'data' | 'dinheiro'
  formato text NOT NULL DEFAULT 'texto'
    CHECK (formato IN ('texto', 'cpf', 'cnpj', 'data', 'dinheiro')),
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 100,
  PRIMARY KEY (tipo, campo)
);

-- ------------------------------------------------------------
-- O documento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documentos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- A pasta do cliente é a do lead. A proposta é só a janela.
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Guardado para a tela saber de qual negócio o documento veio; a pasta
  -- continua sendo do lead, porque o cliente é um só.
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  tipo text NOT NULL REFERENCES public.documento_tipos(codigo),
  -- Caminho dentro do bucket PRIVADO `lead-documentos` (Regra 5).
  arquivo text NOT NULL,
  arquivo_nome text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'enviado'
    CHECK (status IN ('enviado', 'lido', 'conferido', 'recusado')),
  -- Quem leu: 'ia' (a LIA), 'regra' (padrão aprendido, Regra 6) ou ninguém.
  lido_por text CHECK (lido_por IN ('ia', 'regra')),
  lido_em timestamptz,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conferido_em timestamptz,
  motivo_recusa text NOT NULL DEFAULT '',
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documentos_cliente_lead_idx
  ON public.documentos_cliente (tenant_id, lead_id, tipo);
-- O mesmo arquivo não entra duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_cliente_arquivo_uniq
  ON public.documentos_cliente (tenant_id, arquivo);

-- ------------------------------------------------------------
-- Os campos lidos (Regras 1, 2 e 3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documento_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_cliente(id) ON DELETE CASCADE,
  campo text NOT NULL,
  -- O que a IA (ou a regra) leu. NUNCA vai para o cadastro (Regra 1).
  valor_sugerido text,
  -- 0 a 1. Abaixo de 0,8 a tela pinta de amarelo (Regra 2).
  confianca numeric CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1)),
  -- O que a PESSOA confirmou. É o único valor que vale.
  valor_final text,
  validacao text NOT NULL DEFAULT 'ok' CHECK (validacao IN ('ok', 'alerta', 'erro')),
  mensagem text NOT NULL DEFAULT '',
  -- Como quem leu achou este campo NESTE documento. É o que permite aprender
  -- o layout (Regra 6): se a âncora acertar dez vezes seguidas, o próximo
  -- documento igual é lido por regra, sem IA e sem custo.
  ancora text,
  UNIQUE (documento_id, campo)
);

-- ------------------------------------------------------------
-- Os padrões aprendidos (Regra 6)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documento_padroes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL REFERENCES public.documento_tipos(codigo),
  campo text NOT NULL,
  -- A regra aprendida: como achar o campo naquele layout. Quem a deriva é a
  -- LIA, que é quem enxerga o documento; a Dash guarda e conta os acertos.
  ancora text NOT NULL,
  acertos integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'candidata'
    CHECK (estado IN ('candidata', 'ativa', 'suspensa')),
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, campo, ancora)
);

-- ------------------------------------------------------------
-- Fechado para o navegador
--
-- Tudo passa por função. Deixar o front escrever em `documento_campos` seria
-- deixar a Regra 1 ser contornada por quem abrir o console.
-- ------------------------------------------------------------
REVOKE ALL ON public.documentos_cliente, public.documento_campos,
              public.documento_padroes, public.documento_tipos,
              public.documento_tipo_campos FROM anon, authenticated;
GRANT ALL ON public.documentos_cliente, public.documento_campos,
             public.documento_padroes, public.documento_tipos,
             public.documento_tipo_campos TO service_role;

ALTER TABLE public.documentos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_padroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_tipo_campos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- O DÍGITO DO CPF (Regra 3)
--
-- Não existia validação de CPF em lugar nenhum do repositório — só máscara,
-- e o próprio arquivo da máscara diz isso em comentário. O teste dela usa
-- '12345678901', que é inválido, e passa.
--
-- Fica no BANCO, e só no banco, de propósito: é aqui que a confirmação passa,
-- e uma segunda implementação no navegador seria uma segunda verdade sobre o
-- mesmo dado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cpf_valido(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  d text := regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g');
  s integer;
  i integer;
BEGIN
  IF length(d) <> 11 THEN RETURN false; END IF;
  -- 111.111.111-11 e os outros dez passam na conta dos dígitos e não são CPF.
  IF d ~ '^(.)\1{10}$' THEN RETURN false; END IF;

  s := 0;
  FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::int * (11 - i); END LOOP;
  IF (s * 10) % 11 % 10 <> substr(d, 10, 1)::int THEN RETURN false; END IF;

  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::int * (12 - i); END LOOP;
  RETURN (s * 10) % 11 % 10 = substr(d, 11, 1)::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cnpj_valido(p_cnpj text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  d text := regexp_replace(COALESCE(p_cnpj, ''), '[^0-9]', '', 'g');
  -- TREZE pesos, e o primeiro dígito usa do segundo em diante. Com doze, o
  -- índice 13 vinha NULL, a soma virava NULL e a função devolvia NULL em vez
  -- de true ou false — e `NOT NULL` é NULL, então a validação inteira passava
  -- batido. Pego no navegador, não no teste: o teste usava `IF cnpj_valido(...)`,
  -- que também é cego a NULL.
  pesos int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s integer; i integer; dv integer;
BEGIN
  IF length(d) <> 14 THEN RETURN false; END IF;
  IF d ~ '^(.)\1{13}$' THEN RETURN false; END IF;

  s := 0;
  FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::int * pesos[i + 1]; END LOOP;
  dv := s % 11;
  dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
  IF dv <> substr(d, 13, 1)::int THEN RETURN false; END IF;

  s := 0;
  FOR i IN 1..13 LOOP s := s + substr(d, i, 1)::int * pesos[i]; END LOOP;
  dv := s % 11;
  dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
  RETURN dv = substr(d, 14, 1)::int;
END;
$function$;

/**
 * Tira acento sem depender da extensão `unaccent`, que não está instalada.
 *
 * "JOSE" e "JOSÉ" são a mesma pessoa; sem isto a comparação de nomes acusaria
 * erro em todo documento com acento — e o alerta que deveria pegar a troca de
 * arquivo viraria ruído que todo mundo ignora.
 */
CREATE OR REPLACE FUNCTION public.unaccent_ou_nao(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT translate(COALESCE(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
$function$;

-- ============================================================
-- AS VALIDAÇÕES (Regra 3)
--
-- Roda sobre o documento inteiro e grava `validacao` e `mensagem` em cada
-- campo. Chamada quando a LIA devolve e quando a pessoa edita — os dois
-- caminhos passam por aqui, então não há como um valor chegar ao final sem
-- ter sido olhado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_validar(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.documentos_cliente%ROWTYPE;
  v_valida_dias integer;
  c record;
  v_valor text;
  v_val text;
  v_msg text;
  v_data date;
  v_outro text;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT valida_em_dias INTO v_valida_dias FROM documento_tipos WHERE codigo = v_doc.tipo;

  FOR c IN
    SELECT dc.id, dc.campo, COALESCE(dc.valor_final, dc.valor_sugerido) AS valor,
           dc.confianca, tc.formato, tc.obrigatorio, tc.rotulo
      FROM documento_campos dc
      LEFT JOIN documento_tipo_campos tc ON tc.tipo = v_doc.tipo AND tc.campo = dc.campo
     WHERE dc.documento_id = p_documento_id
  LOOP
    v_valor := NULLIF(btrim(COALESCE(c.valor, '')), '');
    v_val := 'ok';
    v_msg := '';

    IF v_valor IS NULL THEN
      IF COALESCE(c.obrigatorio, false) THEN
        v_val := 'erro'; v_msg := format('%s não foi lido.', COALESCE(c.rotulo, c.campo));
      END IF;

    ELSIF c.formato = 'cpf' AND NOT public.cpf_valido(v_valor) THEN
      v_val := 'erro'; v_msg := 'CPF não confere — o dígito verificador está errado.';

    ELSIF c.formato = 'cnpj' AND NOT public.cnpj_valido(v_valor) THEN
      v_val := 'erro'; v_msg := 'CNPJ não confere — o dígito verificador está errado.';

    ELSIF c.formato = 'data' THEN
      BEGIN
        v_data := v_valor::date;
        -- Documento com prazo: holerite de 90 dias, certidão, identidade.
        IF v_valida_dias IS NOT NULL
           AND v_data < ((now() AT TIME ZONE 'America/Sao_Paulo')::date - v_valida_dias) THEN
          v_val := 'erro';
          v_msg := format('Documento de %s — o prazo é de %s dias.',
                          to_char(v_data, 'DD/MM/YYYY'), v_valida_dias);
        END IF;
      EXCEPTION WHEN others THEN
        v_val := 'erro'; v_msg := 'Data ilegível.';
      END;
    END IF;

    -- A confiança baixa não é erro: é "olhe este com atenção" (Regra 2). Só
    -- avisa quando nada mais avisou, para não esconder um erro de verdade.
    IF v_val = 'ok' AND c.confianca IS NOT NULL AND c.confianca < 0.8 THEN
      v_val := 'alerta';
      v_msg := format('Leitura pouco segura (%s%%). Confira com o documento ao lado.',
                      round(c.confianca * 100));
    END IF;

    UPDATE documento_campos SET validacao = v_val, mensagem = v_msg WHERE id = c.id;
  END LOOP;

  -- O NOME TEM DE BATER ENTRE OS DOCUMENTOS DO MESMO CLIENTE.
  --
  -- É a validação que pega a troca de arquivo — o holerite do cônjuge subindo
  -- como se fosse o do proponente. Compara com o nome já CONFERIDO em outro
  -- documento: comparar com sugestão seria comparar palpite com palpite.
  SELECT btrim(lower(unaccent_ou_nao(dc.valor_final))) INTO v_outro
    FROM documento_campos dc
    JOIN documentos_cliente d ON d.id = dc.documento_id
   WHERE d.lead_id = v_doc.lead_id AND d.id <> v_doc.id
     AND dc.campo = 'nome' AND dc.valor_final IS NOT NULL AND d.status = 'conferido'
   LIMIT 1;

  IF v_outro IS NOT NULL THEN
    UPDATE documento_campos dc
       SET validacao = 'erro',
           mensagem = 'O nome não bate com o dos outros documentos deste cliente.'
     WHERE dc.documento_id = p_documento_id AND dc.campo = 'nome'
       AND dc.validacao = 'ok'
       AND btrim(lower(unaccent_ou_nao(COALESCE(dc.valor_final, dc.valor_sugerido))))
           IS DISTINCT FROM v_outro;
  END IF;
END;
$function$;

-- ============================================================
-- QUEM PODE VER
--
-- Documento pessoal é o dado mais sensível que a Dash guarda. Ver é para quem
-- administra a casa ou para o corretor DONO daquele lead — não para a equipe
-- inteira. É mais apertado que o resto do sistema de propósito.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_pode_ver(p_tenant_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id)
          -- `leads.assigned_agent_id` é TEXTO, não uuid — resto da época em
          -- que o corretor era identificado por nome. Medido em 22/09: os
          -- 1.688 leads atribuídos têm uuid ali dentro. A comparação é feita
          -- como texto de propósito: converter para uuid estouraria no dia em
          -- que um valor antigo não for, e a pessoa perderia o acesso à pasta
          -- do próprio cliente por um erro de conversão.
          OR EXISTS (SELECT 1 FROM leads l
                      WHERE l.id = p_lead_id AND l.tenant_id = p_tenant_id
                        AND l.assigned_agent_id = auth.uid()::text));
$function$;

-- ============================================================
-- O ESQUEMA FIXO QUE VAI PARA A LIA (Regra 4)
--
-- "A IA é chamada com esse esquema e só pode responder nele." Sem isto, cada
-- leitura devolveria um formato diferente e a conferência viraria texto livre.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_esquema(p_tipo text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_build_object(
    'tipo', t.codigo, 'nome', t.nome,
    'campos', (SELECT jsonb_agg(jsonb_build_object(
                 'campo', c.campo, 'rotulo', c.rotulo,
                 'formato', c.formato, 'obrigatorio', c.obrigatorio
               ) ORDER BY c.ordem, c.campo)
                 FROM documento_tipo_campos c WHERE c.tipo = t.codigo)
  ), NULL) FROM documento_tipos t WHERE t.codigo = p_tipo AND t.ativo;
$function$;

-- ============================================================
-- REGISTRAR O ARQUIVO QUE ACABOU DE SUBIR
--
-- O arquivo vai para o bucket privado pelo navegador; esta função cria a linha
-- e já abre os campos esperados do tipo, em branco. Assim a tela de
-- conferência funciona mesmo que a LIA nunca responda — que é o estado de hoje.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_registrar(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_tipo text,
  p_arquivo text,
  p_arquivo_nome text DEFAULT '',
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.documento_pode_ver(p_tenant_id, p_lead_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM documento_tipos WHERE codigo = p_tipo AND ativo) THEN
    RAISE EXCEPTION 'Tipo de documento desconhecido: %', p_tipo USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(p_arquivo), '') = '' THEN
    RAISE EXCEPTION 'Informe o caminho do arquivo.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO documentos_cliente
    (tenant_id, lead_id, proposal_id, tipo, arquivo, arquivo_nome, enviado_por)
  VALUES (p_tenant_id, p_lead_id, p_proposal_id, p_tipo, btrim(p_arquivo),
          COALESCE(p_arquivo_nome, ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO documento_campos (documento_id, campo)
  SELECT v_id, campo FROM documento_tipo_campos WHERE tipo = p_tipo;

  PERFORM public.documento_validar(v_id);
  RETURN jsonb_build_object('documento_id', v_id);
END;
$function$;

-- ============================================================
-- A LEITURA CHEGA (Regras 2 e 6)
--
-- Chamada pela rota que a LIA usa, com a chave de serviço. Substitui os
-- campos anteriores: reler é refazer.
--
-- REGRA 1, ESCRITA AQUI: isto grava `valor_sugerido`, NUNCA `valor_final`. O
-- documento vai para `lido`, e não para `conferido`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_leitura_recebida(
  p_documento_id uuid,
  -- [{"campo","valor","confianca","ancora"}, ...]
  p_campos jsonb,
  p_lido_por text DEFAULT 'ia'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.documentos_cliente%ROWTYPE;
  v_gravados integer := 0;
  v_ignorados text[] := ARRAY[]::text[];
  x jsonb;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_doc.status = 'conferido' THEN
    RAISE EXCEPTION 'Este documento já foi conferido por uma pessoa; a leitura não o sobrescreve.'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(p_campos, '[]'::jsonb)) LOOP
    -- Campo fora do esquema é DESCARTADO, não gravado. O esquema é o contrato
    -- (Regra 4): aceitar campo inventado devolveria a conferência ao texto livre.
    IF NOT EXISTS (SELECT 1 FROM documento_tipo_campos
                    WHERE tipo = v_doc.tipo AND campo = x->>'campo') THEN
      v_ignorados := v_ignorados || (x->>'campo')::text;
      CONTINUE;
    END IF;

    INSERT INTO documento_campos (documento_id, campo, valor_sugerido, confianca, ancora)
    VALUES (p_documento_id, x->>'campo', NULLIF(btrim(COALESCE(x->>'valor','')), ''),
            NULLIF(x->>'confianca','')::numeric, NULLIF(btrim(COALESCE(x->>'ancora','')), ''))
    ON CONFLICT (documento_id, campo) DO UPDATE
      SET valor_sugerido = EXCLUDED.valor_sugerido,
          confianca = EXCLUDED.confianca,
          ancora = EXCLUDED.ancora;
    v_gravados := v_gravados + 1;
  END LOOP;

  UPDATE documentos_cliente
     SET status = 'lido',
         lido_por = CASE WHEN p_lido_por = 'regra' THEN 'regra' ELSE 'ia' END,
         lido_em = now()
   WHERE id = p_documento_id;

  PERFORM public.documento_validar(p_documento_id);

  RETURN jsonb_build_object(
    'gravados', v_gravados,
    'ignorados', to_jsonb(v_ignorados),
    'fora_do_esquema', array_length(v_ignorados, 1) IS NOT NULL
  );
END;
$function$;

-- ============================================================
-- A PESSOA CONFIRMA (Regra 1)
--
-- É o único caminho pelo qual um valor lido vira valor válido. Recebe o que a
-- pessoa viu na tela, com a imagem ao lado, e recusa o lote inteiro se algum
-- campo estiver em erro — confirmar um CPF com dígito errado é gravar um CPF
-- errado com a assinatura de alguém embaixo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_confirmar(
  p_documento_id uuid,
  -- [{"campo","valor"}, ...] — o que a pessoa deixou em cada campo
  p_campos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.documentos_cliente%ROWTYPE;
  v_erros jsonb;
  x jsonb;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.documento_pode_ver(v_doc.tenant_id, v_doc.lead_id) THEN RETURN NULL; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A confirmação é de uma pessoa: o servidor não confirma documento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(p_campos, '[]'::jsonb)) LOOP
    UPDATE documento_campos
       SET valor_final = NULLIF(btrim(COALESCE(x->>'valor','')), '')
     WHERE documento_id = p_documento_id AND campo = x->>'campo';
  END LOOP;

  PERFORM public.documento_validar(p_documento_id);

  SELECT jsonb_agg(jsonb_build_object('campo', campo, 'mensagem', mensagem))
    INTO v_erros
    FROM documento_campos
   WHERE documento_id = p_documento_id AND validacao = 'erro';

  IF v_erros IS NOT NULL THEN
    -- Nada é gravado como conferido. O lote volta inteiro, com os motivos.
    RETURN jsonb_build_object('confirmado', false, 'erros', v_erros);
  END IF;

  UPDATE documentos_cliente
     SET status = 'conferido', conferido_por = auth.uid(), conferido_em = now()
   WHERE id = p_documento_id;

  PERFORM public.documento_aprender(p_documento_id);
  RETURN jsonb_build_object('confirmado', true);
END;
$function$;

/** Recusar: o arquivo não serve (ilegível, errado, vencido). */
CREATE OR REPLACE FUNCTION public.documento_recusar(p_documento_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_doc public.documentos_cliente%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.documento_pode_ver(v_doc.tenant_id, v_doc.lead_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Diga por que o documento foi recusado — quem enviou precisa saber o que refazer.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE documentos_cliente
     SET status = 'recusado', motivo_recusa = btrim(p_motivo),
         conferido_por = auth.uid(), conferido_em = now()
   WHERE id = p_documento_id;
  RETURN jsonb_build_object('recusado', true);
END;
$function$;

-- ============================================================
-- APRENDER O LAYOUT (Regra 6)
--
-- "Com 10 acertos seguidos, a regra vira ativa e o documento daquele layout é
-- lido sem IA. Errou → volta a candidata."
--
-- Roda depois de cada conferência: compara o que a leitura sugeriu com o que a
-- pessoa deixou. A comparação é a correção — ninguém precisa dizer se acertou.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_aprender(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.documentos_cliente%ROWTYPE;
  c record;
  v_acertou boolean;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND OR v_doc.lido_por IS NULL THEN RETURN; END IF;

  FOR c IN SELECT campo, ancora, valor_sugerido, valor_final
             FROM documento_campos
            WHERE documento_id = p_documento_id AND ancora IS NOT NULL
  LOOP
    v_acertou := btrim(lower(COALESCE(c.valor_sugerido, ''))) =
                 btrim(lower(COALESCE(c.valor_final, '')));

    INSERT INTO documento_padroes (tenant_id, tipo, campo, ancora, acertos, erros, estado)
    VALUES (v_doc.tenant_id, v_doc.tipo, c.campo, c.ancora,
            CASE WHEN v_acertou THEN 1 ELSE 0 END,
            CASE WHEN v_acertou THEN 0 ELSE 1 END,
            'candidata')
    ON CONFLICT (tenant_id, tipo, campo, ancora) DO UPDATE
      SET acertos = CASE WHEN v_acertou THEN documento_padroes.acertos + 1 ELSE 0 END,
          erros   = documento_padroes.erros + CASE WHEN v_acertou THEN 0 ELSE 1 END,
          -- Dez acertos SEGUIDOS: o erro zera a conta, não a diminui. Um
          -- layout que às vezes acerta não pode virar regra.
          estado  = CASE
                      WHEN NOT v_acertou THEN 'candidata'
                      WHEN documento_padroes.acertos + 1 >= 10 THEN 'ativa'
                      ELSE documento_padroes.estado
                    END,
          atualizada_em = now();
  END LOOP;
END;
$function$;

-- ============================================================
-- A PASTA DO CLIENTE
--
-- O que já chegou, o que falta e o que precisa de atenção. Conta o que FALTA,
-- como o placar da conciliação — é o número que diz se a pasta está pronta.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_pasta(p_tenant_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_r jsonb;
BEGIN
  IF NOT public.documento_pode_ver(p_tenant_id, p_lead_id) THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'tipos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', t.codigo, 'nome', t.nome,
        'documentos', COALESCE(d.lista, '[]'::jsonb),
        'conferidos', COALESCE(d.conferidos, 0),
        'falta', COALESCE(d.conferidos, 0) = 0
      ) ORDER BY t.ordem, t.nome)
        FROM documento_tipos t
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'id', dc.id, 'arquivo', dc.arquivo, 'arquivo_nome', dc.arquivo_nome,
                   'status', dc.status, 'lido_por', dc.lido_por,
                   'motivo_recusa', dc.motivo_recusa,
                   'conferido_em', dc.conferido_em,
                   'alertas', (SELECT count(*) FROM documento_campos f
                                WHERE f.documento_id = dc.id AND f.validacao <> 'ok')
                 ) ORDER BY dc.enviado_em DESC) AS lista,
                 count(*) FILTER (WHERE dc.status = 'conferido') AS conferidos
            FROM documentos_cliente dc
           WHERE dc.tenant_id = p_tenant_id AND dc.lead_id = p_lead_id AND dc.tipo = t.codigo
        ) d ON true
       WHERE t.ativo
    ), '[]'::jsonb)
  ) INTO v_r;

  RETURN v_r || jsonb_build_object(
    'faltam', (SELECT count(*) FROM jsonb_array_elements(v_r->'tipos') x
                WHERE (x->>'falta')::boolean),
    'total_tipos', jsonb_array_length(v_r->'tipos')
  );
END;
$function$;

/** Um documento aberto na tela de conferência: a imagem e os campos. */
CREATE OR REPLACE FUNCTION public.documento_abrir(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_doc public.documentos_cliente%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM documentos_cliente WHERE id = p_documento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.documento_pode_ver(v_doc.tenant_id, v_doc.lead_id) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_doc.id, 'tipo', v_doc.tipo, 'arquivo', v_doc.arquivo,
    'arquivo_nome', v_doc.arquivo_nome, 'status', v_doc.status,
    'lido_por', v_doc.lido_por, 'lido_em', v_doc.lido_em,
    'conferido_em', v_doc.conferido_em, 'motivo_recusa', v_doc.motivo_recusa,
    'campos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'campo', c.campo, 'rotulo', COALESCE(tc.rotulo, c.campo),
        'formato', COALESCE(tc.formato, 'texto'),
        'obrigatorio', COALESCE(tc.obrigatorio, false),
        'valor_sugerido', c.valor_sugerido, 'valor_final', c.valor_final,
        'confianca', c.confianca, 'validacao', c.validacao, 'mensagem', c.mensagem
      ) ORDER BY COALESCE(tc.ordem, 999), c.campo)
        FROM documento_campos c
        LEFT JOIN documento_tipo_campos tc ON tc.tipo = v_doc.tipo AND tc.campo = c.campo
       WHERE c.documento_id = p_documento_id
    ), '[]'::jsonb)
  );
END;
$function$;

/** Os tipos, para a tela montar o seletor. */
CREATE OR REPLACE FUNCTION public.documento_tipos_lista()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'codigo', codigo, 'nome', nome, 'valida_em_dias', valida_em_dias
  ) ORDER BY ordem, nome), '[]'::jsonb) FROM documento_tipos WHERE ativo;
$function$;

-- ------------------------------------------------------------
-- O catálogo inicial
--
-- Os tipos que o plano nomeia. Os prazos são os que a praxe usa: holerite de
-- 90 dias (o plano manda essa), certidão de 30, extrato de 60.
-- ------------------------------------------------------------
INSERT INTO public.documento_tipos (codigo, nome, ordem, valida_em_dias) VALUES
  ('identidade', 'RG ou CNH', 10, NULL),
  ('cpf', 'CPF', 20, NULL),
  ('residencia', 'Comprovante de residência', 30, 90),
  ('holerite', 'Holerite', 40, 90),
  ('ir', 'Declaração de imposto de renda', 50, NULL),
  ('fgts', 'Extrato do FGTS', 60, 60),
  ('certidao', 'Certidão', 70, 30)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.documento_tipo_campos (tipo, campo, rotulo, formato, obrigatorio, ordem) VALUES
  ('identidade', 'nome', 'Nome completo', 'texto', true, 10),
  ('identidade', 'documento', 'Número do documento', 'texto', true, 20),
  ('identidade', 'cpf', 'CPF', 'cpf', false, 30),
  ('identidade', 'nascimento', 'Data de nascimento', 'data', false, 40),

  ('cpf', 'nome', 'Nome completo', 'texto', true, 10),
  ('cpf', 'cpf', 'CPF', 'cpf', true, 20),

  ('residencia', 'nome', 'Nome completo', 'texto', true, 10),
  ('residencia', 'endereco', 'Endereço', 'texto', true, 20),
  ('residencia', 'emissao', 'Data de emissão', 'data', true, 30),

  ('holerite', 'nome', 'Nome completo', 'texto', true, 10),
  ('holerite', 'empregador', 'Empregador', 'texto', true, 20),
  ('holerite', 'cnpj', 'CNPJ do empregador', 'cnpj', false, 30),
  ('holerite', 'competencia', 'Competência', 'data', true, 40),
  ('holerite', 'bruto', 'Salário bruto', 'dinheiro', true, 50),
  ('holerite', 'descontos', 'Descontos', 'dinheiro', true, 60),
  ('holerite', 'liquido', 'Líquido', 'dinheiro', true, 70),

  ('ir', 'nome', 'Nome completo', 'texto', true, 10),
  ('ir', 'cpf', 'CPF', 'cpf', true, 20),
  ('ir', 'exercicio', 'Exercício', 'texto', true, 30),

  ('fgts', 'nome', 'Nome completo', 'texto', true, 10),
  ('fgts', 'saldo', 'Saldo', 'dinheiro', true, 20),
  ('fgts', 'emissao', 'Data de emissão', 'data', true, 30),

  ('certidao', 'nome', 'Nome completo', 'texto', true, 10),
  ('certidao', 'emissao', 'Data de emissão', 'data', true, 20)
ON CONFLICT (tipo, campo) DO NOTHING;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cpf_valido(text)',
    'public.cnpj_valido(text)',
    'public.unaccent_ou_nao(text)',
    'public.documento_pode_ver(uuid, uuid)',
    'public.documento_esquema(text)',
    'public.documento_registrar(uuid, uuid, text, text, text, uuid)',
    'public.documento_confirmar(uuid, jsonb)',
    'public.documento_recusar(uuid, text)',
    'public.documento_pasta(uuid, uuid)',
    'public.documento_abrir(uuid)',
    'public.documento_tipos_lista()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- A leitura, o aprendizado e a validação NÃO ficam ao alcance do navegador:
  -- quem grava sugestão é a rota da LIA, com a chave de serviço. Se o front
  -- pudesse chamar, a Regra 1 cairia — bastaria mandar a sugestão e confirmar.
  FOREACH f IN ARRAY ARRAY[
    'public.documento_leitura_recebida(uuid, jsonb, text)',
    'public.documento_aprender(uuid)',
    'public.documento_validar(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END
$do$;

-- ============================================================
-- O ARQUIVO EM SI (Regra 5)
--
-- As políticas de 20260824 recortam o bucket por TENANT: qualquer membro da
-- imobiliária lista e baixa a pasta de qualquer cliente. Provado no banco
-- local em 22/09 — um corretor que não é dono do lead listou o CPF do cliente
-- de um colega.
--
-- Isso passava despercebido porque a tela nunca mostrou essas pastas. Agora
-- mostra, e com a função `documento_pode_ver` apertada: deixar o armazenamento
-- mais largo que a tela seria proteger a vitrine e abrir a porta dos fundos.
--
-- Nada real quebra ao apertar: medido no mesmo dia, o bucket `lead-documentos`
-- tem ZERO arquivos em produção.
-- ============================================================
CREATE OR REPLACE FUNCTION public.documento_arquivo_e_meu(p_pasta text[])
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_lead uuid;
BEGIN
  IF public.is_platform_owner() THEN RETURN true; END IF;
  IF p_pasta IS NULL OR array_length(p_pasta, 1) < 2 THEN RETURN false; END IF;

  -- Caminho fora do formato não derruba a consulta: vira "não é seu".
  BEGIN
    v_tenant := p_pasta[1]::uuid;
    v_lead := p_pasta[2]::uuid;
  EXCEPTION WHEN others THEN RETURN false;
  END;

  RETURN public.is_tenant_admin_or_owner(v_tenant)
      OR EXISTS (SELECT 1 FROM leads l
                  WHERE l.id = v_lead AND l.tenant_id = v_tenant
                    AND l.assigned_agent_id = auth.uid()::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.documento_arquivo_e_meu(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documento_arquivo_e_meu(text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can upload lead documentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view lead documentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update lead documentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete lead documentos" ON storage.objects;
-- E as próprias, para a migration poder rodar duas vezes sem parar no meio.
DROP POLICY IF EXISTS documentos_do_cliente_enviar ON storage.objects;
DROP POLICY IF EXISTS documentos_do_cliente_ver ON storage.objects;
DROP POLICY IF EXISTS documentos_do_cliente_alterar ON storage.objects;
DROP POLICY IF EXISTS documentos_do_cliente_apagar ON storage.objects;

CREATE POLICY documentos_do_cliente_enviar ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-documentos'
              AND public.documento_arquivo_e_meu(storage.foldername(name)));

CREATE POLICY documentos_do_cliente_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lead-documentos'
         AND public.documento_arquivo_e_meu(storage.foldername(name)));

CREATE POLICY documentos_do_cliente_alterar ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-documentos'
         AND public.documento_arquivo_e_meu(storage.foldername(name)))
  WITH CHECK (bucket_id = 'lead-documentos'
              AND public.documento_arquivo_e_meu(storage.foldername(name)));

CREATE POLICY documentos_do_cliente_apagar ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lead-documentos'
         AND public.documento_arquivo_e_meu(storage.foldername(name)));


NOTIFY pgrst, 'reload schema';


COMMIT;
