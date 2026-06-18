# Auditoria Técnica — OctoDash CRM

> Documento de **status**: a auditoria original era somente-leitura; este arquivo foi atualizado para refletir o que já foi corrigido. **Itens totalmente consertados foram removidos**; os **parciais** estão marcados com `⚠️ PARCIAL` (o que foi feito × o que resta); os demais permanecem como pendentes. Contagem no fim do documento.
> Escopo: `src/` (163k LOC, 536 arquivos TS/TSX), `server/` (Express + Supabase, ~15k LOC), `supabase/migrations/`, edge functions, config de build/infra.

---

## Sumário Executivo

A fundação de segurança multi-tenant é **conceitualmente sólida**: o isolamento real acontece em RLS no Postgres + a API externa `/api/v1` deriva `tenant_id` de uma API key validada. Os furos concretos de isolamento cross-tenant já endereçados (IDOR de leads, `excel_imports`, `team_metrics`, recrutamento, edge function) foram corrigidos; **restam** segredos vivos no bundle (C2/C3), parte do cluster de RLS (tenant_api_keys, proposals, buckets, segredos em repouso), e a dívida de arquitetura/performance.

---

## CRÍTICO

Problemas que causam perda de dados, inconsistência, falha em produção ou risco de segurança.

### C2 — Segredo do Google OAuth embarcado no bundle público
- **Localização:** `.env:8` (`VITE_GOOGLE_CALENDAR_CLIENT_SECRET`); consumido em `src/features/agenda/services/googleCalendarService.ts:12,99,133`; **confirmado presente em** `dist/assets/googleCalendarService-BDe3feN_.js` (valor `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`).
- **Problema:** o prefixo `VITE_` faz o Vite **inlinar** o valor no JS do cliente em build time. O `client_secret` é usado num `fetch` browser-side para `oauth2.googleapis.com/token`.
- **Impacto:** qualquer visitante extrai o `client_secret` e pode impersonar o OAuth client. O valor está vivo.
- **Severidade:** Crítico.
- **Solução:** mover a troca `code→token` e o `refresh` para o servidor; var server-only sem `VITE_`. **Rotacionar o secret no Google Cloud Console.**

### C3 — API key de terceiro + JWT de tenant embarcados no bundle
- **Localização:** `.env:10-11` (`VITE_SANTA_ANGELA_API_KEY`, `VITE_SANTA_ANGELA_TENANT_ID`); confirmado em `dist/assets/MeusLeadsPage-CogLZmFR.js`.
- **Problema:** o key é um JWT embarcado e publicamente extraível.
- **Impacto:** replay da credencial contra a integração Santa Angela/Japi; vazamento de email/ID de tenant.
- **Severidade:** Crítico.
- **Solução:** proxiar a integração pelo servidor; var server-only; rotacionar a key.

### C5 — RLS quebrada/permissiva em tabelas com PII e segredos
> ⚠️ **PARCIAL.** ✅ Feito (migrações `20260617_*`): `team_metrics` (era `USING(true)`), `recruitment_candidates`/`recruitment_stages` (+ funções DEFINER, ver M16) e `tenant_source_images` (RLS apontava p/ tabela `users` inexistente). `imoveis_corretores` já estava correto (`20260529_fix`). **Resta:** `tenant_api_keys` e `UNIQUE(tenant_id, email)` em recruitment (abaixo).
- **`tenant_api_keys.api_key` em texto puro, legível E gravável por qualquer membro** — `20260214_create_tenant_api_keys.sql:6,17-54`. Um corretor lê as API keys do tenant.
- **`recruitment` `email TEXT NOT NULL UNIQUE`** é **global**, não por tenant → enumeração/colisão cross-tenant.
- **Severidade:** Crítico (exposição direta cross-tenant de dados/segredos).
- **Solução:** gatear escrita/leitura de `tenant_api_keys` por role admin/owner; hashear/cifrar API keys; `UNIQUE(tenant_id, email)` em recruitment.

