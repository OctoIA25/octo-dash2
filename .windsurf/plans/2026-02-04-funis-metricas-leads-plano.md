# Plano de análise e correção de funis/métricas
Este plano descreve as leituras e validações necessárias para diagnosticar a divergência entre funis, métricas de leads e Kanban, garantindo filtros por corretor e consistência entre dashboards.

## 1) Mapeamento do fluxo atual (auth, multi-tenant, leads)
- Revisar o fluxo de autenticação e resolução de tenant/roles em `useAuth`.
- Mapear como `tenant_id` e `assigned_agent_id` são usados em `leadsService` e `leadsMetricsService`.
- Identificar onde `useLeadsMetrics` é consumido (LeadSection, LeadsFunnelChart, VendedoresFunnelChart, GestaoSectionWithMetrics) e como os dados são filtrados.

## 2) Identificar divergências entre funis e Kanban
- Conferir a lógica de status/etapas em `LeadsFunnelChart` e `VendedoresFunnelChart` versus o mapeamento de status do Kanban em `leadsService`.
- Validar se “Interação” está sendo contabilizada em funis de Interessado e refletida em todos os lugares (aba Início, funis, métricas gerais).
- Verificar discrepâncias de “Novos Leads” no carregamento inicial (piscada de 7s) e fontes de dados em paralelo (`useLeadsData` vs `useLeadsMetrics`).

## 3) Proposta de correção
- Definir um único pipeline de dados para métricas/funis (preferencialmente `useLeadsMetrics`) para evitar double-source.
- Garantir filtros por corretor (assigned_agent_id) para corretores e visão total para admin/owner.
- Ajustar o mapeamento de status/etapas para que os funis reflitam exatamente o Kanban.

## 4) Validação
- Descrever passos de teste manual com os logins fornecidos:
  - Corretor: validar contagem no funil Interessado e etapas do Kanban.
  - Admin: validar somatório total em funis e métricas gerais.
- Confirmar que os funis “gerais” e “cliente interessado/proprietário” permanecem espelhados.
