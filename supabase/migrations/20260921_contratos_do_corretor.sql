-- ============================================================
-- P4.3 — Contratos do corretor com aceite
--
-- Modelo com variáveis, atribuição por pessoa / cargo / todos, aceite com data,
-- hora, IP, aparelho e hash do texto, e PDF carimbado no perfil.
--
-- TRÊS DECISÕES DE DESENHO QUE VALE REGISTRAR:
--
-- 1. O TEXTO É CONGELADO NA ATRIBUIÇÃO, e não montado na hora do aceite. A
--    pessoa aceita um documento específico, e é o hash DELE que fica gravado.
--    Montar na leitura faria o documento mudar debaixo de quem já assinou —
--    é a mesma lição do nível congelado na venda (P4.4).
--
-- 2. AS VARIÁVEIS SÃO PREENCHIDAS AQUI DENTRO, e não no navegador. O CPF vive
--    em `tenant_member_dados`, que existe justamente porque `tenant_memberships`
--    é legível com a chave pública. Preencher no front obrigaria a baixar o CPF
--    de toda a equipe para a máquina de quem atribui. Aqui, o dado nunca sai do
--    banco: sai o texto pronto.
--
-- 3. O ACEITE NÃO É GRAVADO PELO NAVEGADOR. O IP tem de vir de quem enxerga a
--    conexão — o servidor. A função de aceite exige que o chamador informe IP e
--    aparelho, e a rota do Express é quem os captura. Um aceite cujo IP o
--    próprio aceitante informa não prova nada.
--
-- MEDIDO EM PRODUÇÃO EM 21/09, e é por isso que a atribuição confere antes de
-- criar: CPF preenchido em 0 de 126 membros, CRECI em 10, nível em 15, nome em
-- 73 de 91. Um contrato atribuído hoje sairia com lacuna para todo mundo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Os modelos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  -- O corpo com as variáveis: {{nome}}, {{cpf}}, {{creci}}, {{nivel}}, {{data}}…
  corpo text NOT NULL DEFAULT '',
  versao integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  -- Marcado, o aceite simples é RECUSADO: o documento precisa de firma, e a
  -- integração de assinatura eletrônica não existe no sistema. A tela explica
  -- em vez de deixar alguém aceitar por engano algo que exigia assinatura.
  exige_assinatura_eletronica boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contrato_modelos_idx ON public.contrato_modelos (tenant_id, ativo);