### C7 — Carga de tabela inteira no browser + agregação em JS (não escala / truncamento silencioso)
- **Localização:** `src/features/metricas/services/commercialSalesService.ts:383,595` (`while(true){ .range(page*1000,…); page++ }` sem teto), `src/services/supabaseService.ts:142` (`fetchKenloLeadsPaginated`), `src/features/leads/services/leadsMetricsService.ts:102`, `src/features/imoveis/services/kenloLeadsService.ts:515`.
- **Problema:** paginam a tabela **inteira** para o cliente em laço e agregam em JS. Onde não há `.range()` (`relatoriosService.ts:179,412,512`, `leadsService.ts:345,369,472`), o PostgREST trunca no cap default → **métricas silenciosamente erradas**.
- **Impacto:** O(n) requisições seriais + dataset inteiro em RAM. 100k linhas ≈ ~100 requisições seriais + centenas de MB.
- **Severidade:** Crítico (performance + correção silenciosa).
- **Solução:** mover count/sum/group para agregação Postgres (RPC ou `select('col.sum()')`); `.range()` explícito.

---

## ALTO

Impacto significativo em performance, manutenção ou escalabilidade.

### A2 — Dois sistemas de autenticação paralelos e divergentes
- **Localização:** `src/contexts/AuthContext.tsx` (`useAuthContext`, 23 importadores) **e** `src/hooks/useAuth.ts` (564 linhas, 30 importadores).
- **Problema:** `useAuth.ts` é uma **segunda implementação completa** de auth, com **singletons mutáveis a nível de módulo** e `getSidebarPermissions` **duplicado** (`AuthContext.tsx:79` e `useAuth.ts:106`).
- **Impacto:** duas fontes de verdade para auth/tenant/permissões; uma mudança de regra num caminho diverge do outro — **risco de segurança**.
- **Severidade:** Alto (maior alavanca de manutenção/segurança do frontend).
- **Solução:** tornar `useAuth` um re-export fino de `useAuthContext`; remover duplicação e singletons.

### A3 — Roleta em memória no servidor de produção (não atômica, por-processo, perdida em restart)
- **Localização:** `server/proxy-production.js:755` (`const tenantRoletaState = new Map()`) + `getNextBrokerFromRoleta:1268-1279`; espelhada em `api-server.js:1303,1494-1503`.
- **Problema:** read-modify-write de `state.lastIndex` em memória, sem lock. A roleta via trigger no banco (`pick_roleta_broker`) está OK; esta versão app-level sofre race, é per-processo (diverge em cluster/restart) e coexiste com a do banco (inconsistência arquitetural).
- **Impacto:** distribuição de leads injusta/duplicada — disputa de comissão. Sem limite com múltiplas instâncias.
- **Severidade:** Alto.
- **Solução:** uma única fonte de verdade (persistir cursor no banco com UPDATE atômico, ou usar só a roleta via trigger).

### A4 — SSRF no scraper (URL controlada → fetch + Puppeteer server-side)
> ⚠️ **PARCIAL.** ✅ Feito: validação SSRF da URL de entrada (`assertSafeHttpUrl` em `scrapers/index.js`, antes de cache/scrape). **Resta:** SSRF via redirect (`cheerioCrawler` `redirect:'follow'` + `page.goto` do Puppeteer re-resolvem DNS) e acesso anônimo/DoS (Chromium por request).
- **Localização:** `server/scrapers/index.js`; `smartScraper.js:233/289`; `cheerioCrawler.js:232/319`.
- **Solução restante:** validar cada hop / `redirect:'manual'` no cheerio + egress control no Puppeteer; rate-limit por IP e/ou auth via JWT do Supabase (decisão de produto).

