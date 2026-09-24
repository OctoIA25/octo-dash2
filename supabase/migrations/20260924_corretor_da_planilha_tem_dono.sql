-- ============================================================
-- Quem é o corretor que a planilha chama de "Gabi" — 24/09
--
-- O chefe pediu que a conferência de vendas ficasse "bem interligada com os
-- relatórios individuais e os de equipe". Fui medir o que liga hoje:
--
--   37 vendas ativas
--   19 casam com um corretor cadastrado, e as 19 têm equipe
--   18 NÃO casam — e somam R$ 8,8 MILHÕES de VGV
--
-- São 14 nomes distintos na planilha, 10 deles sem dono. E seis desses dez são
-- apelido de gente que JÁ está cadastrada:
--
--   "Fernanda" (5 vendas)   "Gabi" (1)        "Flávia" (3)
--   "Humberto" (2)          "Andre" (1)       "Gabrielle" (1)
--   "Flávia e Humberto" (1) — DUAS pessoas na mesma célula
--
-- ============================================================
-- POR QUE NÃO CASAR PELO PRIMEIRO NOME
-- ============================================================
--
-- Porque já custou caro. O P0.2 mediu: existem TRÊS Fernandas cadastradas,
-- duas com o nome idêntico e e-mails diferentes. Casar por nome daria 12 leads
-- à Fernanda errada, e ela passaria a ver contato de cliente que não é dela —
-- sem ninguém perceber, porque a tela ficaria igualmente plausível.
--
-- Um relatório de comissão errado é pior: ele vira pagamento.
--
-- ============================================================
-- O QUE ESTA MIGRAÇÃO FAZ, E O QUE NÃO FAZ
-- ============================================================
--
-- Cria o LUGAR onde a resposta mora, e não a resposta. Nenhum apelido é
-- semeado: a lista nasce vazia, e a tela mostra os dez nomes para alguém
-- resolver um a um — que é o mesmo desenho dos apelidos de construtora,
-- fechado hoje de manhã.
-- ============================================================

BEGIN;

-- Coluna, e não tabela: é uma lista curta e curada por pessoa, e uma tabela
-- com RLS, policy e grant para guardar meia dúzia de textos seria peso sem
-- ganho. Mesma decisão de `construtoras.aliases`.
ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS apelidos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenant_memberships.apelidos IS
  'Como esta pessoa aparece escrita na planilha comercial: "Gabi", "Fernanda", "Andre". Nasce vazia — ninguem adivinha, alguem concilia. Ver 20260924_corretor_da_planilha_tem_dono.';

-- A coluna nova precisa de GRANT explícito quando a tabela concede coluna a
-- coluna. `tenant_memberships` concede a tabela inteira, então basta o NOTIFY
-- para o PostgREST enxergar — sem ele a coluna fica invisível, sem erro.
-- ------------------------------------------------------------
-- Quem é o dono de cada nome escrito na planilha
--
-- Uma função, e não a mesma consulta copiada em cada relatório: são quatro
-- telas que perguntam isso (painel comercial, filtro por clique, gráfico de
-- evolução e o relatório de anúncios), e quatro cópias divergiriam na primeira
-- correção — que é a regra que o chefe repete.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretor_da_planilha(p_tenant_id uuid, p_nome text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- O nome canônico primeiro: se um apelido disputar a chave com o nome de
  -- verdade de outra pessoa, quem tem o nome ganha.
  SELECT tm.user_id
    FROM public.tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id
     AND public.normalizar_texto(COALESCE(u.raw_user_meta_data ->> 'name', u.email))
         = public.normalizar_texto(p_nome)
   LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.corretor_da_planilha_por_apelido(p_tenant_id uuid, p_nome text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.corretor_da_planilha(p_tenant_id, p_nome),
    (SELECT tm.user_id
       FROM public.tenant_memberships tm, unnest(tm.apelidos) a
      WHERE tm.tenant_id = p_tenant_id
        AND public.normalizar_texto(a) = public.normalizar_texto(p_nome)
      LIMIT 1)
  )
$function$;

COMMENT ON FUNCTION public.corretor_da_planilha_por_apelido(uuid, text) IS
  'De quem e a venda que a planilha atribui a este nome. Tenta o nome cadastrado e depois os apelidos. NULO quando ninguem reivindica — e nulo e resposta, nao falha.';

-- ------------------------------------------------------------
-- A lista do que falta conciliar
--
-- É o que a tela mostra para alguém resolver. Traz o PESO de cada nome — em
-- vendas e em VGV — porque conciliar dez nomes na ordem errada deixa o milhão
-- para o fim.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corretores_da_planilha_sem_dono(p_tenant_id uuid)
RETURNS TABLE (nome text, vendas bigint, vgv numeric, comissao numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(btrim(cs.corretor_nome), '') AS nome,
         count(*) AS vendas,
         round(COALESCE(sum(cs.valor_vgv), 0), 2) AS vgv,
         round(COALESCE(sum(cs.comissao_total_venda), 0), 2) AS comissao
    FROM public.commercial_sales cs
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND public.financeiro_pode_ver(p_tenant_id)
     AND NULLIF(btrim(cs.corretor_nome), '') IS NOT NULL
     AND public.corretor_da_planilha_por_apelido(p_tenant_id, cs.corretor_nome) IS NULL
   GROUP BY 1
   ORDER BY 3 DESC NULLS LAST
$function$;

COMMENT ON FUNCTION public.corretores_da_planilha_sem_dono(uuid) IS
  'Os nomes da planilha comercial que nao casam com nenhum membro, com quantas vendas e quanto VGV cada um carrega. E a lista de conciliacao — sem ela, o relatorio individual perde metade do VGV em silencio.';

REVOKE ALL ON FUNCTION public.corretor_da_planilha(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.corretor_da_planilha_por_apelido(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.corretores_da_planilha_sem_dono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corretor_da_planilha(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corretor_da_planilha_por_apelido(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corretores_da_planilha_sem_dono(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