-- O histórico do corpo. Sem ele, quem aceitou a versão 1 não teria como
-- mostrar o texto que aceitou depois de o modelo ser revisado.
CREATE TABLE IF NOT EXISTS public.contrato_modelo_versoes (
  modelo_id uuid NOT NULL REFERENCES public.contrato_modelos(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  titulo text NOT NULL,
  corpo text NOT NULL,
  nota_da_versao text NOT NULL DEFAULT '',
  publicado_em timestamptz NOT NULL DEFAULT now(),
  publicado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (modelo_id, versao)
);

-- ------------------------------------------------------------
-- 2. As atribuições
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_atribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modelo_id uuid NOT NULL REFERENCES public.contrato_modelos(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O TEXTO QUE ESTA PESSOA VAI ACEITAR, com as variáveis já trocadas. É ele
  -- que o hash protege.
  corpo text NOT NULL,
  hash_documento text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aceito', 'assinado', 'cancelado')),
  aceito_em timestamptz,
  ip text,
  user_agent text,
  -- Caminho no bucket `corretor-documentos`, o mesmo do Termo de Associação.
  pdf_arquivo text,
  criada_em timestamptz NOT NULL DEFAULT now(),
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Uma atribuição por pessoa por VERSÃO. Uma versão nova gera uma atribuição
-- nova, pendente — é o terceiro critério de pronto do plano.
CREATE UNIQUE INDEX IF NOT EXISTS contrato_atribuicao_uniq
  ON public.contrato_atribuicoes (modelo_id, versao, user_id)
  WHERE status <> 'cancelado';

CREATE INDEX IF NOT EXISTS contrato_atribuicoes_pendentes_idx
  ON public.contrato_atribuicoes (tenant_id, user_id) WHERE status = 'pendente';

-- ------------------------------------------------------------
-- 3. Fechado para o front
-- ------------------------------------------------------------
-- O corpo preenchido carrega CPF. Nada aqui é legível direto pelo navegador:
-- tudo passa por função, que decide o que cada um vê.
REVOKE ALL ON public.contrato_modelos FROM anon, authenticated;
REVOKE ALL ON public.contrato_modelo_versoes FROM anon, authenticated;
REVOKE ALL ON public.contrato_atribuicoes FROM anon, authenticated;
GRANT ALL ON public.contrato_modelos, public.contrato_modelo_versoes,
             public.contrato_atribuicoes TO service_role;

ALTER TABLE public.contrato_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_modelo_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_atribuicoes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. AS VARIÁVEIS
-- ============================================================

/** Quem administra contratos: admin/gestão da imobiliária ou o dono da plataforma. */
CREATE OR REPLACE FUNCTION public.contratos_pode_gerir(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id));
$function$;

/**
 * As variáveis de uma pessoa, e quais estão vazias.
 *
 * O CPF vem de `tenant_member_dados`; o CRECI e o nível, de
 * `tenant_memberships`; o nome, de `auth.users` (com o e-mail de reserva,
 * porque é assim que a Dash identifica o membro em toda tela).
 *
 * Devolve `faltando` de propósito: é o que faz a atribuição recusar antes de
 * criar um contrato com lacuna, em vez de depois do aceite.
 */
CREATE OR REPLACE FUNCTION public.contrato_variaveis(p_tenant_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_faltando text[] := ARRAY[]::text[];
  v_nome text; v_cpf text; v_creci text; v_nivel text; v_email text; v_imob text;
BEGIN
  IF NOT public.contratos_pode_gerir(p_tenant_id) AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
                  NULLIF(btrim(u.raw_user_meta_data->>'full_name'), '')),
         u.email
    INTO v_nome, v_email
    FROM auth.users u WHERE u.id = p_user_id;

  SELECT NULLIF(btrim(d.cpf), '') INTO v_cpf
    FROM tenant_member_dados d
   WHERE d.tenant_id = p_tenant_id AND d.user_id = p_user_id;

  SELECT NULLIF(btrim(tm.creci), ''),
         NULLIF(btrim(COALESCE(tm.nivel, tm.permissions->>'nivel_comissao')), '')
    INTO v_creci, v_nivel
    FROM tenant_memberships tm
   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id;

  SELECT t.name INTO v_imob FROM tenants t WHERE t.id = p_tenant_id;

  -- O `::text` não é enfeite: sem ele o Postgres tenta ler 'nome' como um
  -- literal de ARRAY e estoura com "malformed array literal".
  IF v_nome IS NULL THEN v_faltando := v_faltando || 'nome'::text; END IF;
  IF v_cpf IS NULL THEN v_faltando := v_faltando || 'cpf'::text; END IF;
  IF v_creci IS NULL THEN v_faltando := v_faltando || 'creci'::text; END IF;
  IF v_nivel IS NULL THEN v_faltando := v_faltando || 'nivel'::text; END IF;

  v := jsonb_build_object(
    'nome', COALESCE(v_nome, ''),
    'cpf', COALESCE(v_cpf, ''),
    'creci', COALESCE(v_creci, ''),
    'nivel', COALESCE(v_nivel, ''),
    'email', COALESCE(v_email, ''),
    'imobiliaria', COALESCE(v_imob, ''),
    'data', to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'DD/MM/YYYY')
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'email', COALESCE(v_email, ''),
    'valores', v,
    'faltando', to_jsonb(v_faltando),
    'completo', array_length(v_faltando, 1) IS NULL
  );
END;
$function$;

/**
 * Troca {{variavel}} pelo valor.
 *
 * Só as chaves conhecidas são trocadas; uma `{{inventada}}` fica visível no
 * texto, e é assim que quem escreveu o modelo descobre o erro de digitação —
 * apagá-la em silêncio produziria um contrato com um buraco invisível.
 */
CREATE OR REPLACE FUNCTION public.contrato_preencher(p_corpo text, p_valores jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  v_saida text := COALESCE(p_corpo, '');
  k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_valores, '{}'::jsonb)) LOOP
    v_saida := replace(v_saida, '{{' || k || '}}', COALESCE(p_valores->>k, ''));
  END LOOP;
  RETURN v_saida;
END;
$function$;

COMMIT;