### A6 — Idempotência frágil + sem lock no envio de recomendações (envio duplicado)
- **Localização:** `server/recommendations/index.js:154-204,241-268`, `scheduler.js:100-134`.
- **Problema:** dedup best-effort (SELECT + INSERT separados; catch retorna `null`); scheduler avança `next_run_at` **sempre** e sem row lock.
- **Impacto:** concorrência/cluster/retries → WhatsApp/email duplicado; falha transitória → semana pulada silenciosamente.
- **Severidade:** Alto.
- **Solução:** índice único `(tenant_id, idempotency_key)`; inserir histórico em `pending` antes de enviar; reivindicar schedules com `FOR UPDATE SKIP LOCKED`; avançar `next_run_at` só em sucesso.

### A7 — `expire_bolsao_leads()` roda a cada minuto: full scan sem índice, sem lock de linha, ticks sobrepostos
- **Localização:** cron `20260428_enable_pg_cron_and_bolsao_master_switch.sql:13-17`; função `20260428_roleta_redistribute_on_expiration.sql:92-202`.
- **Problema:** laço `FROM bolsao WHERE status='novo' AND atendido=false` **sem índice**; **sem `FOR UPDATE`**; sem advisory lock no job (ticks sobrepostos).
- **Impacto:** TOCTOU (redistribui lead recém-atendido); dupla-redistribuição; full scan por minuto cresce com `bolsao`.
- **Severidade:** Alto.
- **Solução:** `SELECT … FOR UPDATE SKIP LOCKED` + recheck; `pg_try_advisory_lock`; índice parcial em `bolsao(tenant_id,status,atendido)`.

### A8 — `bolsao` cresce ilimitadamente + base de timestamp de expiração inconsistente
- **Localização:** `20260427_mirror_leads_and_kenlo_into_bolsao.sql:38,85`; versões divergentes em `20260428_fix_bolsao_triggers...:135` vs `20260428_roleta_redistribute_on_expiration.sql:133`.
- **Problema:** todo lead/kenlo lead insere linha permanente em `bolsao`; nada purga. Duas migrações de mesma data fazem `CREATE OR REPLACE` da mesma função com lógicas diferentes.
- **Impacto:** custo do scan de A7 cresce para sempre; leads podem expirar no relógio errado.
- **Severidade:** Alto.
- **Solução:** consolidar numa única definição; política de retenção de `bolsao`.

### A10 — Dashboard de relatórios: 9 queries seriais a cada 30s, várias puxando tabela inteira
> ⚠️ **PARCIAL.** ✅ Feito: as 9 consultas seriais → `Promise.all` (`useRelatorios.ts`). **Resta:** mover agregações `select('*')`+JS para SQL/RPC e rever o intervalo de 30s / migrar para `useQuery`.
- **Localização:** `src/features/relatorios/hooks/useRelatorios.ts`.

### A11 — Ciclos de import entre features + acoplamento cross-feature
- **Localização:** ciclos confirmados `leads ↔ imoveis` (`PropostaPage.tsx:114` ⇄ `ImovelViewPage.tsx:23`), `leads ↔ agenda`. Contagens: `metricas→leads ×18`, `agentes-ia→corretores ×22`, `recommendations→imoveis ×15`.
- **Impacto:** nenhuma feature é testável/evoluível isoladamente; ciclos prejudicam code-splitting.
- **Severidade:** Alto.
- **Solução:** promover primitivas compartilhadas para `shared/`; inverter dependências via props/slots; ESLint `import/no-cycle`.

### A12 — Segredos de integração em texto puro no banco
- **Localização:** `google_calendar_tokens` (refresh token OAuth), `whatsapp_config` (app secret), `webhook_subscriptions.secret` (HMAC legível por qualquer membro).
- **Impacto:** comprometimento do banco (ou conta de corretor) expõe tokens/segredos reutilizáveis.
- **Severidade:** Alto.
- **Nota:** `tenant_email_secrets` (`20260616`) faz certo (AES-256-GCM + REVOKE) — referência.
- **Solução:** cifrar em repouso; gatear leitura de `webhook_subscriptions.secret` por role admin/owner (ligado ao C2 para o Google).

---

## MÉDIO

