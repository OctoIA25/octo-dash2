# Métricas por Role + Tipo de Lead (Interessado/Proprietário)

Este plano ajusta a origem dos dados e as regras de segmentação para que **Admin** veja métricas consolidadas do tenant e **Corretor** veja funis/gráficos apenas dos próprios leads, com **tipo de lead padrão = Interessado (id=1)**.

## 1) Leitura rápida do projeto (como está hoje)

### 1.1 Camadas
- **Frontend (Vite + React/TS)**
  - Dashboard de métricas: `MetricasPage` -> `GestaoSection` -> `MainMetricsSection` + vários gráficos (`LeadsFunnelChart`, `PreAtendimentoFunnelChart`, etc.)
  - Kanban do corretor: `MeusLeadsAtribuidosSection` consumindo `src/services/leadsService.ts` (tabela `public.leads`)
- **Backend Node/Express**
  - `server/api-server.js`: API v1 principal (foco em `kenlo_leads`)
  - `server/proxy-production.js`: versão mais completa (insere em `kenlo_leads` e também em `leads` para o Kanban)
- **Supabase/Postgres (multi-tenant)**
  - `kenlo_leads`: “Central de Leads” (histórico/ingestão)
  - `leads`: “Kanban do corretor” (funil operacional)
  - RLS do `leads` já existe (pelo contexto das últimas atualizações)

### 1.2 Problema estrutural atual
- A **UI de métricas** (funis/gráficos) é baseada em `ProcessedLead` (ex.: `tipo_negocio`, `tipo_lead`, `etapa_atual`) e não está conectada de forma canônica ao novo modelo do Kanban (`public.leads`).
- O **Kanban do corretor** já está correto no conceito (busca por `assigned_agent_id = auth.uid()`), mas as **métricas** ainda não usam o mesmo dado.

## 2) Requisitos funcionais (o que precisa acontecer)

### 2.1 Admin
- Funis e métricas **gerais do tenant**.
- Soma de **todos os corretores** e **todos os leads**.

### 2.2 Corretor
- Funis e gráficos **somente dos próprios leads**.
- Exemplo: se tem 2 leads na etapa `Visita Agendada` no Kanban, o funil do corretor deve mostrar 2 em `Visita Agendada`.

### 2.3 Tipos de Lead
- Se um lead for criado sem tipo explícito, ele deve ser **Interessado**.
- Tipos (conforme `/apidocs`):
  - `1` = Interessado
  - `2` = Proprietário
- Interessado entra nos funis de Interessado.
- Proprietário entra nos funis de Proprietário.

## 3) Decisão de “fonte de verdade” para métricas

### 3.1 Recomendação
- **Usar `public.leads` como fonte de verdade das métricas operacionais** (mesma tabela do Kanban).
- Motivo: garante coerência imediata entre o que está no Kanban e o que aparece nos funis/gráficos.

### 3.2 Impacto
- Os gráficos/funis hoje baseados em `ProcessedLead.etapa_atual` precisam passar a derivar dados do `public.leads.status` (e campos correlatos) e aplicar filtros por role + lead_type.

## 4) Modelo de dados necessário (DB)

### 4.1 Garantir coluna de tipo no `public.leads`
- **Adicionar** (ou confirmar existência) de uma coluna numérica:
  - `lead_type` (INT) ou `lead_type_id` (INT)
- **Default obrigatório**: `DEFAULT 1` (Interessado)
- **Backfill**: registros com `NULL` -> `1`
- Índice recomendado: `(tenant_id, lead_type)` e `(tenant_id, assigned_agent_id, lead_type)`

### 4.2 Status/etapas
- Para **Interessado (1)**, o funil deve usar os mesmos statuses do Kanban:
  - `Novos Leads`, `Interação`, `Visita Agendada`, `Visita Realizada`, `Negociação`, `Proposta Criada`, `Proposta Enviada`, `Proposta Assinada`
- Para **Proprietário (2)**, precisamos confirmar qual pipeline de status será o canônico.
  - Hoje a UI tem um funil de proprietários com etapas como `Não Exclusivo`, `Exclusivo`, `Feitura de Contrato`, etc.

## 5) Backend/API: onde aplicar “default lead_type = 1”

### 5.1 Inserção via API
- Ajustar `POST /api/v1/leads` (principalmente em `server/proxy-production.js`, que já insere no Kanban) para:
  - Ler `lead_type` do body.
  - Se ausente/nulo: setar `lead_type = 1`.
  - Inserir esse campo também no `public.leads`.

### 5.2 Segurança
- Manter o filtro por `tenant_id` vindo da API key.
- Não depender do front para setar `tenant_id`/`lead_type` corretamente.

## 6) Frontend: como atribuir métricas por role

### 6.1 Estratégia
- Criar um **único ponto de carregamento de métricas** baseado em `public.leads`:
  - **Admin**: query sem filtro de `assigned_agent_id`.
  - **Corretor**: query com `.eq('assigned_agent_id', auth.uid())`.
  - Ambos sempre `.eq('tenant_id', tenantId)` (ou via RLS/membership) e `.is('archived_at', null)`.
- Separar por tipo:
  - Interessado: `.eq('lead_type', 1)`
  - Proprietário: `.eq('lead_type', 2)`

### 6.2 Onde plugar
- Hoje `MetricasPage/GestaoSection/MainMetricsSection` recebem `leads: ProcessedLead[]`.
- Caminho recomendado:
  - Introduzir um “adapter” de `CRMLead` -> `ProcessedLead` (apenas para os componentes que ainda esperam esse formato), OU
  - Criar variantes dos gráficos que aceitem diretamente `CRMLead[]`/`Record<status, count>`.

### 6.3 Papel (role) de quem está logado
- Usar `useAuth()`:
  - `isAdmin` (gestão) => visão consolidada
  - `isCorretor` => visão individual

## 7) Entregas (milestones)

1. **DB**
   - Migration: coluna `lead_type` default 1 + backfill + índices.

2. **API**
   - `POST /api/v1/leads`: persistir `lead_type` no `public.leads`.
   - Garantir fallback automático (ausente => 1).

3. **Frontend (Métricas)**
   - Novo hook/service para buscar dados do `public.leads` conforme role.
   - Funis/Gráficos de Interessado passam a refletir o Kanban.
   - Funis/Gráficos de Proprietário filtrados por `lead_type=2`.

4. **Validação**
   - Criar lead sem `lead_type` via API:
     - Deve aparecer nos funis de Interessado.
   - Criar lead com `lead_type=2`:
     - Deve aparecer no funil de Proprietários.
   - Corretor:
     - Contagem do funil deve bater com o Kanban (por status).
   - Admin:
     - Contagem deve ser a soma de todos os corretores.

## 8) Perguntas que eu preciso que você confirme antes de eu implementar

1. **No banco, o campo do tipo vai se chamar exatamente** `lead_type` (int) no `public.leads`? (Hoje não achei migration disso no repo.)
2. **Quais são as etapas oficiais do funil de Proprietário (lead_type=2)** que você quer considerar? (As da UI atual: `Não Exclusivo`, `Exclusivo`, `Feitura de Contrato` etc. estão ok?)
3. Para o corretor logado, você quer que a página **/metricas** também exista com visão individual, ou a visão individual fica apenas no Kanban e criamos um card de métricas dentro de “Meus Leads”?
