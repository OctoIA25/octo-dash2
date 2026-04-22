# API Brokers: fonte correta (Acessos e Permissões) 

Este plano corrige o endpoint de listagem de corretores para que a API retorne **todos os corretores cadastrados na aba “Acessos e Permissões”** (fonte Supabase), e não uma lista derivada de `kenlo_leads.raw_data.attendedBy`.

## STATUS: IMPLEMENTADO em 2026-02-04

## 1) Constatação atual (problema)
- O projeto tem **2 implementações** de `/api/v1/brokers`:
  - `server/api-server.js`: implementa a listagem usando `tenant_brokers` + `tenant_memberships` (+ `profiles`) como fonte principal.
  - `server/proxy-production.js`: implementa a listagem usando **apenas** corretores extraídos de `kenlo_leads.raw_data.attendedBy` (e só usa `imoveis_corretores` quando filtra por `phone`).
- O `npm start` aponta para `server/proxy-production.js`, então em produção o GET atual tende a retornar a fonte errada.

## 2) Fonte de verdade (requisito)
- A “aba Acessos e Permissões” no front está alinhada com a estrutura de:
  - `tenant_memberships` (usuários com acesso, com `role`)
  - `profiles` (nome, email, phone, avatar)
  - e/ou `tenant_brokers` (cadastro de corretores associado ao tenant, com `auth_user_id`, `status`, etc)

## 3) Mudança proposta (sem alterar comportamento além do necessário)
- **Unificar o comportamento** do GET `/api/v1/brokers` no servidor que roda em produção (`proxy-production.js`), para usar a mesma estratégia “correta” do `api-server.js`:
  - **Primário:** `tenant_brokers` filtrando `status = active` (e `tenant_id`).
  - **Complemento:** `tenant_memberships` com `role in ('corretor', 'team_leader')` e merge dos que não existirem em `tenant_brokers`.
  - **Enriquecimento opcional:** se `include_assignments=true`, anexar `property_codes` via `imoveis_corretores`.
  - **Estatística opcional:** contar `leads_count` via `kenlo_leads` usando `corretor_id` quando existir, senão por nome (`attended_by_name`).
- **Desacoplar** totalmente o GET `/api/v1/brokers` de `raw_data.attendedBy`.
  - `raw_data.attendedBy` permanece só para o pipeline de atribuição automática (caso 1).

## 4) Ajustes colaterais recomendados
- Revisar também o GET `/api/v1/brokers/:id` em `proxy-production.js`:
  - Hoje ele procura corretor “por leads” via `raw_data.attendedBy`, o que falha para corretores que existem em “Acessos e Permissões” mas ainda não aparecem em leads.
  - Proposta: buscar corretor em `tenant_brokers`/`tenant_memberships` e retornar estatísticas agregadas de leads separadamente.

## 5) Auditoria do pipeline de atribuição (requisito anterior)
- O pipeline de criação/atribuição de leads está implementado em `api-server.js` e também em `proxy-production.js`:
  - 1) `raw_data.attendedBy`
  - 2) `properties_cache` (XML sincronizado)
  - 3) `imoveis_corretores` (Meus Imóveis)
  - 4) roleta
- A roleta no `api-server.js` já usa `tenant_memberships` como fonte primária (melhor) e faz fallback para `imoveis_corretores`.
- A roleta no `proxy-production.js` usa apenas `imoveis_corretores`.
- Proposta: alinhar `proxy-production.js` com o `api-server.js` para que a roleta use “Acessos e Permissões” (tenant_memberships) como fonte primária.

## 6) Critérios de aceite (o que validar após a mudança)
- GET `/api/v1/brokers` retorna todos os corretores da aba “Acessos e Permissões” mesmo se:
  - não houver nenhum lead com `raw_data.attendedBy`.
  - não houver atribuição em `imoveis_corretores`.
- GET `/api/v1/brokers?include_assignments=true` continua retornando `property_codes` quando existir.
- Criação de lead via API mantém atribuição automática:
  - atendeBy (Kenlo) > properties_cache > imoveis_corretores > roleta.

## 7) Perguntas rápidas para confirmar antes de editar
- A aba “Acessos e Permissões” deve incluir apenas `role='corretor'` ou também `team_leader`?
- A fonte “correta” para telefone/nome é `profiles` (full_name/phone) ou `users.raw_user_meta_data`?
