# Análise do projeto + Login/Multi-tenant + Leads/Funis/Métricas
Este plano mapeia a arquitetura do OctoDash/OctoCRM e descreve onde estão implementados login/multi-tenant e os fluxos de leads (API, funil e métricas), além de listar lacunas e perguntas para fechar o entendimento.

## 1) Mapa rápido do projeto (arquitetura)
- **Frontend**
  - Stack: **Vite + React + TS + Tailwind + shadcn**.
  - Entry: `src/App.tsx`.
  - Proxy dev:
    - `vite.config.ts` faz proxy de `'/api/v1' -> http://localhost:3001` (API Node).
    - `'/api/kenlo'` proxy para o XML Kenlo.
- **Backend Node (pasta `server/`)**
  - `server/api-server.js`: API REST `/api/v1` (Express) com autenticação via **API Key**.
  - `server/proxy-production.js`: servidor de produção que **serve o build** + faz proxy Kenlo + também expõe rotas `/api/v1` (há duplicação/variações de lógica em relação ao `api-server.js`).
  - `server/kenlo-proxy.js`: proxy simples para XML Kenlo (dev/local).
- **Supabase**
  - Client no front: `src/lib/supabaseClient.ts` (persistência de sessão com `storageKey: 'octo-crm-auth'`).
  - Re-export: `src/integrations/supabase/client.ts`.
  - Migrations versionadas no repo (parcial): `supabase/migrations/*`.
  - Edge Function: `supabase/functions/xml-create-broker-access/index.ts`.

## 2) Login e Multi-tenant (CRM)
### 2.1 Fluxo de login no frontend
- **Tela**: `src/components/MinimalLoginScreen.tsx`.
- **Hook de autenticação**: `src/hooks/useAuth.ts`.
- **Mecânica**
  - Login via `supabase.auth.signInWithPassword`.
  - Após autenticar, o app exige que o usuário possua um vínculo em `my_memberships_with_tenant`.
  - Se o `tenantCode` foi informado, valida membership filtrando por `code`.

### 2.2 Papel “Owner” e impersonação
- `useAuth.ts` trata um usuário “owner” por **email fixo** (`OWNER_EMAIL`).
- Owner pode “impersonar” tenant via `localStorage` (`owner-impersonation`).
- Em `src/App.tsx`:
  - Se `isOwner` e `tenantId === 'owner'` mostra `OwnerDashboard`.
  - Caso contrário renderiza `DashboardLayout` (CRM) como admin do tenant.

### 2.3 Roles e permissões
- `useAuth.ts` diferencia:
  - `role` (UI): `gestao | corretor`
  - `systemRole`: `owner | admin | team_leader | corretor`
- Permissões de sidebar:
  - Derivadas por role (padrões em `src/types/permissions.ts`) ou por `tenant_memberships.permissions.sidebar_permissions`.

### 2.4 Modelagem multi-tenant (tabelas/views/RPC)
- O front depende de:
  - `my_memberships_with_tenant` (view)
  - `tenant_memberships` (tabela, com `permissions`)
  - `tenants` (tabela, com `auto_assign_broker` usado na aba de API)
  - RPCs usadas em `src/services/tenantMembersService.ts`:
    - `get_tenant_members`
    - `create_auth_user`
    - `add_tenant_member`
    - (opcional) `delete_user_completely`
- **Observação importante**: essas tabelas/views/RPCs **não aparecem** nas migrations do repo (pelo que foi encontrado). Provável que tenham sido criadas direto no Supabase Console.

### 2.5 RLS / bypass
- A estratégia do front para operações privilegiadas é usar **RPC** (ex.: `get_tenant_members`, `add_tenant_member`), sugerindo que RLS esteja ativo e que as funções tenham `security definer`.
- A Edge Function `xml-create-broker-access` usa `SUPABASE_SERVICE_ROLE_KEY` e chama `supabase.auth.admin.*`, além de inserir em tabelas (`tenant_brokers`, `tenant_memberships`, `imoveis_corretores`).

