-- ============================================================
-- Os cinco cargos (item 8), montados sobre o que a Dash sabe controlar
--
-- O chefe mandou um print do **CORE, preparado para a Imobiliária Japi**, com
-- cinco cargos e dezesseis permissões, e pediu "algo parecido, mas com os
-- campos da nossa Dash". Os cinco cargos entram. Das dezesseis linhas, entram
-- as que a Dash consegue cumprir — e a análise linha a linha está em
-- `CARGOS-O-QUE-A-DASH-CUMPRE.md`, para ele decidir sobre o resto.
--
-- ============================================================
-- POR QUE NÃO DÁ PARA COPIAR A TABELA INTEIRA
-- ============================================================
--
-- Das 16 linhas do print, **14 são AÇÕES** — "redistribuir", "aprovar",
-- "publicar", "editar", "negociar". E a regra desta casa, decidida com o chefe
-- em 21/09 e escrita no cabeçalho de `20260921_cargos_e_permissoes.sql`, é que
-- **o cargo manda no que se VÊ e o `role` manda no que se PODE** — porque são
-- 277 políticas de segurança em 97 tabelas, 61 delas lendo `role`.
--
-- Transformar as 16 em caixinhas de cargo criaria 14 que não fazem nada. É a
-- doença que este sistema já tem: 17 das 33 permissões do catálogo são
-- gravadas e nunca lidas, e quem desmarca uma delas acredita ter restringido
-- algo. Não vamos somar mais catorze.
--
-- Quatro das 16 são, ainda por cima, funções que a Dash não tem: aprovar
-- desconto em proposta, acordo de aluguel em atraso (não há módulo de
-- locação), chamados, e repasse ao proprietário (o repasse daqui divide
-- comissão entre pessoas: corretor, líder, captador — não paga proprietário).
--
-- E uma delas iria na direção errada: no print, "Editar comissões" é da
-- Diretoria. Na Dash o trigger `venda_protege_comissao_pct` deixa só o **dono
-- da plataforma** mexer no percentual — nem o admin da imobiliária. Copiar o
-- print AFROUXARIA uma trava existente.
--
-- ============================================================
-- NINGUÉM É MOVIDO PARA CARGO NENHUM
-- ============================================================
--
-- Esta migração só CRIA os cargos. Nenhum `tenant_memberships.cargo_id` é
-- preenchido, e sem cargo o app cai na regra antiga — então a tela de todo
-- mundo continua exatamente como está hoje. Quem move é gente, pela tela de
-- Cargos, uma pessoa por vez.
--
-- (De passagem: o cabeçalho da migração do P4.1 diz que "a migração dá a cada
-- gestor um cargo que contém exatamente o que ele já vê". Isso nunca foi
-- escrito em código — não há um só INSERT em `cargos` em nenhuma migração.
-- Não faz falta, porque sem cargo ninguém perde nada; mas o comentário
-- descreve algo que não existe, e fica o registro.)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. O cargo Financeiro precisa ENXERGAR o financeiro
--
-- Aqui a regra "cargo só vê" encosta no seu próprio limite, e o caso é real:
-- o chefe perguntou *"já temos uma permissão de financeiro? ele poderia ver
-- também"*.
--
-- `financeiro_pode_ver()` sempre exigiu admin/owner do tenant. Um cargo
-- "Financeiro" com papel de corretor veria o MENU e abriria uma tela VAZIA —
-- a promessa sem a entrega. E dar papel de `admin` a quem cuida do dinheiro
-- resolveria a tela e abriria as outras 61 políticas junto: ele poderia
-- apagar lead, mexer em imóvel, gerir equipe.
--
-- A saída é cirúrgica: UMA função aprende a perguntar ao cargo. Não são as 61
-- políticas — é esta, que já é o porteiro único de todo o Financeiro. Quem
-- tiver a permissão `financeiro` pelo cargo passa; o resto continua igual.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_pode_ver(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
     AND (
       -- Sem JWT é o servidor falando direto com o banco.
       auth.uid() IS NULL
       OR public.is_platform_owner()
       OR public.is_tenant_admin_or_owner(p_tenant_id)
       -- E agora: o cargo que carrega a permissão `financeiro`.
       OR COALESCE(
            (public.permissoes_efetivas(p_tenant_id, auth.uid()) -> 'permissoes') ? 'financeiro',
            false)
     );
$function$;

-- ------------------------------------------------------------
-- 2. Os cinco cargos, por imobiliária
--
-- As permissões de cada um são cruzadas com o que a casa CONTRATOU
-- (`allowed_features`): um cargo não pode conceder o que a imobiliária não
-- tem, e prometer isso na tela de cargos seria a mesma mentira de novo.
--
-- Os níveis (100 / 70 / 50 / 30 / 10) só ordenam a tela e dizem quem é "mais
-- alto". Não são hierarquia de permissão: quem manda é a lista.
-- ------------------------------------------------------------
WITH modelo(nome, descricao, nivel, role, abas) AS (
  VALUES
    -- "A diretoria sempre tem acesso total", diz o rodapé do print. Aqui isso
    -- é literal: tudo o que a casa contratou.
    ('Diretoria', 'Acesso total. Responde pela imobiliária.', 100, 'admin',
     ARRAY[]::text[]),

    -- Gerente: o print dá a ele a equipe, os imóveis, os portais e o relatório
    -- da própria unidade — e NÃO dá o financeiro nem as configurações.
    ('Gerente', 'Lidera a equipe: vê os leads de todos, redistribui e acompanha os números da unidade.', 70, 'team_leader',
     ARRAY['leads','notificacoes','metricas','juridico','estudo-mercado','gestao-equipe',
           'imoveis','chat','octo-chat','metas','excel','relatorios','central-leads']),

    -- Financeiro: caixa, resultado e os documentos. Sem leads de ninguém.
    ('Financeiro', 'Cuida do dinheiro: contas, conciliação, notas e o resultado da casa.', 50, 'corretor',
     ARRAY['financeiro','relatorios','notificacoes','juridico']),

    -- Atendimento: fala com o cliente, e só. O print não lhe dá lead de
    -- equipe, nem imóvel, nem número nenhum.
    ('Atendimento', 'Atende quem chega: conversa, agenda e encaminha.', 30, 'corretor',
     ARRAY['leads','notificacoes','chat','octo-chat']),

    -- "Corretores veem só os próprios leads, agenda e imóveis" — o rodapé do
    -- print, que é exatamente o padrão que a Dash já aplica.
    ('Corretor', 'Atende os próprios leads, cadastra imóveis e acompanha as próprias metas.', 10, 'corretor',
     ARRAY['leads','notificacoes','metricas','juridico','estudo-mercado','imoveis','chat','octo-chat'])
),
novos AS (
  INSERT INTO public.cargos (tenant_id, nome, descricao, nivel_acesso, role)
  SELECT t.id, m.nome, m.descricao, m.nivel, m.role
    FROM public.tenants t CROSS JOIN modelo m
   -- Só casas com gente. Criar cargo em imobiliária vazia é encher a tela de
   -- alguém que nunca vai abri-la.
   WHERE EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = t.id)
  ON CONFLICT DO NOTHING
  RETURNING id, tenant_id, nome
)
INSERT INTO public.cargo_permissoes (cargo_id, permissao_codigo)
SELECT n.id, p.codigo
  FROM novos n
  JOIN modelo m ON m.nome = n.nome
  JOIN public.tenants t ON t.id = n.tenant_id
  JOIN public.permissoes p
    -- Diretoria (lista vazia) leva tudo; os outros, só o que está na lista.
    ON (cardinality(m.abas) = 0 OR p.codigo = ANY (m.abas))
 WHERE p.em_uso
   -- O portão de fora: o cargo não concede o que a casa não contratou.
   AND t.allowed_features @> to_jsonb(p.codigo)
ON CONFLICT DO NOTHING;

COMMIT;
