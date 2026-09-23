-- ============================================================
-- `count_leads_mensal` devolvia a contagem de leads de qualquer imobiliária
-- para quem nem estava logado.
--
-- Medido em PRODUÇÃO em 23/09/2026, no papel `anon`:
--
--   set local role anon;
--   select public.count_leads_mensal('65c69875-…'::uuid);  →  379
--
-- 379 é o número de leads da Lotus no mês. A chave anônima vai no bundle do
-- navegador, e o uuid da imobiliária está escrito dentro de uma policy do
-- próprio banco — então isto não exigia login, senha nem adivinhação.
--
-- ============================================================
-- A CAUSA-RAIZ NÃO É ESTA FUNÇÃO. É UM `REVOKE` QUE NÃO REVOGA.
-- ============================================================
--
-- Em 18/06 alguém já tinha visto o risco e escreveu, em
-- `20260618_fix_guc_rls_and_count_leads.sql`:
--
--   REVOKE EXECUTE ON FUNCTION public.count_leads_mensal(uuid) FROM anon;
--
-- Essa linha rodou, não deu erro, e **não mudou nada**. A permissão do `anon`
-- não vinha de um GRANT para `anon`: vinha de `PUBLIC`, que toda função nova
-- recebe por padrão. Revogar de um papel não tira o que ele herda de PUBLIC.
--
-- Dá para ver a olho nu na coluna `proacl`, e a diferença é um sinal de igual
-- sem nome antes dele:
--
--   count_leads_mensal    {=X/postgres, postgres=X, authenticated=X, ...}
--                          ↑ este é o PUBLIC, e é o buraco
--   imoveis_proprietarios {postgres=X, authenticated=X, service_role=X}
--                          ↑ aqui o PUBLIC foi revogado de verdade
--
-- Por isso esta migração revoga de `PUBLIC` **e** de `anon`, e só depois
-- concede a quem deve. É a ordem que importa: GRANT antes de REVOKE ALL perde
-- o GRANT.
--
-- Há mais funções com `=X/` na produção. Ficam para uma decisão à parte: a
-- maioria é gatilho (chamar direto já dá erro) ou confere permissão por dentro.
-- Esta é a que foi medida devolvendo dado de outra casa.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. O porteiro
--
-- `is_tenant_member` é o mesmo que o resto do sistema usa, e ele já aceita o
-- owner da plataforma. Quem não é da casa recebe 0 — e não um erro, porque
-- "quantos leads você teve" é uma pergunta cuja resposta honesta para um
-- estranho é "nenhum que eu vá te contar".
--
-- `auth.uid() IS NULL` continua passando: é o servidor falando direto com o
-- banco, sem JWT, que é como o api-server trabalha. Sem essa cláusula, uma
-- rotina de servidor passaria a receber 0 em silêncio — o pior desfecho
-- possível, porque ninguém vê erro e o número vira zero no relatório.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_leads_mensal(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(p_tenant_id) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO total
    FROM public.leads
   WHERE tenant_id = p_tenant_id
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';

  RETURN COALESCE(total, 0);
END;
$function$;

-- ------------------------------------------------------------
-- 2. A permissão, agora revogada de quem realmente a tinha
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.count_leads_mensal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_leads_mensal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_leads_mensal(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.count_leads_mensal(uuid) IS
  'Leads da imobiliária no mês corrente. Só para membro da casa (ou para o servidor, sem JWT). O anônimo não executa: era porta aberta até 23/09/2026.';

COMMIT;
