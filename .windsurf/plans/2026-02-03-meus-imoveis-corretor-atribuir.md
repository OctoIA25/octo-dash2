# Meus Imóveis + Atribuição de Corretores (Impl 1) e Criação via XML (Impl 2)

Este plano define como criar a aba **“Meus Imóveis”** com atribuição de corretor por **código do imóvel** via API multi-tenant, e depois automatizar a criação de logins de corretores a partir do XML.

## Contexto rápido do projeto (estado atual)

- **Imóveis (catálogo)**
  - Carregados por tenant via `useImoveisData`.
  - Fonte principal: XML -> parse em `imoveisXmlService.ts`.
  - Persistência: imóveis ficam em `localStorage` por tenant; URL/config e backup diário em `tenant_xml_config`.

- **Multi-tenant**
  - `tenantId` vem do `useAuth` e está sendo usado como chave de cache (`queryKey: ['imoveis-xml', tenantId]`) e também para keys no `localStorage`.

- **API pública (apidocs + server/api-server.js)**
  - API atual foca em **leads** e tem endpoint `GET /api/v1/brokers` que hoje **deriva corretores dos leads**, não de uma tabela de corretores.
  - Existe toggle `tenants.auto_assign_broker` na UI (aba Integrações > API) indicando intenção de atribuição automática.

- **Tabela de mapeamento imóvel→corretor**
  - Já existe migration `supabase/migrations/20260129_create_imoveis_corretores.sql` criando `imoveis_corretores` com `UNIQUE(tenant_id, codigo_imovel)`.
  - O `server/proxy-production.js` já tenta buscar dados do imóvel em `properties_cache` e faz fallback em `imoveis_corretores`.

- **Criação de corretores via XML**
  - Existe Edge Function `supabase/functions/xml-create-broker-access/index.ts` que:
    - Recebe `tenantId` e lista de corretores.
    - Cria usuário no Auth (se tiver email) com senha = últimos 4 dígitos do telefone (ou `0000`).
    - Insere em `tenant_brokers` e cria `tenant_memberships`.

## Implementação 1 — “Meus Imóveis” + atribuição por código via API

### Objetivo

- Criar uma nova aba harmônica em **Imóveis** chamada **“Meus Imóveis”**.
- Nessa aba:
  - Exibir **somente os imóveis** cujo `codigo_imovel` esteja atribuído ao corretor logado.
  - Exibir também uma **lista harmoniosa** de **códigos** atribuídos.
  - Para usuários com role **corretor**, permitir **adicionar/remover** um código de imóvel sob sua responsabilidade.

### Decisões de dados (fonte da verdade)

- A fonte de verdade para “responsável pelo imóvel” deve ser a tabela **`imoveis_corretores`**.
- Cada linha representa: `tenant_id + codigo_imovel -> corretor (identidade)`.

#### Identidade do corretor na tabela

Para evitar ambiguidades (nome muda, email pode faltar no XML, etc.), o ideal é armazenar **id estável** do corretor.

- **Recomendado:** adicionar/usar coluna `corretor_user_id` (UUID do `auth.users`) OU reaproveitar `corretor_id` como `UUID` referenciando o `auth_user_id`/membership.
- Estado atual da migration:
  - `corretor_id UUID` existe, mas sem FK/uso claro.

**Plano prático (mínima mudança):**
- Passo A: padronizar que `imoveis_corretores.corretor_id` = `auth.user.id` do corretor.
- Passo B: manter `corretor_nome/email/telefone` apenas como “snapshot” (opcional).

### Endpoints de API necessários (server/api-server.js)

A API atual não cobre “meus imóveis” nem gerenciamento de `imoveis_corretores`. Para validar e finalizar API, a Impl 1 precisa expor isso.

#### 1) GET corretores (ajuste)

- **Problema atual:** `GET /api/v1/brokers` lista corretores baseando-se nos leads (`kenlo_leads`).
- **Mudança planejada:** evoluir para listar corretores do tenant (por exemplo `tenant_brokers` / `tenant_memberships`) e trazer também os códigos de imóveis atribuídos.

Opções:
- **Opção 1 (recomendada):** manter `/api/v1/brokers` mas mudar a origem para `tenant_brokers` filtrando por `tenant_id`.
- **Opção 2:** criar endpoint novo `/api/v1/tenant/brokers` e manter o atual por compatibilidade.

#### 2) CRUD de atribuições imóvel→corretor

Criar endpoints:
- `GET /api/v1/property-assignments?tenant_id=...&broker_user_id=...` (lista códigos e/ou imóveis do corretor)
- `POST /api/v1/property-assignments` (criar atribuição)
  - Body: `{ tenant_id, codigo_imovel, broker_user_id }`
- `DELETE /api/v1/property-assignments/:id` OU `DELETE /api/v1/property-assignments?tenant_id=...&codigo_imovel=...`

**Regras importantes:**
- Respeitar `tenant_id` sempre.
- Garantir unicidade por `tenant_id + codigo_imovel`.

#### 3) Atribuição automática ao criar lead via API

Meta do prompt: “quando rodar get corretores, atribuir corretor responsavel atraves do codigo do imovel, então já deve ir automático pro corretor responsável por aquele código”.

No fluxo atual `POST /api/v1/leads`, o servidor simplesmente insere o lead.

