-- ============================================================
-- Os cargos antigos herdam as sub-abas — 29/09
--
-- A partir de hoje a sub-aba (Funil, KPIs, Equipes…) vem do CARGO, como as
-- abas do menu. Até aqui vinha das caixas de cada pessoa, com "sem marcação =
-- liberada".
--
-- Os cargos padrão nasceram em 23/09 (20260923_cinco_cargos), quando as
-- sub-abas ainda estavam com em_uso = false — por isso nenhum deles recebeu
-- sub-aba. Só a Lotus as tem, porque alguém as marcou na tela de Cargos.
--
-- Medido em produção antes desta migration: sem ela, a troca tiraria as
-- sub-abas de 20 pessoas na Área de Teste, 43 na "imobiliaria 9" e de 4 casas
-- de uma pessoa só. Com ela, ninguém perde nada do que vê hoje.
--
-- A regra: cargo que tem a aba-mãe e NENHUMA sub-aba do grupo é cargo que
-- nunca foi configurado — recebe o grupo inteiro, que é o que as pessoas dele
-- já enxergam. Cargo com ao menos uma sub-aba do grupo foi configurado por
-- alguém e fica como está.
-- ============================================================

BEGIN;

WITH grupo(pai, codigo) AS (
  SELECT 'leads', codigo FROM public.permissoes WHERE modulo = 'Sub-abas de Início'
  UNION ALL
  SELECT 'gestao-equipe', codigo FROM public.permissoes WHERE modulo = 'Sub-abas de Gestão de Equipe'
)
INSERT INTO public.cargo_permissoes (cargo_id, permissao_codigo)
SELECT mae.cargo_id, g.codigo
  FROM public.cargo_permissoes mae
  JOIN grupo g ON g.pai = mae.permissao_codigo
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.cargo_permissoes ja
     JOIN grupo g2 ON g2.codigo = ja.permissao_codigo
    WHERE ja.cargo_id = mae.cargo_id AND g2.pai = g.pai
 )
ON CONFLICT DO NOTHING;

COMMIT;
