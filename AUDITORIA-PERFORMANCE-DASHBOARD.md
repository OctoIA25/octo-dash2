# Auditoria de Performance — Dashboard octo-dash2

**Cenário-alvo:** tenant com 50.000 leads, 200.000 mensagens, milhares de imóveis/campanhas/webhooks.
**Método:** leitura direta do código (front + server + migrations) + fan-out de 4 agentes de análise, com **verificação manual** de cada achado load-bearing (não confiei em nenhum achado de agente sem abrir o arquivo). Cada afirmação abaixo tem `arquivo:linha`.

> **Nota importante sobre índices:** as tabelas quentes (`leads`, `kenlo_leads`, `whatsapp_conversations`, `whatsapp_messages`) **já têm índice em `tenant_id`** (migrations `20260204`, `20260528`, etc.). Ou seja, **o gargalo NÃO é sequential scan por falta de índice.** O gargalo é **volume trafegado e processado**: o front puxa todas as linhas do tenant e agrega em JS. A correção é paginação/agregação server-side, **não** criar índices.

---

## 1. Diagnóstico em uma frase

> A dashboard carrega **o catálogo inteiro de leads do tenant na memória do navegador**, sem paginação nem escopo de data, através de **três pipelines de fetch sobrepostos**, e **recalcula todas as métricas em JavaScript a cada render e a cada 60 segundos**. Tudo escala em O(n) sobre `leads`, com vários pontos em O(n·m) e um O(n²). A 50k leads isso significa 100–250 MB em memória, ~50 round-trips por carga e travadas de 100–500 ms na main thread por ciclo.

---

## 2. A causa-raiz (o gargalo principal)

Existem **três** caminhos que carregam leads, dois deles sem limite e com `select('*')`:

| Pipeline | Arquivo | Escopo | Paginação | Colunas | Usado por |
|---|---|---|---|---|---|
| **A. Legado** | [useLeadsData.ts](src/features/leads/hooks/useLeadsData.ts) → [supabaseService.ts:132](src/services/supabaseService.ts#L132) | tenant inteiro, **sem data** | sim (1000/pág) | subset | Dashboard, LeadsTable, Agenda, WeekPlanner, AdminDashboard… (10+ componentes) |
| **B. Métricas** | [useLeadsMetrics.ts](src/features/leads/hooks/useLeadsMetrics.ts) → [leadsMetricsService.ts:99](src/features/leads/services/leadsMetricsService.ts#L99) | tenant inteiro | sim | **`select('*')`** (linha 100) | LeadSection, PropostaPage, CentralLeadsPage, MetricsDashboard |
| **C. KPIs (bom)** | [supabaseKpisService.ts:101](src/features/kpis/services/supabaseKpisService.ts#L101) | tenant + **data** + não-arquivados | sim | **5 colunas** | KpisPage |

**O problema:**

1. **A e B são redundantes e coexistem na mesma tela.** [LeadSection.tsx:109-111](src/features/leads/components/LeadSection.tsx#L109) chama **os dois hooks** e só usa um (`metricsLeads.length > 0 ? metricsLeads : legacyLeads`). O `legacyLeads` é **fetch puro desperdiçado** — duas cargas completas do tenant para renderizar uma tela.
2. **B usa `select('*')`** ([leadsMetricsService.ts:100](src/features/leads/services/leadsMetricsService.ts#L100) e [:329](src/features/leads/services/leadsMetricsService.ts#L329)) — puxa a linha gorda inteira (incl. `message`, `metadata`) de 50k leads.
3. **Nenhum dos consumidores agrega no banco.** Todo KPI, funil, ranking e contagem é `.filter()/.reduce()` em JS sobre o array de 50k. O servidor (mesmo o path C, [server/kpis/index.js:148](server/kpis/index.js#L148)) também busca todas as linhas e agrega em JS via `buildOverview` — nenhum `GROUP BY` / `count(*)` no SQL.

**Complexidade:** espacial O(n) (100–250 MB a 50k); temporal por carga O(n) trafegado + O(n) processado, ×2 pela duplicação A/B.

| n leads | Memória (est.) | Round-trips (A+B) | Payload aprox. |
|---|---|---|---|
| 1.000 | 2–5 MB | 2 | ~2 MB |
| 10.000 | 20–50 MB | 20 | ~20 MB |
| **50.000** | **100–250 MB** | **~50** | **~100 MB** |
| 500.000 | 1–2,5 GB → **OOM** | ~500 | ~1 GB |

---

## 3. Achados verificados (frontend)

### 3.1 `JSON.stringify` do array inteiro a cada 60 s — **CRÍTICO**
[useLeadsData.ts:323](src/features/leads/hooks/useLeadsData.ts#L323)
```js
if (JSON.stringify(leads) !== JSON.stringify(processedLeads)) { setLeads(processedLeads); }
```
Serializa **duas vezes** o array de 50k a cada auto-update (60 s, [linha 536](src/features/leads/hooks/useLeadsData.ts#L536)). ~5–15 MB de string alocada + parse por ciclo, **bloqueando a main thread** 100–500 ms. **Big-O:** O(n) tempo e espaço, recorrente. É a maneira mais cara possível de detectar "mudou algo".

### 3.2 `.sort()` in-place sobre o array compartilhado — **ALTO**
[LeadsTable.tsx:159-170](src/features/leads/components/LeadsTable.tsx#L159)
```js
return finalLeads.sort((a, b) => new Date(b.data_entrada) - new Date(a.data_entrada));
```
`Array.sort` é **in-place** → muta o array vindo do cache/prop (efeito colateral). Ordena os 50k a cada mudança de deps, com `new Date()` ×2 por comparação → O(n log n) com constante alta. A DOM é paginada (`.slice`, [linha 269](src/features/leads/components/LeadsTable.tsx#L269)) — bom — mas o trabalho JS não é.

### 3.3 `LeadsTable` faz fetch mesmo recebendo `leads` por prop — **MÉDIO**
[LeadsTable.tsx:150](src/features/leads/components/LeadsTable.tsx#L150) chama `useLeadsData()` incondicionalmente → dispara **outro** fetch completo + **outro** intervalo de 60 s, mesmo quando o componente já recebe `leads` como prop. Fetch duplicado.

### 3.4 Dedup O(n²) com `indexOf` — **MÉDIO**
[MainMetricsSection.tsx:193](src/features/metricas/components/MainMetricsSection.tsx#L193)
```js
.filter((corretor, index, array) => array.indexOf(corretor) === index)
```
`indexOf` dentro de `filter` = O(n²). A 50k leads × ~200 corretores únicos ≈ dezenas de milhares de comparações. `new Set()` resolve em O(n).

### 3.5 Agregação O(n·m) em gráficos de relatório — **ALTO**
[RelatoriosPage.tsx:1002](src/features/relatorios/pages/RelatoriosPage.tsx#L1002) (e :1008, :1019, :1027, :1053)
```js
data: ALL_CORRETORES.map(nome => allLeadsEarly.filter(l => l.corretor_responsavel === nome && …).length)
```
Para cada corretor, varre os 50k leads. **O(n·m)** = 50k × 30 ≈ **1,5 M ops por `useMemo`**, e há vários blocos assim. Solução: **um** loop que agrupa por corretor num `Map` (O(n)).

### 3.6 Múltiplos `.filter()` sequenciais sobre o mesmo array
[RelatoriosPage.tsx:396-447](src/features/relatorios/pages/RelatoriosPage.tsx#L396) faz 5 varreduras independentes; [MainMetricsSection.tsx:241-344](src/features/metricas/components/MainMetricsSection.tsx#L241) encadeia 4 filtros com 10 deps no `useMemo`. Cada é O(n), mas somam O(6n)/O(4n) com alta constante de string ops. Dá para fazer numa passada.

### 3.7 Sem virtualização em listas longas — **MÉDIO/BAIXO**
[LeadsTable.tsx:420](src/features/leads/components/LeadsTable.tsx#L420) e [ChatWindow.tsx:92](src/features/chat/components/ChatWindow.tsx#L92) fazem `.map()` direto. A LeadsTable **está paginada** (9/pág) → risco baixo. O ChatWindow não tem limite (ver 4.2) → aí importa.

---

## 4. Achados verificados (Chat / Comunicação)

> **Correção de escopo:** o agente estimou "50k mensagens por conversa". Isso é errado — os 200k são **do tenant inteiro**, distribuídos em milhares de conversas → dezenas a centenas por conversa. Rebaixei a severidade de "OOM do navegador" para **médio**. O schema do chat é **bom** (índice `(conversation_id, created_at)`, trigger mantendo `last_message_preview`/`unread_count` — sem N+1 no banco). Os problemas são de fetch/front.

### 4.1 `listConversations` / `listMessages` sem `.limit()`/`.range()` — **ALTO**
[chatService.ts:49-59 e 61-70](src/features/chat/services/chatService.ts#L49) — ambos `select('*')` sem limite. Conversas: puxa todas do tenant. Mensagens: puxa a conversa inteira. Como conversas ocupadas crescem, vira payload grande sem teto.

### 4.2 Sem virtualização na lista de mensagens — **MÉDIO**
[ChatWindow.tsx:92](src/features/chat/components/ChatWindow.tsx#L92) renderiza `messages.map()` inteiro. Combinado com 4.1 (sem limite), uma conversa longa enche a DOM.

### 4.3 Refetch total a cada mudança de conversa — **MÉDIO**
[useChatConversations.ts:39-41](src/features/chat/hooks/useChatConversations.ts#L39) — o handler realtime chama `refresh()` (relista **todas** as conversas) em **qualquer** `INSERT/UPDATE/DELETE`. Como cada mensagem dispara o trigger que atualiza a conversa, cada mensagem recebida → refetch da lista inteira. O(conversas) por mensagem. Real, mas conversas são centenas → impacto médio, não "storm".

### 4.4 Busca em memória sem debounce
[ConversationList.tsx:37-44](src/features/chat/components/ConversationList.tsx#L37) — `.filter()` + `.toLowerCase()` por tecla. O(n) por keystroke; a centenas de conversas, ok, mas sem debounce é desperdício fácil de eliminar.

---

## 5. Achados verificados (Backend)

### 5.1 `count: 'exact'` com `select('*')` na listagem de leads — **ALTO**
[proxy-production.js:496](server/proxy-production.js#L496)
```js
.from('kenlo_leads').select('*', { count: 'exact' }).eq('tenant_id', req.tenantId)
```
`count: 'exact'` força varredura da partição do tenant **em toda requisição paginada**, e `select('*')` puxa todas as colunas. Mesmo padrão em [api-server.js:1090](server/api-server.js#L1090). Use `count: 'estimated'` (ou `planned`) e selecione só as colunas exibidas.

### 5.2 N+1 em memória no endpoint de corretores — **ALTO**
[proxy-production.js:3520](server/proxy-production.js#L3520)
```js
const { data: leads } = await leadsQuery;        // TODOS os kenlo_leads (sem limit)
(leads || []).forEach(lead => { brokers.find(b => …); }); // .find() O(B) por lead
```
Busca **todos** os leads só para contar leads-por-corretor, e faz `brokers.find()` dentro do loop → **O(L·B)** = 50k × 200 = **10 M comparações por request**, além de trafegar 50k linhas. O mesmo padrão em [:3495](server/proxy-production.js#L3495) (assignments × brokers). Isto deveria ser um `count(*) ... GROUP BY corretor` no SQL.

### 5.3 Feed de imóveis sem paginação
[proxy-production.js:1209-1257](server/proxy-production.js#L1209) — busca **toda** a tabela `imoveis_locais` do tenant (48 colunas, `order by updated_at`, sem `.limit()`/`.range()`). Para milhares de imóveis, payload multi-MB e processamento duplo na geração do XML.

### 5.4 Poller de webhooks — **OK, baixa prioridade**
[proxy-production.js:329-416](server/proxy-production.js#L329) — base 5 s **com backoff exponencial até 5 min** e `.limit(20)`. O `select('*')` traz o `payload` JSONB à toa (fetch só de `id, status, next_attempt_at` bastaria), mas o design é aceitável. Não é o gargalo da dashboard.

---

## 6. O que os agentes exageraram (segunda revisão — questionando as próprias conclusões)

Um bom audit descarta ruído. Rebaixei/rejeitei:

- **"Context object literal = CRÍTICO"** ([HeaderSlotContext.tsx:20](src/contexts/HeaderSlotContext.tsx#L20), [SidebarContext.tsx:14](src/contexts/SidebarContext.tsx#L14)). O `value` não-memoizado **é** um anti-padrão, mas esses contexts guardam estado trivial (um slot, um booleano). Re-renderizar seus consumidores é barato e **não escala com leads**. → **BAIXO / higiene**, não gargalo. Corrigir isso sozinho **não move o ponteiro** — exatamente o tipo de "otimização que parece boa mas não traz ganho" que você pediu para sinalizar.
- **"50k mensagens por conversa → OOM"** — erro de escopo (§4). Rebaixado.
- **"Refetch storm recursivo"** (chat) — real, mas O(conversas)≈centenas, não milhares de leads. Médio.
- **`AuthContext` re-render global** ([AuthContext.tsx:365](src/contexts/AuthContext.tsx#L365)) — dispara em refresh de token/permissão, eventos raros. Não é hot path. Baixo.
- **`setInterval` em chart** ([MeusLeadsAtribuidosSection.tsx:675](src/features/leads/components/MeusLeadsAtribuidosSection.tsx#L675)) — tem cleanup; risco de leak não confirmado. Baixo.

---

## 7. Tabela de prioridades (maior ganho → menor)

| # | Prioridade | Problema | Impacto | Complex. corrigir | Ganho esperado |
|---|---|---|---|---|---|
| 1 | 🔴 P0 | Três pipelines de fetch; A+B duplicados e sem escopo ([LeadSection:109](src/features/leads/components/LeadSection.tsx#L109), [leadsMetricsService:100](src/features/leads/services/leadsMetricsService.ts#L100)) | Corta ~50% do tráfego/memória de imediato | **Baixa** (remover `useLeadsData` de LeadSection; unificar em 1 hook) | **Altíssimo** |
| 2 | 🔴 P0 | Agregação de KPI/funil/ranking em JS sobre 50k, sem `GROUP BY` server-side (KPIs, Relatórios, Métricas) | Elimina o trabalho O(n) por render e o payload de 50k linhas | **Média** (endpoints de agregação SQL) | **Altíssimo** |
| 3 | 🔴 P0 | `JSON.stringify(leads)` a cada 60 s ([useLeadsData:323](src/features/leads/hooks/useLeadsData.ts#L323)) | Remove travadas de 100–500 ms na main thread | **Baixa** (comparar `length`+hash leve, ou React Query) | **Alto** |
| 4 | 🟠 P1 | N+1 O(L·B) no endpoint de corretores ([proxy:3520](server/proxy-production.js#L3520)) | Endpoint pode dar timeout a 50k | **Média** (`count … GROUP BY`) | **Alto** |
| 5 | 🟠 P1 | `count:'exact'` + `select('*')` na listagem ([proxy:496](server/proxy-production.js#L496), [api-server:1090](server/api-server.js#L1090)) | Scan por request paginado | **Baixa** (`estimated` + colunas) | **Alto** |
| 6 | 🟠 P1 | O(n·m) e O(n²) em Relatórios/Métricas ([RelatoriosPage:1002](src/features/relatorios/pages/RelatoriosPage.tsx#L1002), [MainMetricsSection:193](src/features/metricas/components/MainMetricsSection.tsx#L193)) | Trava render dos relatórios | **Baixa** (Map/Set, 1 passada) | **Médio-alto** |
| 7 | 🟡 P2 | Chat: `listMessages`/`listConversations` sem limite + sem virtualização ([chatService:61](src/features/chat/services/chatService.ts#L61), [ChatWindow:92](src/features/chat/components/ChatWindow.tsx#L92)) | Conversas longas pesam | **Média** (paginação + react-window) | **Médio** |
| 8 | 🟡 P2 | `.sort()` in-place + fetch duplicado em LeadsTable ([:159](src/features/leads/components/LeadsTable.tsx#L159), [:150](src/features/leads/components/LeadsTable.tsx#L150)) | Muta cache; fetch extra | **Baixa** | **Médio** |
| 9 | 🟡 P2 | Chat realtime refetch total ([useChatConversations:39](src/features/chat/hooks/useChatConversations.ts#L39)) | Refetch por mensagem | **Baixa** (aplicar delta do payload) | **Médio** |
| 10 | ⚪ P3 | Feed imóveis sem paginação ([proxy:1209](server/proxy-production.js#L1209)) | Payload grande no feed | **Baixa** | **Baixo-médio** |
| 11 | ⚪ P3 | `value` de context sem `useMemo` (Header/Sidebar) | Re-render barato, não escala | **Baixa** | **Baixo** (higiene) |

**Regra de ouro da sequência:** 1 → 2 → 3 primeiro. Sozinhos, eles resolvem ~80% da lentidão a 50k porque atacam **volume trafegado** e **trabalho por render**, que são as duas dimensões que crescem com `n`. O resto é refinamento.

---

## 8. O que vale aprender desta auditoria

**Como engenheiros experientes acham gargalos em sistemas grandes.**
Não se começa lendo tudo. Começa-se pela pergunta *"o que cresce com o tamanho do tenant?"* e segue-se **o dado**: do banco → serviço → hook → componente. O gargalo quase sempre está onde `n` (aqui, leads) atravessa uma fronteira sem limite. Achei a causa-raiz lendo **um** arquivo ([useLeadsData.ts](src/features/leads/hooks/useLeadsData.ts)) antes de qualquer agente — o `fetch` sem escopo + `setInterval(60s)` + `JSON.stringify` já contavam a história. Os agentes serviram para **medir o alcance** (quantos consumidores, quantos O(n·m)), não para descobrir o problema.

**Como analisar React com dezenas de milhares de registros.**
A pergunta certa não é "quantos componentes re-renderizam" e sim "**quanto trabalho por render cresce com `n`**". Um context não-memoizado re-renderiza muita coisa, mas cada render é O(1) → irrelevante a 50k. Já um `.filter()` sobre 50k dentro do corpo de um componente é O(n) **por render** → é o que mata. Por isso rebaixei os contexts e priorizei as agregações. **Virtualização** só importa onde a lista realmente é longa (chat sem limite), não onde já há paginação (LeadsTable).

**Como detectar N+1 e renders desnecessários.**
N+1 no backend tem uma assinatura visual: **uma query (ou `.find()`) dentro de um `.forEach`/`.map` sobre linhas** ([proxy:3520](server/proxy-production.js#L3520)). No front, o equivalente é `array.map(x => outroArray.filter(...))` — O(n·m) disfarçado de código limpo. `grep` por `.forEach(`/`.map(` seguido de `.find(`/`.filter(`/`await supabase` acha a maioria.

**Big-O aplicado ao mundo real.**
O que importa não é a classe teórica, é **a constante × a frequência**. `JSON.stringify` é "só O(n)", mas roda a cada 60 s sobre 50k objetos com uma constante enorme → pior que um O(n²) que roda uma vez. Sempre multiplique: `complexidade × tamanho × frequência × constante`. Foi assim que ordenei a tabela.

**Como priorizar otimizações que geram impacto.**
Ataque as duas dimensões que crescem com `n`: **bytes trafegados** e **trabalho por render**. Paginar/agregar no servidor resolve as duas de uma vez → topo da lista. Memoizar um context resolve nenhuma → fundo da lista.

**Por que algumas otimizações "boas" não trazem ganho.**
`useMemo`/`React.memo`/context memoization são reais, mas se o custo por operação é O(1), remover re-renders economiza microssegundos. Enquanto o app puxa 50k linhas duas vezes e as serializa, otimizar re-render de um botão é rearranjar cadeiras no convés. **Meça a dimensão que escala; ignore a que é constante.** É por isso que a maior vitória aqui (item 1) é *deletar* um hook duplicado — menos código, mais performance. A solução mais simples que funciona costuma ser remover trabalho, não adicionar cache.

---

*Auditoria diagnóstica — nenhuma alteração de código foi feita. Próximo passo: escolher quais itens (recomendo 1→2→3) implementar.*
