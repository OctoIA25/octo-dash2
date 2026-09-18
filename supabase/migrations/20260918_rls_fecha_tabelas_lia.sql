-- Migration: fecha as 14 tabelas `lia_*` para anon e authenticated
-- Data: 2026-09-18
-- Descrição: a auditoria de 16/09 registrou "lia_* sem RLS" e nada tinha sido
-- corrigido. Medido agora, tabela a tabela:
--
--   * as 14 dão a `anon` SELECT, INSERT, UPDATE, DELETE e TRUNCATE. A anon key
--     vai no bundle do front, então é permissão pública;
--   * 11 têm RLS ligada e ZERO policies — a leitura falha fechada, mas o grant
--     fica armado: a primeira policy permissiva escrita por engano abre tudo;
--   * 3 estão com RLS DESLIGADA — `lia_bolsao_estado`, `lia_fila_vistas` e
--     `lia_regras`. Nessas não há nada segurando: qualquer visitante lê as 31
--     linhas, de todas as imobiliárias. Não é arma engatilhada, é porta aberta.
--
-- E o dado não é inócuo: `lia_visitas` tem 629 linhas com `lead_nome` e
-- `lead_phone`; `lia_captacoes` e `lia_perguntas_corretor` também carregam
-- colunas pessoais.
--
-- A convenção do repositório para `lia_*` já é "só o servidor lê, com
-- service_role": nenhum arquivo de src/ consulta essas tabelas (conferido por
-- grep em todo o front), e os quatro consumidores vivos estão em server/ —
-- observability/tenantHealthRoutes.js, agent-telemetry/routes.js e os módulos de
-- followup. Esta migration apenas faz o banco refletir a convenção.
--
-- Por que revogar TAMBÉM a leitura de `authenticated`, e não só deixar a RLS
-- filtrar: RLS com zero policies devolve LISTA VAZIA, sem erro. Foi assim que a
-- coluna `visit_date` enganou todo mundo por meses. Sem o grant, a mesma tentativa
-- falha com 42501 e aparece no log — erro alto é melhor que zero silencioso.
--
-- ORDEM DO DEPLOY: independente do front. Nada em src/ é afetado.
-- Rollback: devolver os grants reabre as tabelas para a anon key.

REVOKE ALL ON
  public.lia_bolsao_estado,
  public.lia_captacoes,
  public.lia_corretor_messages,
  public.lia_empreendimento_chunks,
  public.lia_empreendimento_views,
  public.lia_fila_vistas,
  public.lia_followups,
  public.lia_interaction_examples,
  public.lia_lead_extra,
  public.lia_lead_facts,
  public.lia_perguntas_corretor,
  public.lia_regras,
  public.lia_unidades,
  public.lia_visitas
FROM anon, authenticated;

-- As três que estavam sem RLS. Com o grant revogado acima a porta já fecha, mas
-- deixar a RLS desligada mantém a tabela dependendo só do grant — uma camada só.
ALTER TABLE public.lia_bolsao_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lia_fila_vistas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lia_regras       ENABLE ROW LEVEL SECURITY;
