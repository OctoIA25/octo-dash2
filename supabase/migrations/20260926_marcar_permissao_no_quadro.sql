-- ============================================================
-- Marcar e desmarcar permissão direto no quadro de Cargos — 26/09
--
--   "Na nova forma de ver as permissões de cada cargo por aquela print que meu
--    chefe fez, também torne possível trocar as permissões por aquela mesma
--    tabela."
-- ============================================================
--
-- POR QUE NÃO DEU PARA REAPROVEITAR `cargo_salvar`
--
-- Ela troca o PACOTE INTEIRO: recebe a lista final e faz DELETE + INSERT. Para
-- a gaveta de edição isso é o certo — os interruptores de lá mostram o estado
-- final, e é isso que a pessoa confirma ao salvar.
--
-- No quadro, cada clique é uma célula. Usar `cargo_salvar` obrigaria a tela a
-- ler a lista que ela tem em memória, juntar a mudança e mandar tudo de volta.
-- Dois cliques seguidos no mesmo cargo, antes de a tela recarregar, mandariam
-- duas listas montadas sobre o MESMO estado antigo — e a segunda apagaria a
-- primeira. Sem erro: a marca simplesmente voltaria sozinha, e quem clicou
-- acharia que não pegou.
--
-- São 35 permissões por 6 cargos: 210 células. Clique rápido em sequência não
-- é caso raro ali, é o uso normal.
--
-- Por isso esta função escreve UMA linha, e não recebe lista nenhuma. Duas
-- marcações em células diferentes não têm como se atropelar, porque nenhuma
-- delas afirma nada sobre as outras.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cargo_permissao_marcar(
  p_cargo_id  uuid,
  p_permissao text,
  p_marcar    boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_nome   text;
BEGIN
  SELECT c.tenant_id, c.nome INTO v_tenant, v_nome
    FROM cargos c WHERE c.id = p_cargo_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Mesmo porteiro de `cargo_salvar`, e conferido no BANCO: `cargos`,
  -- `cargo_permissoes` e `membro_permissoes_extra` não têm grant para o
  -- navegador, então este é o único caminho.
  IF NOT public.cargos_pode_gerir(v_tenant) THEN RETURN NULL; END IF;

  -- Permissão fora do catálogo é engano de quem chamou, não permissão nova:
  -- aceitar criaria uma chave que nenhuma tela lê.
  IF NOT EXISTS (SELECT 1 FROM permissoes p WHERE p.codigo = p_permissao) THEN
    RAISE EXCEPTION 'Permissão que não existe no catálogo: %', p_permissao
      USING ERRCODE = 'check_violation';
  END IF;

  -- A TRANCA DA PRÓPRIA PORTA, a mesma de `cargo_salvar`.
  --
  -- A tela de Cargos mora atrás de "gestao-equipe". Desmarcar essa célula no
  -- próprio cargo tira de quem clicou o caminho de volta — e no quadro isso é
  -- MAIS fácil de acontecer que na gaveta: lá a pessoa desmarca, revê a lista
  -- e confirma; aqui um clique já grava. Sem esta trava, o segundo clique do
  -- dia poderia trancar o administrador para fora, sem erro nenhum na tela.
  IF p_permissao = 'gestao-equipe'
     AND p_marcar IS NOT TRUE
     AND EXISTS (SELECT 1 FROM tenant_memberships tm
                  WHERE tm.cargo_id = p_cargo_id AND tm.user_id = auth.uid())
     AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Este é o seu próprio cargo, e sem "Gestão de Equipe" você perderia o acesso a esta tela. Peça a outro administrador, ou mantenha a permissão.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_marcar THEN
    INSERT INTO cargo_permissoes (cargo_id, permissao_codigo)
    VALUES (p_cargo_id, p_permissao)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM cargo_permissoes
     WHERE cargo_id = p_cargo_id AND permissao_codigo = p_permissao;
  END IF;

  -- Devolve o estado REAL depois da escrita, e não o que foi pedido: é com
  -- isto que a tela confirma a marca otimista que já pintou. Se o banco tiver
  -- decidido diferente, ela corrige em vez de insistir no que mostrou.
  RETURN jsonb_build_object(
    'cargo_id', p_cargo_id,
    'permissao', p_permissao,
    'marcada', EXISTS (SELECT 1 FROM cargo_permissoes
                        WHERE cargo_id = p_cargo_id AND permissao_codigo = p_permissao),
    'permissoes', (SELECT count(*) FROM cargo_permissoes WHERE cargo_id = p_cargo_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.cargo_permissao_marcar(uuid, text, boolean) IS
  'Marca ou desmarca UMA permissao de UM cargo, direto no quadro. Escreve uma linha so, para dois cliques seguidos nao se atropelarem -- `cargo_salvar` troca o pacote inteiro e serve a gaveta de edicao.';

-- `pg_default_acl` concede tudo a `anon` em objeto novo, e funcao recriada
-- nasce com EXECUTE para PUBLIC. Permissao e a ultima coisa que pode ficar
-- aberta a quem nao fez login.
REVOKE ALL ON FUNCTION public.cargo_permissao_marcar(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargo_permissao_marcar(uuid, text, boolean) TO authenticated, service_role;

-- O PostgREST guarda a assinatura das funcoes em cache: sem isto a chamada
-- nova volta "function not found", em silencio, como uma tela que nao salva.
NOTIFY pgrst, 'reload schema';
