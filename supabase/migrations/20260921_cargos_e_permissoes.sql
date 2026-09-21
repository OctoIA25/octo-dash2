-- ============================================================
-- P4.1 — Cargos com pacote de permissões
--
-- Hoje a permissão é individual: medido em produção em 21/09, são 13
-- combinações diferentes para 19 pessoas na Lotus. Cada pessoa tem a sua, e
-- quem contrata um corretor precisa marcar catorze caixas na mão.
--
-- O QUE O CARGO MANDA, E O QUE ELE NÃO MANDA — decidido com o chefe em 21/09:
--
--   * o cargo manda NO QUE SE VÊ: menu, rotas e sub-abas;
--   * o `role` continua mandando NO QUE SE PODE: são 277 políticas de
--     segurança em 96 tabelas, 61 delas lendo `role`, e reescrevê-las seria
--     mexer em regra de segurança que não dá erro na tela quando erra.
--
-- Para os dois andarem juntos, o cargo CARREGA o role (`cargos.role`): escolher
-- o cargo define os dois de uma vez. É o segundo critério de pronto do plano —
-- "novo corretor configurado só escolhendo o cargo".
--
-- A PERGUNTA QUE ISTO RESPONDE, e que está escrita em `src/types/permissions.ts`
-- desde 18/09: hoje admin e team_leader IGNORAM as permissões salvas — tirar
-- "imóveis" de um admin na tela de Acessos não restringe nada, porque a rota
-- ignora a escolha. A tela promete uma restrição que o app não cumpre. Com
-- cargo, a escolha passa a valer para todos. Para ninguém perder acesso no dia
-- da virada, a migração dá a cada gestor um cargo que contém exatamente o que
-- ele já vê.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. O catálogo de permissões
-- ------------------------------------------------------------
-- Fixo e global: é a lista do que o sistema sabe controlar. Não é por
-- imobiliária, porque quem define o que existe é o código, não a casa.
CREATE TABLE IF NOT EXISTS public.permissoes (
  codigo text PRIMARY KEY,
  modulo text NOT NULL,
  descricao text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  -- `false` = a permissão é gravada mas NINGUÉM A LÊ ainda. Mapeada aqui
  -- porque o plano manda mapear, e marcada assim porque uma chave que não faz
  -- nada é pior que uma chave ausente: quem a desmarca acredita ter restringido.
  em_uso boolean NOT NULL DEFAULT true
);

COMMENT ON COLUMN public.permissoes.em_uso IS
  'false = gravada e nunca lida pelo app. A tela mostra essas à parte, dizendo que ainda não têm efeito.';

-- As abas do menu principal. São as que de fato regem menu e rota hoje.
INSERT INTO public.permissoes (codigo, modulo, descricao, ordem, em_uso) VALUES
  ('leads',           'Abas do menu', 'Início e Leads', 10, true),
  ('notificacoes',    'Abas do menu', 'Notificações', 20, true),
  ('metricas',        'Abas do menu', 'Comercial (funis, comissionamento)', 30, true),
  ('juridico',        'Abas do menu', 'Jurídico', 40, true),
  ('estudo-mercado',  'Abas do menu', 'Estudo de Mercado', 50, true),
  ('recrutamento',    'Abas do menu', 'Recrutamento', 60, true),
  ('gestao-equipe',   'Abas do menu', 'Gestão de Equipe', 70, true),
  ('imoveis',         'Abas do menu', 'Imóveis', 80, true),
  ('agentes-ia',      'Abas do menu', 'Agentes de IA', 90, true),
  ('comunicacao',     'Abas do menu', 'Comunicação (disparo em massa)', 100, true),
  ('chat',            'Abas do menu', 'WhatsApp', 110, true),
  ('integracoes',     'Abas do menu', 'Integrações', 120, true),
  ('central-leads',   'Abas do menu', 'Central de Leads', 130, true),
  ('relatorios',      'Abas do menu', 'Relatórios, Marketing e Financeiro', 140, true),
  ('metas',           'Abas do menu', 'Metas', 150, true),
  ('excel',           'Abas do menu', 'Excel', 160, true),
  -- Estas duas existem no tipo e não chegam à tela: `octo-chat` tem o item de
  -- menu e a rota comentados, e `atividades` fica fora da ordem do menu, então
  -- é sempre filtrada. Ficam no catálogo para não sumirem de vista.
  ('octo-chat',       'Abas do menu', 'Octo Chat (item de menu desativado no código)', 170, false),
  ('atividades',      'Abas do menu', 'Atividades (fora da ordem do menu; a rota redireciona)', 180, false)