-- ============================================================
-- 5. OS MODELOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.contrato_modelos_listar(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.contratos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'titulo', m.titulo, 'descricao', m.descricao,
      'corpo', m.corpo, 'versao', m.versao,
      'exige_assinatura_eletronica', m.exige_assinatura_eletronica,
      'ativo', m.ativo,
      'pendentes', (SELECT count(*) FROM contrato_atribuicoes a
                     WHERE a.modelo_id = m.id AND a.status = 'pendente'),
      'aceitos', (SELECT count(*) FROM contrato_atribuicoes a
                   WHERE a.modelo_id = m.id AND a.versao = m.versao AND a.status = 'aceito')
    ) ORDER BY m.titulo)
      FROM contrato_modelos m WHERE m.tenant_id = p_tenant_id AND m.ativo
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.contrato_modelo_salvar(
  p_tenant_id  uuid,
  p_titulo     text,
  p_corpo      text,
  p_descricao  text DEFAULT '',
  p_exige_ae   boolean DEFAULT false,
  p_id         uuid DEFAULT NULL,
  p_nova_versao boolean DEFAULT false,
  p_nota       text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.contrato_modelos%ROWTYPE;
  v_versao integer;
BEGIN
  IF NOT public.contratos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_titulo), '') = '' THEN
    RAISE EXCEPTION 'O modelo precisa de um título.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(p_corpo), '') = '' THEN
    RAISE EXCEPTION 'Escreva o texto do contrato.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO contrato_modelos (tenant_id, titulo, descricao, corpo,
                                  exige_assinatura_eletronica, versao)
    VALUES (p_tenant_id, btrim(p_titulo), COALESCE(p_descricao, ''), p_corpo,
            COALESCE(p_exige_ae, false), 1)
    RETURNING * INTO v_m;
    v_versao := 1;
  ELSE
    SELECT versao INTO v_versao FROM contrato_modelos
     WHERE id = p_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_nova_versao THEN v_versao := v_versao + 1; END IF;

    UPDATE contrato_modelos SET
      titulo = btrim(p_titulo), descricao = COALESCE(p_descricao, ''),
      corpo = p_corpo, exige_assinatura_eletronica = COALESCE(p_exige_ae, false),
      versao = v_versao, atualizado_em = now()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_m;
  END IF;

  INSERT INTO contrato_modelo_versoes (modelo_id, versao, titulo, corpo,
                                       nota_da_versao, publicado_por)
  VALUES (v_m.id, v_versao, v_m.titulo, v_m.corpo, COALESCE(p_nota, ''), auth.uid())
  ON CONFLICT (modelo_id, versao) DO UPDATE
    SET titulo = EXCLUDED.titulo, corpo = EXCLUDED.corpo,
        nota_da_versao = EXCLUDED.nota_da_versao;

  RETURN jsonb_build_object('id', v_m.id, 'titulo', v_m.titulo, 'versao', v_m.versao);
END;
$function$;

