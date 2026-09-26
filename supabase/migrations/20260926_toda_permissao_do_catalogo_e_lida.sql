-- ============================================================
-- Toda permissão do catálogo passa a ser lida — 26/09
--
-- O chefe perguntou por que só parte das permissões funciona. Medido em
-- produção: das 35 do catálogo, 18 eram lidas e 17 não. As 17 não eram
-- aleatórias — 14 eram SUB-ABAS.
--
-- A causa é que menu e sub-abas usam mecanismos diferentes. O menu
-- (`NovaSidebar`) e as rotas (`DashboardLayout`) leem a permissão; as sub-abas
-- eram desenhadas por `abasVisiveis()`, que filtrava por CARGO e nunca
-- consultava o catálogo. E as caixas do modal de Equipe gravavam em
-- `permissions.sub_permissions`, uma chave que NENHUM arquivo lia.
--
-- Em produção isso eram 45 pessoas com uma sub-aba desmarcada vendo a aba
-- assim mesmo, e 5 com "Gerenciar Roleta" marcado sem que isso desse acesso a
-- nada.
--
-- Esta migration arruma o CATÁLOGO. Quem passou a lê-lo é o código que vai
-- junto (abasVisiveis, PageTabs, InicioNovaPage, DashboardLayout,
-- AdminDashboard).
-- ============================================================

-- ------------------------------------------------------------
-- 1. SAEM as que não têm para onde apontar
--
-- Permissão que ninguém lê e que não tem tela é pior que permissão faltando:
-- quem marca a caixa acha que configurou, e a tela contradiz em silêncio. É
-- exatamente o defeito que este trabalho veio desfazer — mantê-las "para
-- quando a tela existir" seria repetir a causa.
--
-- Conferido antes: nenhum cargo referencia nenhuma das nove
-- (`cargo_permissoes` devolveu zero linhas para todas).
-- ------------------------------------------------------------
DELETE FROM public.cargo_permissoes WHERE permissao_codigo IN (
  -- Nunca tiveram tela alcançável:
  'octo-chat',            -- os DOIS itens de menu estão comentados no código
  'atividades',           -- a rota /atividades é só um desvio, não há página
  -- Telas removidas em 21/09 (P3.4) e na reforma do Comercial:
  'gestao-metricas',      -- `?tab=metricas` é redirecionado para fora
  'metricas-geral',       -- "Métricas Gerais / Por Equipes / Por Corretores"
  'metricas-equipes',     --   descrevem um Comercial que não existe mais;
  'metricas-corretores',  --   hoje as abas são geral/pré/atendimento/forecast
  -- Duplicatas: uma tela, dois códigos. Regra da casa é uma fonte por dado.
  'gestao-okrs',          -- `?tab=okrs` só redireciona para /okrs,
  'gestao-pdi',           --   governada por `leads-okrs` / `leads-pdi`
  -- Ação é role, não cargo (decidido em 21/09):
  'can_manage_roleta'     -- quem manda na roleta é o RLS de tenant_bolsao_config
);

DELETE FROM public.permissoes WHERE codigo IN (
  'octo-chat', 'atividades', 'gestao-metricas',
  'metricas-geral', 'metricas-equipes', 'metricas-corretores',
  'gestao-okrs', 'gestao-pdi', 'can_manage_roleta'
);

-- ------------------------------------------------------------
-- 2. ENTRAM as duas abas reais que não tinham caixa
--
-- Meia lista é pior que lista nenhuma: a aba sem código fica visível ao lado
-- das que somem, e quem configurou jura que a tela ignorou a marcação.
-- ------------------------------------------------------------
INSERT INTO public.permissoes (codigo, modulo, descricao, ordem, em_uso) VALUES
  ('leads-painel',   'Sub-abas de Início',           'Painel comercial', 125, true),
  ('gestao-equipes', 'Sub-abas de Gestão de Equipe', 'Equipes',          315, true)
ON CONFLICT (codigo) DO UPDATE
  SET modulo = EXCLUDED.modulo, descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem,  em_uso = EXCLUDED.em_uso;

-- ------------------------------------------------------------
-- 3. As oito que passaram a ser lidas
-- ------------------------------------------------------------
UPDATE public.permissoes SET em_uso = true
 WHERE codigo IN ('leads-funil', 'leads-okrs', 'leads-kpis', 'leads-pdi',
                  'leads-tarefas', 'leads-agenda',
                  'gestao-tarefas', 'gestao-acessos');

-- ------------------------------------------------------------
-- 4. A marcação que sobrou nas pessoas
--
-- Chave removida do catálogo não pode ficar gravada no membro: no dia em que
-- alguém reaproveitar o nome, a marcação velha decide por uma tela nova.
--
-- `can_manage_roleta` NÃO é apagada. Ela não atrapalha (ninguém a lê) e é o
-- registro de uma intenção de 5 gestores; se um dia a roleta virar permissão,
-- é essa marcação que diz quem eles queriam lá.
-- ------------------------------------------------------------
UPDATE public.tenant_memberships
   SET permissions = jsonb_set(
         permissions,
         '{sub_permissions}',
         (permissions->'sub_permissions')
           - 'metricas-geral' - 'metricas-equipes' - 'metricas-corretores'
           - 'gestao-okrs' - 'gestao-pdi' - 'gestao-metricas')
 WHERE permissions->'sub_permissions' IS NOT NULL
   AND (permissions->'sub_permissions') ?| array['metricas-geral','metricas-equipes',
         'metricas-corretores','gestao-okrs','gestao-pdi','gestao-metricas'];

-- `octo-chat` e `atividades` vivem na OUTRA lista (sidebar_permissions), e lá
-- são um array, não um objeto.
UPDATE public.tenant_memberships
   SET permissions = jsonb_set(
         permissions,
         '{sidebar_permissions}',
         (SELECT coalesce(jsonb_agg(v), '[]'::jsonb)
            FROM jsonb_array_elements(permissions->'sidebar_permissions') v
           WHERE v#>>'{}' NOT IN ('octo-chat', 'atividades')))
 WHERE jsonb_typeof(permissions->'sidebar_permissions') = 'array'
   AND (permissions->'sidebar_permissions') ?| array['octo-chat','atividades'];