Merecem atenção, sem ação imediata.

### M1 — Arquivos-deus misturando dados + regra de negócio + UI
- `features/leads/pages/PropostaPage.tsx` (**6.489 linhas**), `features/corretores/components/EquipeSection.tsx` (**2.374, 43 `useState`**, `delete` de membership inline), `RelatoriosPage.tsx` (3.257), `BolsaoSection.tsx` (2.631), `components/imoveis/CriarImovelForm.tsx` (2.256).
- **Severidade:** Médio (Alto para `PropostaPage`/`EquipeSection`).
- **Solução:** extrair tipos → config → service/hook → subcomponentes. Incremental.

### M2 — Respostas de erro vazam mensagem interna de exceção
- **Localização:** quase todo `catch` retorna `error.message` (`api-server.js:1159,1208,…`; handler global `proxy-production.js:5198`; watermark e scraper).
- **Impacto:** vaza nomes de tabela/coluna, códigos PostgREST, paths — auxílio a reconhecimento.
- **Severidade:** Médio.
- **Solução:** mensagem genérica + correlation id; detalhe logado no servidor.

### M3 — `select('*')` sem escopo de tenant para agregação em memória
- **Localização:** `api-server.js` `GET /brokers/:id` (2839-2841): `select('*')` **sem filtro de tenant e sem limite**, filtra em JS por `raw_data.attendedBy` (perf **e** isolamento). `GET /brokers` (2740-2746) e `proxy-production.js:3995-4001` similares.
- **Severidade:** Médio (o scan sem tenant em `/brokers/:id` beira Alto).
- **Solução:** escopar por tenant; `count:'exact', head:true` para contagens.

### M4 — `JSON.stringify` deep-compare do array inteiro de leads a cada update
- **Localização:** `src/features/leads/hooks/useLeadsData.ts:323` + `setInterval(autoUpdate, 60000)`.
- **Impacto:** O(n) serialização ×2 por ciclo; ~10k leads ≈ ~1s de freeze por minuto.
- **Severidade:** Médio.
- **Solução:** comparar por length + set de ids; idealmente `useQuery` com `select`.

### M5 — Listas grandes sem virtualização + filtro pesado por render
> ⚠️ **PARCIAL.** ✅ Feito: métricas de `useImoveisData` em 1 passada (`computeImoveisMetrics`, O(n), com teste de equivalência). **Resta:** debounce + virtualização do grid de `ImoveisPage.tsx` (~20 `.filter()` por tecla).
- **Localização restante:** `ImoveisPage.tsx:~1491`.
- **Solução:** debounce na busca; virtualizar grid (`@tanstack/react-virtual`).

### M6 — Maioria dos hooks de domínio ignora TanStack Query
- **Localização:** `useLeadsData`, `useLeadsMetrics`, `useRelatorios`, `useChatConversations`, `useTarefas`, `useOKRs`, `usePDI`, `useRecruitment` etc. usam `useState`/`useEffect` cru.
- **Impacto:** dois componentes = dois fetches idênticos; sem coalescing/cache.
- **Severidade:** Médio (sistêmico).
- **Solução:** migrar incrementalmente para `useQuery`.

### M7 — Duplicação de regra de negócio (moeda, tenant, owner email)
- **Moeda** reimplementada ≥8× + **31 `Intl.NumberFormat('pt-BR')` inline** em 24 arquivos.
- **Resolução de tenant/owner-impersonation** copiada em ≥7 arquivos (3× só em `useLeadsMetrics.ts`). Owner email hardcoded em 5 arquivos.
- **Severidade:** Médio.
- **Solução:** `shared/utils/format.ts`; `resolveActiveTenantId()` único; helper de owner.

### M9 — Watermark: índice único cobre todos os status + sem reclaim de job travado
- **Localização:** `20260608_create_watermark_pipeline.sql:83,114`.
- **Problema:** `UNIQUE(photo_id, logo_version)` cobre todos os status → job `done`/`error` nunca re-enfileira. Worker que morre após claim órfã o job (`locked_at` nunca usado p/ stale).
- **Severidade:** Médio.
- **Solução:** índice único parcial; reclaim de `processing` por `locked_at` antigo.

