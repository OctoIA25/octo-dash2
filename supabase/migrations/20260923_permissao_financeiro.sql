-- ============================================================
-- A seção Financeiro ganha permissão própria (pedido do chefe, 23/09/2026)
--
-- O pedido: *"toda a sessão de financeiro pode subir, mas coloca para só Admin
-- e Diretor poder ver isso"* e *"já temos uma permissão de financeiro? ele
-- poderia ver também"*.
--
-- A resposta às duas perguntas era não:
--
--   1. NÃO EXISTE PAPEL "DIRETOR". São quatro: owner, admin, team_leader,
--      corretor. O equivalente é um CARGO chamado Diretor — e cargo é uma
--      lista de permissões, não um quinto papel. Por isso o caminho é criar a
--      permissão, e não inventar o papel: assim "Diretor", "Financeiro",
--      "Controller" e o que mais vier são cargos que a imobiliária monta
--      sozinha, sem código novo a cada nome.
--
--   2. NÃO EXISTE PERMISSÃO "FINANCEIRO". O menu do Financeiro reaproveitava
--      `relatorios` — que o team_leader também tem. Medido em produção em
--      23/09: 5 team_leaders. Todos enxergavam o menu do Financeiro.
--
-- ============================================================
-- O QUE MUDA PARA QUEM, E O QUE NÃO MUDA
-- ============================================================
--
-- **Tira** o menu do Financeiro dos 5 team_leaders. É o pedido, dito com
-- todas as letras: hoje eles veem, e o chefe quer só Admin.
--
-- **Não tira nada do banco**, porque o banco já era mais restrito que a tela:
-- `financeiro_pode_ver()` sempre exigiu admin/owner, e as RPCs devolviam NULL
-- para o team_leader. Ele via o MENU e abria uma tela VAZIA. Esta migração
-- alinha a tela ao banco — a restrição já existia, mal contada.
--
-- **Não mexe em cargo nenhum**, porque a tabela `cargos` ainda não existe em
-- produção (conferido em 23/09). Quando o P4.1 subir, `financeiro` estará no
-- catálogo e poderá ser marcada em qualquer cargo — inclusive um "Diretor".
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A permissão entra no catálogo
--
-- `em_uso = true` porque, diferente de 17 das 33 que já existem, esta É LIDA:
-- ela rege o menu e as duas rotas. Marcar como `em_uso` uma chave que ninguém
-- lê é o que faz alguém desmarcá-la e acreditar ter restringido algo.
--
-- Ordem 145: logo depois de `relatorios` (140), que é de onde ela saiu.
-- ------------------------------------------------------------
INSERT INTO public.permissoes (codigo, modulo, descricao, ordem, em_uso)
VALUES ('financeiro', 'Abas do menu',
        'Financeiro (A receber, A pagar, Fluxo, DRE, Conciliação, Notas) e Conferência de Vendas',
        145, true)
ON CONFLICT (codigo) DO UPDATE
  SET modulo = EXCLUDED.modulo,
      descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem,
      em_uso = EXCLUDED.em_uso;

-- ------------------------------------------------------------
-- 2. Quem contratou Relatórios também tem Financeiro
--
-- `allowed_features` é o portão de fora: é o que a imobiliária contratou, e
-- nenhuma permissão de pessoa atravessa ele. Sem esta linha a chave nasceria
-- no catálogo e o menu sumiria para TODO MUNDO menos o dono da plataforma —
-- incluindo os admins que o chefe quer que vejam.
--
-- O critério é `relatorios` porque era exatamente sob essa chave que o
-- Financeiro vivia: quem já alcançava a seção continua alcançando, no nível da
-- imobiliária. Quem não contratou Relatórios não ganha nada novo.
--
-- Medido em 23/09: 2 dos 9 tenants têm `relatorios` (Lotus Brokers e Japi).
-- ------------------------------------------------------------
UPDATE public.tenants
   SET allowed_features = allowed_features || '["financeiro"]'::jsonb
 WHERE allowed_features @> '["relatorios"]'::jsonb
   AND NOT (allowed_features @> '["financeiro"]'::jsonb);

COMMIT;