## 3) API, Funis e Métricas de Leads
### 3.1 Dois “domínios” de leads
- **Central de Leads / Integrações (Kenlo/Ingaia)**
  - Tabela: `kenlo_leads`.
  - Serviço: `src/services/kenloLeadsService.ts`.
  - Página: `src/pages/CentralLeadsPage.tsx`.
  - Integração: `src/pages/IntegracoesPage.tsx` autentica em webhook externo, busca leads e salva em `kenlo_leads`.
- **CRM/Kanban + Métricas (pipeline do corretor/admin)**
  - Tabela: `public.leads`.
  - Serviço kanban: `src/services/leadsService.ts`.
  - Serviço métricas: `src/services/leadsMetricsService.ts`.
  - Hook: `src/hooks/useLeadsMetrics.ts` (admin vê tudo do tenant; corretor vê apenas seus leads).

### 3.2 Funis/etapas
- Interessado: `FUNNEL_STAGES_INTERESSADO`.
- Proprietário: `FUNNEL_STAGES_PROPRIETARIO`.
- O `status` armazenado no banco é tratado como etapa do funil.

### 3.3 Segmentação por tipo de lead (`lead_type`)
- Migration: `supabase/migrations/20260204_add_lead_type_to_leads.sql`.
- O front assume:
  - `lead_type = 1` interessado (default)
  - `lead_type = 2` proprietário

### 3.4 Métricas
- `fetchLeadsForMetrics(tenantId, agentId, leadType)` filtra por `tenant_id`, opcionalmente `assigned_agent_id` (corretor) e `lead_type`.
- `calculateFunnelMetrics` e `calculateLeadsMetrics` computam:
  - contagens por status
  - contagens por temperatura
  - conversão (heurística baseada em `status` contendo “assinada/fechamento/contrato”)

### 3.5 API REST externa (para integrações)
- `server/api-server.js` e `server/proxy-production.js` expõem `/api/v1/*`.
- Autenticação: `tenant_api_keys` (Bearer `octo_*`), seta `req.tenantId`.
- Auto-atribuição de corretor no backend:
  - pipeline descrito em `docs/CORRETORES_ATRIBUICAO.md`.
  - consulta `properties_cache` / `imoveis_corretores` / roleta.
- UI de API Keys: `src/components/integrations/ApiIntegrationTab.tsx` + `src/services/apiKeyService.ts`.

## 4) Lacunas identificadas / riscos
- **Schema Supabase incompleto no repo**
  - Não há migrations para `tenants`, `tenant_memberships`, `tenant_api_keys`, `kenlo_leads`, views e RPCs.
  - Isso dificulta reproduzir ambiente e auditar RLS.
- **Duplicação de API**
  - Há rotas similares em `api-server.js` e `proxy-production.js`.
  - Risco: divergência de comportamento em dev vs prod.
- **Dois sistemas de “leads”**
  - `kenlo_leads` (central) e `public.leads` (CRM/kanban/métricas) parecem não ter um fluxo explícito de conversão/transferência no que foi lido.

## 5) Perguntas para você confirmar (para fechar entendimento)
- **[Multi-tenant]** Qual é a “fonte de verdade” para tenant do usuário: `tenant_memberships` + view `my_memberships_with_tenant` (parece que sim)?
- **[RLS]** As tabelas principais (`leads`, `kenlo_leads`, `tenant_*`) estão com RLS habilitado? Quais policies existem hoje?
- **[Leads]** Qual é o fluxo desejado entre `kenlo_leads` (central) -> `public.leads` (CRM)?
  - manual (botão “criar lead no CRM”)?
  - automático (sync)?
- **[API]** Em produção vocês usam `proxy-production.js` como “tudo em um” (servir app + API), ou rodam `api-server.js` separado?

## 6) Próximos passos (após sua aprovação)
- **Documentar** (em nível de código): mapa final de tabelas e RPCs usados pelo multitenant.
- **Auditar**: policies RLS e privilégios das RPCs.
- **Padronizar**: decidir qual servidor Node é canônico para `/api/v1`.
- **Leads**: definir e implementar (se necessário) a ponte `kenlo_leads` -> `public.leads`.
