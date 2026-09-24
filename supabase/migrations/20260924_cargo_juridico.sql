-- ============================================================
-- O sexto cargo: Jurídico
--
-- O chefe escreveu, sobre o print do CORE: *"Adicionaria somente um
-- Jurídico"*. A entrega anterior (`20260923_cinco_cargos.sql`) criou os cinco
-- do print e **deixou este de fora** — era o pedido mais literal da mensagem
-- e passou batido. Fica aqui, e fica o registro de que foi omissão, não
-- decisão.
--
-- ============================================================
-- O ÚNICO CARGO CUJO CONTEÚDO ELE NÃO DITOU
-- ============================================================
--
-- Os outros cinco vieram com as colunas marcadas no print. Este não tem
-- coluna nenhuma: ele disse que acrescentaria, não o que o cargo veria. Então
-- o conteúdo abaixo é **proposta**, montada pelo que a aba Jurídico da Dash
-- já faz — Visão Geral e Propostas — e não uma leitura do print.
--
-- Deixei estreito de propósito. Um cargo que nasce largo demais é difícil de
-- apertar depois: quem já entrou nele reclama do que perdeu. Largar é fácil,
-- e a tela de Cargos faz isso sem código.
--
-- `imoveis` entra porque contrato e proposta falam de um imóvel, e sem a aba
-- a pessoa não consegue abrir o que está redigindo. `leads` fica FORA: o
-- jurídico trabalha sobre a proposta, não sobre a prospecção.
-- ============================================================

BEGIN;

WITH novo AS (
  INSERT INTO public.cargos (tenant_id, nome, descricao, nivel_acesso, role)
  SELECT t.id, 'Jurídico',
         'Cuida de contratos e propostas: redige, confere e acompanha a assinatura.',
         40, 'corretor'
    FROM public.tenants t
   WHERE EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = t.id)
  ON CONFLICT DO NOTHING
  RETURNING id, tenant_id
)
INSERT INTO public.cargo_permissoes (cargo_id, permissao_codigo)
SELECT n.id, p.codigo
  FROM novo n
  JOIN public.tenants t ON t.id = n.tenant_id
  JOIN public.permissoes p ON p.codigo IN ('juridico', 'notificacoes', 'imoveis')
 WHERE p.em_uso
   -- O mesmo portão dos outros: o cargo não concede o que a casa não contratou.
   AND t.allowed_features @> to_jsonb(p.codigo)
ON CONFLICT DO NOTHING;

COMMIT;