### M11 — `proposals`/`proposal_parties`: escrita liberada a qualquer membro
- **Localização:** `20260519_create_proposals.sql:88-89,141-146` (`FOR ALL` a qualquer membro). SELECT foi restringido (`20260602`) mas escrita não.
- **Impacto:** qualquer corretor UPDATE/DELETE propostas de outros, incl. CPF/RG em `proposal_parties`.
- **Severidade:** Médio.
- **Solução:** restringir escrita ao dono/admin (e trocar `delete+insert` por upsert no `proposalsService`).

### M12 — SIGTERM/SIGINT ignorados e processo não sai em erro fatal
- **Localização:** `proxy-production.js:5374-5395` (`SIGTERM` no-op; `uncaughtException`/`unhandledRejection` só logam).
- **Impacto:** sem shutdown gracioso; após `uncaughtException` segue em estado possivelmente corrompido.
- **Severidade:** Médio.
- **Solução:** shutdown gracioso; em `uncaughtException`, logar + sair !=0.

### M13 — `tenant_id` aceito de query/body em alguns endpoints (footgun latente)
- **Localização:** `api-server.js` `/brokers` (2567), `/property-assignments` (3396,3466,…): `req.tenantId || tenant_id`.
- **Avaliação:** **guardado** hoje (req.tenantId vence; só alcançável pela key `demo` pinada). Latente se surgir key não-pinada.
- **Severidade:** Médio (latente).
- **Solução:** remover o fallback `|| tenant_id`.

### M14 — Conjunto de migrações não é auto-contido
- **Localização:** `expire_bolsao_leads` insere em `lead_queue_history` (criada em nenhuma migração); `pick_team_queue_member` e triggers "master-switch" só descritos.
- **Impacto:** rebuild limpo falha ou perde comportamento — risco de disaster-recovery.
- **Severidade:** Médio.
- **Solução:** tornar as migrações auto-contidas.

### M15 — CORS `*` no proxy nginx + CSP fraca
- **Localização:** `nginx.conf:72-80` (`Access-Control-Allow-Origin *` em `/api/v1/`); CSP em `:55` com wildcards + `'unsafe-inline'`.
- **Impacto:** qualquer site faz chamadas cross-origin à API; CSP praticamente não mitiga XSS.
- **Severidade:** Médio.
- **Solução:** ecoar origin allowlistado; endurecer CSP.

---

## BAIXO

Melhorias e refinamentos.

- **B1 — `modules/` é código morto.** `src/modules/{imoveis,corretores,funil-*}/index.ts` são stubs vazios; 0 importadores. **Solução:** apagar `modules/`.
- **B2 — 3 caminhos de import para um único client Supabase** (`@/lib/supabaseClient` 62×, `@/integrations/supabase/client` 25×, `@/services/supabaseService` 3×). **Solução:** um caminho canônico, codemod no resto.
- **B3 — `QueryProvider.tsx` morto** (`src/providers/QueryProvider.tsx:5` define um 2º QueryClient nunca montado). **Solução:** apagar.
- **B4 — `external_id` de lead com `Math.random()`** (`api-server.js:1764,2282,2360`; proxy `2654,3096,3620`); batch usa `Date.now()_${index}` que colide. **Solução:** `crypto.randomUUID()`.
- **B6 — Token de feed Kenlo hardcoded** em `kenlo-proxy.js:17`, `docker-compose.yml:49`, `vite.config.ts:56`; rota `/api/kenlo/imoveis` sem auth. **Solução:** mover para env; avaliar auth.
- **B7 — Scraper retorna dado fabricado como `success:true`** (`smartScraper.js:641-656`, cacheado 24h). **Solução:** retornar nulls + `fallback:true`; não cachear.
- **B8 — Containers Docker rodam como root** (`Dockerfile`, `Dockerfile.node` sem `USER`). **Solução:** usuário não-root.
- **B9 — `SECURITY.md` documenta "criptografia" XOR com chave hardcoded** (`src/utils/encryption.ts`) — security theater. **Solução:** apagar o util e corrigir o doc.
- **B10 — Watermark read routes sem auth** (`watermark/routes.js:117-149`) — IDOR leve + exaustão de recurso.
- **B11 — Migrações de teste/seed e ops destrutivas versionadas** (`20260429_delete_old_leads.sql`, `*_insert_test_*`, `20260601_proposals_unique_lead.sql`). Higiene/irreversibilidade.
- **B12 — Drift de nome de env do webhook ZAP** (`.env:14` `ZAPIMOVEIS_WEBHOOK_SECRET` vs `.env.example:23` `ZAPIMOVEIS_FEED_SECRET`).
- **B13 — Migrações duplicadas de `tarefas_semanais`** (`create_tarefas_semanais_tables.sql` vs `_safe.sql`). Manter só `_safe`.