ON CONFLICT (codigo) DO UPDATE
  SET modulo = EXCLUDED.modulo, descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem, em_uso = EXCLUDED.em_uso;

-- As sub-abas. TODAS gravadas e nunca lidas: `grep` no repositório inteiro só
-- as encontra na tela que as escreve. Marcar ou desmarcar qualquer uma delas
-- hoje não muda nada para ninguém.
INSERT INTO public.permissoes (codigo, modulo, descricao, ordem, em_uso) VALUES
  ('leads-funil',         'Sub-abas de Início', 'Funil', 210, false),
  ('leads-okrs',          'Sub-abas de Início', 'OKRs', 220, false),
  ('leads-kpis',          'Sub-abas de Início', 'KPIs', 230, false),
  ('leads-pdi',           'Sub-abas de Início', 'PDI', 240, false),
  ('leads-tarefas',       'Sub-abas de Início', 'Tarefas da semana', 250, false),
  ('leads-agenda',        'Sub-abas de Início', 'Agenda', 260, false),
  ('metricas-geral',      'Sub-abas de Comercial', 'Visão geral', 310, false),
  ('metricas-equipes',    'Sub-abas de Comercial', 'Equipes', 320, false),
  ('metricas-corretores', 'Sub-abas de Comercial', 'Corretores', 330, false),
  ('gestao-tarefas',      'Sub-abas de Gestão de Equipe', 'Tarefas', 410, false),
  ('gestao-okrs',         'Sub-abas de Gestão de Equipe', 'OKRs', 420, false),
  ('gestao-pdi',          'Sub-abas de Gestão de Equipe', 'PDI', 430, false),
  ('gestao-metricas',     'Sub-abas de Gestão de Equipe', 'Métricas', 440, false),
  ('gestao-acessos',      'Sub-abas de Gestão de Equipe', 'Acessos e permissões', 450, false),
  -- A única "permissão especial" que existe na tela. Também nunca lida: quem
  -- libera a roleta é uma checagem de papel escrita à mão no Bolsão.
  ('can_manage_roleta',   'Permissões especiais', 'Gerenciar a roleta do Bolsão', 510, false)
ON CONFLICT (codigo) DO UPDATE
  SET modulo = EXCLUDED.modulo, descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem, em_uso = EXCLUDED.em_uso;

-- ------------------------------------------------------------
-- 2. Os cargos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  -- O número que ordena os cargos na tela e diz quem é "mais alto".
  nivel_acesso integer NOT NULL DEFAULT 10,
  -- O PAPEL QUE O CARGO CONCEDE. É ele que continua regendo as 61 políticas de
  -- segurança. Escolher o cargo define o papel junto — é isto que faz "novo
  -- corretor configurado só escolhendo o cargo" valer de verdade, e não só
  -- para o menu.
  role text NOT NULL DEFAULT 'corretor'
    CHECK (role IN ('admin', 'team_leader', 'corretor')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cargos_nome_uniq ON public.cargos (tenant_id, lower(nome));
CREATE INDEX IF NOT EXISTS cargos_tenant_idx ON public.cargos (tenant_id, nivel_acesso DESC);

CREATE TABLE IF NOT EXISTS public.cargo_permissoes (
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  permissao_codigo text NOT NULL REFERENCES public.permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (cargo_id, permissao_codigo)
);

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenant_memberships_cargo_idx
  ON public.tenant_memberships (cargo_id) WHERE cargo_id IS NOT NULL;

COMMENT ON COLUMN public.tenant_memberships.cargo_id IS
  'NULL = membro ainda não migrado; o app cai na regra antiga (permissions.sidebar_permissions). É isto que faz a virada não mudar a tela de ninguém.';

-- ------------------------------------------------------------
-- 3. As exceções individuais
-- ------------------------------------------------------------
-- O plano pede exceção que DÁ e exceção que TIRA. Sem as duas, a pessoa que
-- precisa de uma aba a mais viraria um cargo novo só para ela — que é
-- exatamente o que este item veio desfazer.
CREATE TABLE IF NOT EXISTS public.membro_permissoes_extra (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissao_codigo text NOT NULL REFERENCES public.permissoes(codigo) ON DELETE CASCADE,
  concede boolean NOT NULL,
  motivo text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, permissao_codigo)
);

COMMENT ON COLUMN public.membro_permissoes_extra.concede IS
  'true = dá esta permissão além do cargo; false = tira, mesmo o cargo tendo.';

