# Leads Ownership + Kanban (Multi-tenant)

Este plano unifica a “propriedade” do lead (qual corretor é responsável) e o funil/kanban para que leads criados via API apareçam no Kanban do corretor na etapa correta, com suporte multi-tenant e RLS.

## 1) Diagnóstico (por que hoje não aparece em “Meus Leads”)

- O lead criado via API está sendo inserido em `public.kenlo_leads` (campos como `attended_by_name`, `stage`, `temperature`).
- O Kanban “Meus Leads” do front **não lê `kenlo_leads`**.
  - Ele usa `src/services/bolsaoService.ts` e consulta diretamente a tabela `public.bolsao` via Supabase client (front).
  - Filtro do “Meus Leads” (corretor):
    - `bolsao.corretor_responsavel == nomeCorretor` OU `bolsao.corretor == nomeCorretor`
  - Etapa/coluna do Kanban é derivada de `bolsao.status` (strings como `novos-leads`, `interacao`, `visita-agendada`, etc.).
- Resultado: mesmo atribuindo `attended_by_name` no `kenlo_leads`, **o Kanban não vê** porque o dado está em outra tabela e com outro esquema.

## 2) Objetivo funcional (o “fluxo ideal”)

- **Criar lead via API** já com:
  - `tenant_id`
  - `assigned_agent_id` (UUID do `auth.users.id` do corretor) e `assigned_agent_name`
  - `status`/etapa do Kanban (ex.: `visita-agendada`) *ou* um mapeamento estável de `stage` (int) para `status` do Kanban.
- **Corretor logado** deve ver automaticamente o lead no “Meus Leads” **na coluna correspondente**.
- Drag-and-drop no Kanban deve persistir a mudança e ser visível:
  - para o próprio corretor
  - e para admins (visão geral)
- Tudo **multi-tenant**: corretor só vê leads do seu `tenant_id`.

## 3) Decisão de arquitetura (fonte de verdade)

Há duas opções. A recomendada é a A.

### Opção A (recomendada): Kanban usar `public.leads` (tabela CRM) como fonte de verdade
- Já existe `public.leads` com colunas adequadas:
  - `tenant_id`, `status`, `temperature`, `property_code`, `assigned_agent_id`, `assigned_agent_name`, `visit_date`, etc.
- A API (`/api/v1/leads`) passa a escrever/ler dessa tabela para tudo que é “lead operacional do CRM/kanban”.
- `kenlo_leads` fica como ingest/espelho de importação Kenlo (histórico/integração), mas não como kanban principal.

### Opção B (curto prazo / legado): duplicar lead no `public.bolsao`
- Ao criar lead via API, também inserir uma linha compatível em `public.bolsao`.
- Contras:
  - Duplica domínio/estado (bolsão vs CRM)
  - Tende a gerar divergências e mais manutenção

## 4) Modelo de dados e regras (multi-tenant + ownership)

### 4.1 Ownership do lead
- Campo canônico: `public.leads.assigned_agent_id` (UUID do corretor, `auth.users.id`).
- Complemento: `assigned_agent_name` para exibição e compatibilidade.

### 4.2 Etapas (Kanban)
- Usar `public.leads.status` como **string** compatível com o Kanban atual:
  - `novos-leads`, `interacao`, `visita-agendada`, `visita-realizada`, `negociacao`, `proposta-criada`, `proposta-enviada`, `proposta-assinada`
- Manter mapeamento entre `stage` (int dos apidocs) e `status` (string do Kanban), ex.:
  - 1 -> `novos-leads`
  - 2 -> `interacao`
  - 3 -> `visita-agendada`
  - 4 -> `visita-realizada`
  - 5 -> `negociacao`
  - 6 -> `proposta-criada`
  - 7 -> `proposta-enviada`
  - 8/9 -> `proposta-assinada`

## 5) Mudanças necessárias (backend)

### 5.1 API de criação de lead
- Ajustar `/api/v1/leads` para:
  - Resolver corretor como hoje (Meus Imóveis / XML / roleta), mas retornar também `broker_id` (UUID) quando possível.
  - Inserir o lead em `public.leads` com:
    - `tenant_id`
    - `name`, `phone`, `email`, `source` (ex.: `API`)
    - `property_code`
    - `temperature` (mapear para `cold|warm|hot`)
    - `status` (derivado de `stage` int ou recebido como string)
    - `assigned_agent_id` + `assigned_agent_name`

### 5.2 Endpoints de movimentação
- Garantir que os endpoints do `/apidocs` alterem o mesmo registro usado pelo Kanban:
  - `PATCH /api/v1/leads/:id/stage` -> atualiza `public.leads.status` (via mapeamento)
  - `PATCH /api/v1/leads/:id/temperature` -> `public.leads.temperature`
  - `PATCH /api/v1/leads/:id/broker` -> `public.leads.assigned_agent_id`/`assigned_agent_name`

### 5.3 RLS multi-tenant
- Criar políticas em `public.leads`:
  - **corretor**: pode `SELECT/UPDATE` apenas onde `tenant_id` = tenant do usuário e `assigned_agent_id` = `auth.uid()` (ou via membership)
  - **admin**: pode `SELECT/UPDATE` todos os leads do `tenant_id`
- Para chamadas via API key (servidor), usar service role **ou** políticas específicas para o role anon com validação por `tenant_api_keys` (ideal: service role no servidor).

## 6) Mudanças necessárias (front)

### 6.1 Trocar a fonte do Kanban “Meus Leads”
- Substituir `bolsaoService.fetchLeadsDoCorretor()` por um serviço de leads do CRM que consuma a API (`/api/v1/leads`) filtrando por `assigned_agent_id` do usuário atual.
- Alternativa (menos ideal): fazer query direta em `public.leads` via Supabase client do front.

### 6.2 Persistir movimentações no mesmo lugar
- Hoje o drag-and-drop chama `atualizarStatusLead()` que atualiza `bolsao.status`.
- Alterar para chamar `PATCH /api/v1/leads/:id/stage` (ou endpoint equivalente) para atualizar `public.leads.status`.

## 7) Validações / Critérios de aceite

- Criar lead via API já em `visita-agendada`:
  - Deve aparecer no Kanban do corretor, na coluna `Visita Agendada`, imediatamente.
- Trocar etapa no Kanban:
  - Deve refletir no banco e permanecer após refresh.
- Multi-tenant:
  - Corretor de outro tenant não consegue ver nem mover o lead.
- Admin:
  - Consegue ver todos os leads do tenant e mover/atribuir.

## 8) Perguntas rápidas (para eu implementar certo)

1. O “Meus Leads” deve continuar existindo como Kanban do CRM (recomendado), ou ele precisa continuar sendo literalmente a tabela `bolsao` por algum motivo de produto?
2. O login do corretor no front hoje identifica o corretor por **nome** (`currentCorretor`) ou você consegue obter sempre o `auth.user.id`? (para usarmos `assigned_agent_id` corretamente)
3. Você quer manter `kenlo_leads` apenas como “Central de Leads” importada do Kenlo (histórico), e `public.leads` como funil operacional do corretor?