---

## Itens verificados como CORRETOS (não sinalizados)

- Roleta via **trigger no banco** (`pick_roleta_broker`): `FOR UPDATE SKIP LOCKED` (o problema é a versão em memória — A3).
- Injeção em `.or()`: mitigada por `sanitizeFilterValue`.
- Secret de webhook/feed: `crypto.timingSafeEqual`.
- Key `demo`: pinada a `DEMO_TENANT_ID`, fail-closed.
- Lead CRUD do **`proxy-production.js`** (produção): escopa por `tenant_id` (as falhas de C1 eram do `api-server.js`).
- Recommendations crypto: AES-256-GCM. `tenant_email_secrets`: cifragem + REVOKE.
- `SUPABASE_SERVICE_ROLE_KEY`: não tem `VITE_` e não aparece em `src/`/`dist/`.
- Build de produção dropa `console.*` e não emite source maps.

---

## Status de correção

**Totalmente consertados (10)** — removidos deste documento:
- C1 (IDOR leads `api-server.js`), C4 (`excel_imports` RLS), C6 (edge function — gate de tenant via JWT), A1 (`supabase.raw`→RPC), A5 (SSRF+timeout webhooks), A9 (N+1 dos syncs — batch + memoize), M8 (GUC→membership em team_metrics/sales_transactions/corretor_metrics/teams), M10 (`agent_conversations` INSERT), M16 (DEFINER recrutamento + `count_leads_mensal`), B5 (email pessoal hardcoded).

**Parcialmente consertados (4)** — marcados com `⚠️ PARCIAL`:
- C5 (resta `tenant_api_keys` — adiado: restringir quebraria a IA dos corretores via `openaiService`; precisa proxy server-side), A4 (resta redirect-SSRF + DoS), A10 (resta agregação em SQL/intervalo), M5 (resta virtualização do grid).

**Não consertados (34):**
- Crítico: C2, C3, C7
- Alto: A2, A3, A6, A7, A8, A11, A12
- Médio: M1, M2, M3, M4, M6, M7, M9, M11, M12, M13, M14, M15
- Baixo: B1, B2, B3, B4, B6, B7, B8, B9, B10, B11, B12, B13

### Contagem
| Estado | Qtde |
|---|---|
| ✅ Totalmente consertados | **10** |
| ⚠️ Parcialmente consertados | **4** |
| ❌ Não consertados | **34** |
| **Total** | **48** |

> Migrações pendentes de aplicar no banco (correções já feitas em código): `20260617_fix_team_metrics_rls_isolation`, `20260617_fix_recruitment_rls_and_functions`, `20260617_fix_tenant_source_images_rls`, `20260617_fix_agent_conversations_insert_tenant_gate`, `20260618_fix_guc_rls_and_count_leads`. Edge function C6 pendente de **deploy** (`supabase functions deploy xml-create-broker-access`).