Planejado:
- Se `tenants.auto_assign_broker = true` e o payload tiver `property_code`/`interest_reference`:
  - consultar `imoveis_corretores` (por `tenant_id` + `codigo_imovel`).
  - preencher no lead os campos equivalentes de “corretor responsável” (no schema atual do API server: `attended_by_name` / `corretor` etc.).

### UI (frontend) — Aba “Meus Imóveis”

#### Onde encaixar

- A página principal de catálogo é `src/pages/ImoveisPage.tsx`.
- Planejado: adicionar um controle de abas (ex.: shadcn `Tabs`) com:
  - **Catálogo** (existente)
  - **Meus Imóveis** (novo)

#### Como buscar os dados

- “Meus Imóveis” precisa de 2 coisas:
  - Lista de códigos atribuídos ao corretor logado (API `GET property-assignments`).
  - A partir desses códigos, filtrar a lista de `imoveis` já carregada via `useImoveisData`.

Isso evita reprocessar XML e mantém desempenho.

#### Ação “Adicionar código” (somente corretor)

- UI: input + autocomplete (pode reusar `searchImoveisByCodigo(tenantId, termo)`) para sugerir códigos.
- Ao confirmar:
  - chamar `POST /api/v1/property-assignments` com `tenant_id`, `codigo_imovel`, `broker_user_id` (do `useAuth`).
- Também suportar “remover” com delete.

### Validações e casos limite

- Código digitado não existe no catálogo do tenant:
  - permitir cadastrar mesmo assim (há imobiliárias com “códigos novos”), mas marcar como “não encontrado” na UI.
- Conflito de responsável (mesmo código já atribuído):
  - regra a decidir: bloquear ou permitir “transferir”.
  - recomendação: bloquear para corretor e permitir transferir apenas para admin/gestão.

### Checklist de aceite (Impl 1)

- Login como corretor:
  - Ver aba “Meus Imóveis”.
  - Adicionar código.
  - Código aparece na lista e os imóveis filtrados aparecem.

- Via API:
  - `GET /api/v1/brokers` retorna corretores reais do tenant e (opcional) suas atribuições.
  - `POST /api/v1/leads` com `interest_reference` atribui automaticamente o corretor quando existir mapping.

## Implementação 2 — Criar logins de corretores via XML (e corrigir botão)

### Objetivo

- Após Impl 1, habilitar criação automática de usuários/corretores extraídos do XML.
- “Botão de criar corretores” (na aba XML em Integrações) deve ficar funcional.
- Criar “da mesma forma que membros da equipe”: isto é, criar usuário Auth + membership do tenant.

### O que já existe e por que pode estar falhando

- Edge Function `xml-create-broker-access` já faz:
  - `auth.admin.createUser` (exige service role key do lado da função).
  - insert em `tenant_brokers`.
  - upsert em `tenant_memberships`.

Possíveis motivos do botão não funcionar hoje (a validar na implementação):
- UI não chama a edge function corretamente (nome, payload, headers).
- Corretores do XML sem email (função só cria Auth quando há email).
- Telefone faltando/formatos -> senha vira `0000` (e pode conflitar com política de senha mínima).

### Plano de UI/fluxo

- Na aba XML (`IntegracoesPage.tsx`), após sincronizar e obter `xmlCorretoresPreview`:
  - botão “Criar acessos” chama edge function com:
    - `tenantId`
    - `corretores: [{nome,email,telefone,foto}]`
- Mostrar resultado (já existe estrutura `createAccessResult`).

### Regra de senha padrão

- “senha padrão últimos 4 dígitos do telefone”:
  - Hoje a função faz isso, mas senha mínima Supabase é geralmente **6**.
  - Se a política do projeto exigir 6+, precisamos decidir:
    - concatenar algo (ex.: `telLast4 + "00"`) ou
    - usar 6 últimos dígitos.

**Pergunta para confirmação:** o projeto está exigindo senha mínima 6? (se sim, a regra “4 dígitos” precisa de ajuste)

### Manual ainda precisa funcionar

- “nem todas as imobiliárias vão ter XML com corretores”:
  - Manter o fluxo manual de criação de corretor/membro funcionando.
  - Hoje existem dois fluxos:
    - `CriarCorretorModal` -> `corretoresService.criarCorretor()` (parece inserir em `brokers` via REST)
    - `tenantMembersService.createTenantMember()` (cria Auth via RPC e cria membership)

**Recomendação de unificação:** para logins funcionais, o fluxo manual deve usar o mesmo mecanismo do membership/Auth (mais próximo do `createTenantMember`).

## Perguntas de confirmação (para eu implementar exatamente como você quer)

1) **Quem pode atribuir código de imóvel?**
   - Apenas o corretor para si mesmo?
   - Gestão/admin podem atribuir para qualquer corretor?

2) **Conflito de código já atribuído:**
   - Bloqueia e retorna erro?
   - Permite “transferir responsável” (somente admin)?

3) **Campos do lead para atribuição:**
   - Quer gravar no lead o **nome do corretor**, o **id**, ou ambos?
   - Qual tabela/coluna é a oficial hoje para “corretor responsável” (há `bolsao`, `kenlo_leads`, e tabelas antigas)?

4) **Senha mínima:**
   - Confirmar se o Auth do Supabase exige 6+ caracteres.

---

## Próximo passo

Após você confirmar este plano, eu avanço para implementação real em duas etapas (Impl 1 primeiro), incluindo migrations necessárias, endpoints de API, e UI da aba “Meus Imóveis”.
