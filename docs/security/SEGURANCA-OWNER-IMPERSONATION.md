# 🔐 Nota de Segurança — Owner & Impersonation

> Documento de **registro de risco**. Nenhuma mudança de segurança no banco foi
> feita aqui — este arquivo apenas documenta achados para verificação posterior
> no Supabase.

## 1. A checagem de owner é no frontend (não é fronteira de segurança)

Quem é "owner" é decidido por comparação de email no **frontend**, agora
centralizada em [`src/lib/ownerEmails.ts`](../../src/lib/ownerEmails.ts)
(`isOwnerEmail`). A lista de emails owner vive no bundle Vite, que é **público**:
qualquer pessoa que inspecione o JavaScript entregue ao navegador vê esses
emails.

Isso significa que `isOwnerEmail` controla apenas **o que a UI mostra**
(navegação, sidebar, acesso à impersonation). Ela **não protege dados**. A
proteção real de dados precisa morar no **RLS do Supabase**.

Configuração: a lista padrão está no próprio módulo; pode ser sobrescrita via a
env var `VITE_OWNER_EMAILS` (emails separados por vírgula). Por ser `VITE_*`, ela
é injetada **no build** (Build Argument no Docker/EasyPanel), não em runtime.

## 2. ⚠️ Achado: impersonation confia em `tenantId` do `localStorage`

A impersonation do owner é gravada em `localStorage` sob a chave
`owner-impersonation` e diversas queries de dados leem o `tenantId` **direto do
`localStorage`**, sem revalidar quem é o usuário:

- [`src/features/leads/hooks/useLeadsData.ts`](../../src/features/leads/hooks/useLeadsData.ts) (~L46)
- [`src/features/leads/hooks/useImovelTipoMap.ts`](../../src/features/leads/hooks/useImovelTipoMap.ts) (~L34)
- [`src/features/leads/hooks/useLeadsMetrics.ts`](../../src/features/leads/hooks/useLeadsMetrics.ts)
- [`src/utils/consoleHelpers.ts`](../../src/utils/consoleHelpers.ts)

### Risco

`localStorage` é totalmente editável pelo cliente. **Qualquer usuário logado**
(não apenas o owner) pode escrever uma chave `owner-impersonation` com um
`tenantId` arbitrário e fazer as queries do frontend usarem esse tenant. Se as
políticas de RLS do Supabase **não** barrarem o acesso cruzado entre tenants,
isso é um vazamento de dados entre imobiliárias.

> Este achado é **independente** da mudança de owner emails. Adicionar/remover
> um email owner não cria nem corrige este risco.

### Como verificar (no Supabase)

Para cada tabela com dados por tenant (ex.: `leads`, `excel_imports`, imóveis),
confirmar que existe política RLS que restringe `SELECT`/`INSERT`/`UPDATE` ao
`tenant_id` ao qual o usuário **autenticado** realmente pertence — e não a um
`tenant_id` passado pela aplicação. Em particular, validar que um usuário não-owner
não consegue ler dados de outro tenant mesmo que a aplicação envie outro
`tenant_id`.

### Possíveis encaminhamentos (fora do escopo desta entrega)

1. Garantir/auditar RLS por `tenant_id` baseado em `auth.uid()` e na membership
   real do usuário (não no valor vindo do cliente). **Esta é a correção real.**
2. Restringir a habilidade de impersonar no frontend a usuários owner — defesa em
   profundidade, não substitui o item 1.

## 3. Resultado da auditoria de RLS (2026-06-24)

Auditoria estática das migrations em `supabase/migrations/`. O modelo de RLS
**correto** do projeto isola tenant via `auth.uid()`/`auth.jwt()` +
`tenant_memberships` (não-forjável pelo cliente) — ver
`20260618_fix_guc_rls_and_count_leads.sql`. A maioria das tabelas segue esse
padrão. Mas a auditoria encontrou exceções **ativas** (não revertidas):

### 🔴 CRÍTICO — `leads` e `kenlo_leads` sem RLS versionado
Não há `ENABLE ROW LEVEL SECURITY` nem `CREATE POLICY` para essas tabelas em
nenhuma migration (grep confirmado, retorno vazio). O isolamento depende
**apenas** do filtro `.eq('tenant_id', ...)` no frontend. O próprio código
admite: `src/hooks/useKenloMetrics.ts:5` — *"kenlo_leads tem RLS desabilitada —
o filtro em app é obrigatório"*. Como o filtro é condicional/cliente, qualquer
usuário autenticado pode ler leads de outro tenant via PostgREST direto (cURL com
o próprio JWT). **São as tabelas mais sensíveis do sistema.**
> ⚠️ Verificar no banco se existe RLS aplicada fora do versionamento (dashboard).
> Se não houver, é vazamento ativo de dados entre tenants.

### 🔴 CRÍTICO — `tenant_api_keys`: qualquer membro lê segredos
`20260214_create_tenant_api_keys.sql`: RLS habilitado, mas a policy permite a
**qualquer membro** do tenant (inclusive corretor) ler as chaves de API
(`openai`/`anthropic`/`gemini`). Deveria restringir a `role IN ('admin','owner')`
como faz `whatsapp_config`.

### 🟠 INCERTO — tabelas sem schema versionado
`bolsao`, `bolsao_tokens`, `kenlo_integrations`, `tenant_xml_config` não têm
`CREATE TABLE`/RLS em migrations. `bolsao_tokens` e `kenlo_integrations` guardam
tokens/webhooks; `tenant_xml_config` mostra sinais de feeds XML compartilhados
entre tenants (`scripts/diagnostico-tenants-xml.sql`). Verificar RLS no banco.

### ✅ SEGURAS (modelo correto, confirmado)
`proposals`, `commercial_sales`, `sales_transactions`, `excel_imports`,
`generic_imports`, `whatsapp_config`, `whatsapp_conversations`,
`whatsapp_messages`, `recruitment_candidates`, `team_metrics`,
`corretor_metrics`, `imoveis_corretores`.

> Nota histórica: `excel_imports` ficou sem RLS de 2026-05-05 a 2026-06-17, e
> várias tabelas usaram um GUC `app.current_tenant_id` ineficaz até 2026-06-18.
> Ambos já corrigidos. Se as migrations de fix (`20260617*`, `20260618*`) foram
> aplicadas em produção, essas tabelas estão seguras hoje.

### Prioridade de correção
1. `leads` / `kenlo_leads` — confirmar/aplicar RLS. **Maior impacto.**
2. `tenant_api_keys` — restringir leitura a admin/owner.
3. `bolsao*`, `kenlo_integrations`, `tenant_xml_config` — versionar schema + RLS.