-- ============================================================
-- 6. A ATRIBUIÇÃO
-- ============================================================
-- Confere ANTES de criar. Decidido com o chefe em 21/09: contrato com lacuna
-- não serve como documento, e é pior descobrir isso depois do aceite. A função
-- devolve quem ficou de fora e por quê, e a tela mostra a lista.
CREATE OR REPLACE FUNCTION public.contrato_atribuir(
  p_tenant_id uuid,
  p_modelo_id uuid,
  -- 'todos' | 'cargo' | 'pessoa'
  p_alvo      text DEFAULT 'todos',
  p_alvo_id   uuid DEFAULT NULL,
  -- `false` = só simula, para a tela mostrar quem ficaria de fora antes.
  p_confirmar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.contrato_modelos%ROWTYPE;
  v_alvo record;
  v_var jsonb;
  v_corpo text;
  v_criadas integer := 0;
  v_ja integer := 0;
  v_faltando jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.contratos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT * INTO v_m FROM contrato_modelos
   WHERE id = p_modelo_id AND tenant_id = p_tenant_id AND ativo;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_alvo = 'cargo' AND p_alvo_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o cargo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_alvo = 'pessoa' AND p_alvo_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a pessoa.' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_alvo IN
    SELECT tm.user_id, u.email
      FROM tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = p_tenant_id
       AND CASE p_alvo
             WHEN 'cargo' THEN tm.cargo_id IS NOT DISTINCT FROM p_alvo_id
             WHEN 'pessoa' THEN tm.user_id = p_alvo_id
             ELSE true
           END
  LOOP
    -- Já tem esta versão? Não duplica.
    IF EXISTS (SELECT 1 FROM contrato_atribuicoes a
                WHERE a.modelo_id = v_m.id AND a.versao = v_m.versao
                  AND a.user_id = v_alvo.user_id AND a.status <> 'cancelado') THEN
      v_ja := v_ja + 1;
      CONTINUE;
    END IF;

    v_var := public.contrato_variaveis(p_tenant_id, v_alvo.user_id);

    IF (v_var->>'completo')::boolean IS NOT TRUE THEN
      v_faltando := v_faltando || jsonb_build_array(jsonb_build_object(
        'user_id', v_alvo.user_id, 'email', v_alvo.email, 'campos', v_var->'faltando'));
      CONTINUE;
    END IF;

    IF p_confirmar THEN
      v_corpo := public.contrato_preencher(v_m.corpo, v_var->'valores');
      INSERT INTO contrato_atribuicoes
        (tenant_id, modelo_id, versao, user_id, corpo, hash_documento, criada_por)
      VALUES (p_tenant_id, v_m.id, v_m.versao, v_alvo.user_id, v_corpo,
              -- `extensions.digest`, qualificado: o pgcrypto mora no esquema
              -- `extensions` nesta base, e a função fixa `search_path` em
              -- 'public' — sem o prefixo, o hash não existe em tempo de execução.
              encode(extensions.digest(v_corpo, 'sha256'), 'hex'), auth.uid());
    END IF;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'simulacao', NOT p_confirmar,
    'modelo', v_m.titulo,
    'versao', v_m.versao,
    'criadas', v_criadas,
    'ja_tinham', v_ja,
    'faltando', v_faltando
  );
END;
$function$;

-- ============================================================
-- 7. O QUE EU TENHO PARA ACEITAR
-- ============================================================
-- É o que o bloqueio da Dash consulta. Devolve o texto inteiro, porque a
-- pessoa precisa ler o que vai aceitar.
CREATE OR REPLACE FUNCTION public.contratos_pendentes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid := auth.uid();
BEGIN
  IF v_eu IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', m.titulo, 'corpo', a.corpo,
      'versao', a.versao, 'hash', a.hash_documento,
      'tenant_id', a.tenant_id,
      -- A tela recusa o aceite simples nestes, e explica por quê.
      'exige_assinatura_eletronica', m.exige_assinatura_eletronica,
      'criada_em', a.criada_em
    ) ORDER BY a.criada_em)
      FROM contrato_atribuicoes a
      JOIN contrato_modelos m ON m.id = a.modelo_id
     WHERE a.user_id = v_eu AND a.status = 'pendente'
  ), '[]'::jsonb);
END;
$function$;