-- ------------------------------------------------------------
-- 4. Fechado para o front
-- ------------------------------------------------------------
-- `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Quem lê é
-- sempre função, com a checagem de admin dentro: permissão é a última coisa
-- que pode ser escrita por quem não deveria.
REVOKE ALL ON public.cargos FROM anon, authenticated;
REVOKE ALL ON public.cargo_permissoes FROM anon, authenticated;
REVOKE ALL ON public.membro_permissoes_extra FROM anon, authenticated;
REVOKE ALL ON public.permissoes FROM anon;
GRANT SELECT ON public.permissoes TO authenticated;
GRANT ALL ON public.cargos, public.cargo_permissoes, public.membro_permissoes_extra TO service_role;

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membro_permissoes_extra ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- DEPOIS DE APLICAR: RECARREGAR O CACHE DE ESQUEMA
-- ------------------------------------------------------------
-- O PostgREST guarda o desenho das tabelas em memória. Sem este aviso, a
-- coluna `cargo_id` fica INVISÍVEL para o app até o serviço reiniciar — e o
-- sintoma não é erro nenhum: a tela de Cargos mostra "Sem cargo" para todo
-- mundo, inclusive para quem acabou de receber um. Perdido meia hora com isso
-- no banco local em 21/09.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 5. O QUE A TELA LÊ E ESCREVE
-- ============================================================

CREATE OR REPLACE FUNCTION public.cargos_pode_gerir(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (auth.uid() IS NULL
          OR public.is_platform_owner()
          OR public.is_tenant_admin_or_owner(p_tenant_id));
$function$;

-- ------------------------------------------------------------
-- O catálogo, agrupado por módulo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permissoes_catalogo()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'codigo', codigo, 'modulo', modulo, 'descricao', descricao,
    'ordem', ordem, 'em_uso', em_uso
  ) ORDER BY ordem), '[]'::jsonb) FROM permissoes;
$function$;

-- ------------------------------------------------------------
-- Os cargos da imobiliária, com quantas pessoas e quantas permissões
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cargos_do_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_r jsonb;
BEGIN
  IF NOT public.cargos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
    'nivel_acesso', c.nivel_acesso, 'role', c.role, 'ativo', c.ativo,
    'pessoas', (SELECT count(*) FROM tenant_memberships tm WHERE tm.cargo_id = c.id),
    'permissoes', COALESCE((SELECT jsonb_agg(cp.permissao_codigo ORDER BY cp.permissao_codigo)
                              FROM cargo_permissoes cp WHERE cp.cargo_id = c.id), '[]'::jsonb)
  ) ORDER BY c.nivel_acesso DESC, c.nome), '[]'::jsonb)
  INTO v_r FROM cargos c WHERE c.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'cargos', v_r,
    -- Quem ainda não tem cargo segue na regra antiga. A tela precisa dizer
    -- isso, senão "0 pessoas" num cargo novo parece defeito.
    'sem_cargo', (SELECT count(*) FROM tenant_memberships tm
                   WHERE tm.tenant_id = p_tenant_id AND tm.cargo_id IS NULL),
    'membros', (SELECT count(*) FROM tenant_memberships tm WHERE tm.tenant_id = p_tenant_id)
  );
END;
$function$;

-- ------------------------------------------------------------
-- Criar ou editar um cargo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cargo_salvar(
  p_tenant_id  uuid,
  p_nome       text,
  p_descricao  text,
  p_nivel      integer,
  p_role       text,
  p_permissoes text[],
  p_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.cargos%ROWTYPE;
  v_desconhecidas text[];
BEGIN
  IF NOT public.cargos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'O cargo precisa de um nome.' USING ERRCODE = 'check_violation';
  END IF;

  -- Permissão que não existe no catálogo é engano de quem chamou, não uma
  -- permissão nova: aceitar criaria uma chave que nenhuma tela lê.
  SELECT array_agg(x) INTO v_desconhecidas
    FROM unnest(COALESCE(p_permissoes, '{}')) x
   WHERE NOT EXISTS (SELECT 1 FROM permissoes p WHERE p.codigo = x);
  IF v_desconhecidas IS NOT NULL THEN
    RAISE EXCEPTION 'Permissões que não existem no catálogo: %', array_to_string(v_desconhecidas, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- A TRANCA DA PRÓPRIA PORTA. A tela de Cargos mora atrás de
  -- "gestao-equipe": tirar essa permissão do cargo que o próprio autor tem o
  -- deixaria sem caminho de volta, e sem nenhum erro na tela — ele só não
  -- acharia mais o menu. Visto no navegador em 21/09, com uma conta admin.
  IF p_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tenant_memberships tm
                  WHERE tm.cargo_id = p_id AND tm.user_id = auth.uid())
     AND NOT ('gestao-equipe' = ANY(COALESCE(p_permissoes, '{}')))
     AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Este é o seu próprio cargo, e sem "Gestão de Equipe" você perderia o acesso a esta tela. Peça a outro administrador, ou mantenha a permissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO cargos (tenant_id, nome, descricao, nivel_acesso, role)
    VALUES (p_tenant_id, btrim(p_nome), COALESCE(p_descricao, ''),
            COALESCE(p_nivel, 10), COALESCE(p_role, 'corretor'))
    RETURNING * INTO v_c;
  ELSE
    UPDATE cargos SET
      nome = btrim(p_nome), descricao = COALESCE(p_descricao, ''),
      nivel_acesso = COALESCE(p_nivel, nivel_acesso),
      role = COALESCE(p_role, role),
      atualizado_em = now()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_c;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;

  -- Trocar o pacote inteiro é o comportamento que a tela promete: os
  -- interruptores mostram o estado final, não um diff.
  DELETE FROM cargo_permissoes WHERE cargo_id = v_c.id;
  INSERT INTO cargo_permissoes (cargo_id, permissao_codigo)
  SELECT v_c.id, x FROM unnest(COALESCE(p_permissoes, '{}')) x
  ON CONFLICT DO NOTHING;

  -- O PAPEL DO CARGO VALE PARA QUEM JÁ O TEM. Sem isto, mudar o cargo de
  -- "Corretor" para team_leader não mexeria em ninguém, e a tela prometeria
  -- uma mudança que o app não cumpre — o defeito que este item veio desfazer.
  UPDATE tenant_memberships SET role = v_c.role
   WHERE cargo_id = v_c.id AND role IS DISTINCT FROM v_c.role;

  RETURN jsonb_build_object(
    'id', v_c.id, 'nome', v_c.nome, 'role', v_c.role,
    'permissoes', (SELECT count(*) FROM cargo_permissoes WHERE cargo_id = v_c.id),
    'pessoas', (SELECT count(*) FROM tenant_memberships WHERE cargo_id = v_c.id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cargo_excluir(p_cargo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.cargos%ROWTYPE;
  v_pessoas integer;
BEGIN
  SELECT * INTO v_c FROM cargos WHERE id = p_cargo_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.cargos_pode_gerir(v_c.tenant_id) THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_pessoas FROM tenant_memberships WHERE cargo_id = p_cargo_id;
  IF v_pessoas > 0 THEN
    RAISE EXCEPTION 'Este cargo tem % pessoa(s). Mova-as para outro cargo antes de excluir.', v_pessoas
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM cargos WHERE id = p_cargo_id;
  RETURN jsonb_build_object('excluido', true, 'nome', v_c.nome);
END;
$function$;

-- ------------------------------------------------------------
-- Dar um cargo a um membro
-- ------------------------------------------------------------
-- Esta é a função mais sensível do arquivo: ela muda o PAPEL da pessoa, e o
-- papel rege as 61 políticas de segurança. Três travas:
--   1. só admin/gestão da imobiliária (ou o dono da plataforma) chama;
--   2. ninguém muda o próprio cargo para um papel diferente — auto-promoção
--      seria o caminho mais curto para virar admin;
--   3. a imobiliária não fica sem nenhum admin.
CREATE OR REPLACE FUNCTION public.membro_definir_cargo(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_cargo_id  uuid,
  -- [{"codigo":"juridico","concede":true,"motivo":"..."}, ...]
  p_extras    jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo public.cargos%ROWTYPE;
  v_antes text;
  v_admins integer;
BEGIN
  IF NOT public.cargos_pode_gerir(p_tenant_id) THEN RETURN NULL; END IF;

  SELECT role INTO v_antes FROM tenant_memberships
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_cargo_id IS NOT NULL THEN
    SELECT * INTO v_cargo FROM cargos WHERE id = p_cargo_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cargo não encontrado nesta imobiliária.' USING ERRCODE = 'check_violation';
    END IF;

    IF p_user_id = auth.uid() AND v_cargo.role IS DISTINCT FROM v_antes
       AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Você não pode mudar o próprio nível de acesso. Peça a outro administrador.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_antes = 'admin' AND v_cargo.role <> 'admin' THEN
      SELECT count(*) INTO v_admins FROM tenant_memberships
       WHERE tenant_id = p_tenant_id AND role = 'admin' AND user_id <> p_user_id;
      IF v_admins = 0 THEN
        RAISE EXCEPTION 'Esta é a única conta administradora da imobiliária. Promova outra antes.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  UPDATE tenant_memberships
     SET cargo_id = p_cargo_id,
         role = COALESCE(v_cargo.role, role)
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  -- As exceções vêm inteiras, como o pacote do cargo: a tela mostra o estado
  -- final, e mandar um diff faria a exceção removida sobreviver calada.
  DELETE FROM membro_permissoes_extra
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  INSERT INTO membro_permissoes_extra (tenant_id, user_id, permissao_codigo, concede, motivo)
  SELECT p_tenant_id, p_user_id, x->>'codigo', (x->>'concede')::boolean,
         COALESCE(x->>'motivo', '')
    FROM jsonb_array_elements(COALESCE(p_extras, '[]'::jsonb)) x
   WHERE EXISTS (SELECT 1 FROM permissoes p WHERE p.codigo = x->>'codigo')
  ON CONFLICT (tenant_id, user_id, permissao_codigo) DO UPDATE
    SET concede = EXCLUDED.concede, motivo = EXCLUDED.motivo;

  RETURN jsonb_build_object(
    'cargo', v_cargo.nome, 'role_antes', v_antes, 'role_depois', COALESCE(v_cargo.role, v_antes),
    'excecoes', (SELECT count(*) FROM membro_permissoes_extra
                  WHERE tenant_id = p_tenant_id AND user_id = p_user_id)
  );
END;
$function$;

-- ------------------------------------------------------------
-- As permissões que valem para uma pessoa
-- ------------------------------------------------------------
-- Cargo + o que a exceção dá − o que a exceção tira. O recorte do que a
-- imobiliária contratou (`allowed_features`) continua sendo aplicado pelo
-- front, como já era: são duas perguntas diferentes, e juntá-las aqui esconderia
-- qual das duas negou o acesso.
CREATE OR REPLACE FUNCTION public.permissoes_efetivas(p_tenant_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo_id uuid;
  v_cargo_nome text;
  v_role text;
BEGIN
  -- Cada um vê as próprias permissões; as dos outros, só quem gere.
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.cargos_pode_gerir(p_tenant_id) THEN
    RETURN NULL;
  END IF;

  SELECT tm.cargo_id, tm.role, c.nome INTO v_cargo_id, v_role, v_cargo_nome
    FROM tenant_memberships tm
    LEFT JOIN cargos c ON c.id = tm.cargo_id
   WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Sem cargo, devolve NULO no lugar da lista: é o sinal para o app cair na
  -- regra antiga. Devolver lista vazia faria a pessoa perder o menu inteiro.
  IF v_cargo_id IS NULL THEN
    RETURN jsonb_build_object('cargo_id', NULL, 'cargo', NULL, 'role', v_role, 'permissoes', NULL);
  END IF;

  RETURN jsonb_build_object(
    'cargo_id', v_cargo_id,
    'cargo', v_cargo_nome,
    'role', v_role,
    'permissoes', COALESCE((
      SELECT jsonb_agg(codigo ORDER BY codigo) FROM (
        SELECT cp.permissao_codigo AS codigo
          FROM cargo_permissoes cp WHERE cp.cargo_id = v_cargo_id
        UNION
        SELECT e.permissao_codigo FROM membro_permissoes_extra e
         WHERE e.tenant_id = p_tenant_id AND e.user_id = p_user_id AND e.concede
        EXCEPT
        SELECT e.permissao_codigo FROM membro_permissoes_extra e
         WHERE e.tenant_id = p_tenant_id AND e.user_id = p_user_id AND NOT e.concede
      ) x
    ), '[]'::jsonb),
    'excecoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('codigo', permissao_codigo, 'concede', concede, 'motivo', motivo)
             ORDER BY permissao_codigo)
        FROM membro_permissoes_extra
       WHERE tenant_id = p_tenant_id AND user_id = p_user_id
    ), '[]'::jsonb)
  );
END;
$function$;

/** Atalho para o próprio usuário — é o que o app chama ao entrar. */
CREATE OR REPLACE FUNCTION public.minhas_permissoes(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.permissoes_efetivas(p_tenant_id, auth.uid());
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cargos_pode_gerir(uuid)',
    'public.permissoes_catalogo()',
    'public.cargos_do_tenant(uuid)',
    'public.cargo_salvar(uuid, text, text, integer, text, text[], uuid)',
    'public.cargo_excluir(uuid)',
    'public.membro_definir_cargo(uuid, uuid, uuid, jsonb)',
    'public.permissoes_efetivas(uuid, uuid)',
    'public.minhas_permissoes(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;