-- ============================================================
-- 8. O ACEITE
-- ============================================================
-- CHAMADA PELO SERVIDOR, não pelo navegador: o IP tem de vir de quem enxerga a
-- conexão. Por isso a função EXIGE `p_ip` e `p_user_agent` e recebe o usuário
-- como parâmetro — quem a chama é a rota do Express, com a chave de serviço,
-- depois de validar o token.
--
-- A segunda trava: só aceita atribuição DAQUELE usuário. Mesmo com a chave de
-- serviço, um engano na rota não faria uma pessoa aceitar pela outra.
CREATE OR REPLACE FUNCTION public.contrato_aceitar(
  p_atribuicao_id uuid,
  p_user_id       uuid,
  p_ip            text,
  p_user_agent    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.contrato_atribuicoes%ROWTYPE;
  v_exige boolean;
BEGIN
  SELECT * INTO v_a FROM contrato_atribuicoes WHERE id = p_atribuicao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_a.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Este contrato é de outra pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.status <> 'pendente' THEN
    -- Aceitar duas vezes não reescreve a data: o primeiro aceite é o que vale.
    RETURN jsonb_build_object('ja_aceito', true, 'aceito_em', v_a.aceito_em,
                              'hash', v_a.hash_documento);
  END IF;

  SELECT exige_assinatura_eletronica INTO v_exige
    FROM contrato_modelos WHERE id = v_a.modelo_id;
  IF v_exige THEN
    RAISE EXCEPTION 'Este documento exige assinatura eletrônica e não pode ser aceito por aqui.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(btrim(p_ip), '') = '' THEN
    RAISE EXCEPTION 'O aceite precisa registrar o endereço de origem.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE contrato_atribuicoes
     SET status = 'aceito', aceito_em = now(),
         ip = btrim(p_ip), user_agent = COALESCE(btrim(p_user_agent), '')
   WHERE id = p_atribuicao_id
  RETURNING * INTO v_a;

  RETURN jsonb_build_object(
    'aceito', true, 'aceito_em', v_a.aceito_em,
    'hash', v_a.hash_documento, 'titulo',
    (SELECT titulo FROM contrato_modelos WHERE id = v_a.modelo_id)
  );
END;
$function$;

/** Guarda o caminho do PDF carimbado, depois que a tela o gera e sobe. */
CREATE OR REPLACE FUNCTION public.contrato_registrar_pdf(
  p_atribuicao_id uuid,
  p_arquivo       text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_a public.contrato_atribuicoes%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM contrato_atribuicoes WHERE id = p_atribuicao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_a.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.contratos_pode_gerir(v_a.tenant_id) THEN
    RETURN NULL;
  END IF;

  UPDATE contrato_atribuicoes SET pdf_arquivo = p_arquivo
   WHERE id = p_atribuicao_id RETURNING * INTO v_a;
  RETURN jsonb_build_object('pdf', v_a.pdf_arquivo);
END;
$function$;

-- ============================================================
-- 9. O RELATÓRIO
-- ============================================================
CREATE OR REPLACE FUNCTION public.contrato_relatorio(p_modelo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.contrato_modelos%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM contrato_modelos WHERE id = p_modelo_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.contratos_pode_gerir(v_m.tenant_id) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'modelo', v_m.titulo,
    'versao_atual', v_m.versao,
    'linhas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'email', u.email,
        'versao', a.versao, 'status', a.status,
        'aceito_em', a.aceito_em, 'ip', a.ip,
        'tem_pdf', a.pdf_arquivo IS NOT NULL,
        -- Quem aceitou uma versão antiga: o contrato dele não é o de hoje.
        'versao_antiga', a.status = 'aceito' AND a.versao < v_m.versao
      ) ORDER BY (a.status = 'aceito'), a.versao DESC, u.email)
        FROM contrato_atribuicoes a
        JOIN auth.users u ON u.id = a.user_id
       WHERE a.modelo_id = p_modelo_id AND a.status <> 'cancelado'
    ), '[]'::jsonb),
    'pendentes', (SELECT count(*) FROM contrato_atribuicoes a
                   WHERE a.modelo_id = p_modelo_id AND a.status = 'pendente'),
    'aceitos_versao_atual', (SELECT count(*) FROM contrato_atribuicoes a
                              WHERE a.modelo_id = p_modelo_id AND a.status = 'aceito'
                                AND a.versao = v_m.versao)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.contrato_cancelar(p_atribuicao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_a public.contrato_atribuicoes%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM contrato_atribuicoes WHERE id = p_atribuicao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.contratos_pode_gerir(v_a.tenant_id) THEN RETURN NULL; END IF;

  -- O aceite é registro: cancelar um contrato já aceito apagaria a prova de
  -- que a pessoa concordou. Só o pendente se cancela.
  IF v_a.status = 'aceito' THEN
    RAISE EXCEPTION 'Este contrato já foi aceito e não pode ser cancelado — o aceite é registro.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE contrato_atribuicoes SET status = 'cancelado' WHERE id = p_atribuicao_id;
  RETURN jsonb_build_object('cancelado', true);
END;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.contratos_pode_gerir(uuid)',
    'public.contrato_variaveis(uuid, uuid)',
    'public.contrato_preencher(text, jsonb)',
    'public.contrato_modelos_listar(uuid)',
    'public.contrato_modelo_salvar(uuid, text, text, text, boolean, uuid, boolean, text)',
    'public.contrato_atribuir(uuid, uuid, text, uuid, boolean)',
    'public.contratos_pendentes()',
    'public.contrato_registrar_pdf(uuid, text)',
    'public.contrato_relatorio(uuid)',
    'public.contrato_cancelar(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

-- O ACEITE é a exceção: NÃO tem grant para `authenticated`. Só a chave de
-- serviço a executa, pela rota do Express, que é quem enxerga o IP. Se o
-- navegador pudesse chamá-la, o aceitante informaria o próprio IP — e um
-- registro assim não prova nada.
REVOKE ALL ON FUNCTION public.contrato_aceitar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contrato_aceitar(uuid, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
