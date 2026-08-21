# Auditoria de Segurança — OctoDash CRM (`octo-dash2`)

Data: 2026-08-19 · Branch `main` @ `28c2845` · Escopo: código-fonte, migrations, infra e dependências do repositório.

---

## Executive Summary

O sistema é um CRM imobiliário multi-tenant (React/Vite + Express + Supabase/Postgres) com um número
grande de integrações externas (Kenlo, Contact2Sale, Meta Lead Ads, WhatsApp Cloud API, ZAP/Grupo OLX,
Google Calendar, Anthropic, OpenAI, SMTP). A postura de segurança é **desigual**: há trechos
genuinamente bem feitos — o guard de SSRF (`server/security/ssrfGuard.js`), a verificação HMAC do
webhook da Meta com `timingSafeEqual`, a cifra AES-256-GCM dos segredos SMTP, a correção documentada do
escape anônimo de RLS em `leads` — convivendo com falhas graves de fundamentos: um **client secret OAuth
do Google publicado no bundle JavaScript**, um endpoint de scraping **sem autenticação** que dirige o
Puppeteer, **zero rate limiting HTTP** em toda a superfície e **API keys em texto claro** que qualquer
membro do tenant consegue ler e usar para operar como administrador da API.

O risco estrutural dominante: **o backend de produção fala com o Postgres usando `service_role`, que
bypassa RLS por completo**. Isso significa que toda garantia de isolamento entre imobiliárias depende
exclusivamente do código de cada rota lembrar de aplicar `.eq('tenant_id', ...)`. Há ~90 rotas e pelo
menos 6 implementações duplicadas do mesmo middleware de autenticação. É uma superfície onde um único
esquecimento vira vazamento cross-tenant, e não existe rede de proteção embaixo.

### Findings por severidade

| Severidade | Qtd |
|---|---|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 9 |
| LOW | 6 |
| INFO | 3 |

### Componentes mais críticos

1. `server/proxy-production.js` (5.102 linhas) — entrypoint de produção, cliente `service_role`, ~50 rotas.
2. `server/utils/ownerAuth.js` + as 6 cópias de `requireSupabaseAuth` — a fronteira de autorização inteira.
3. `src/features/agenda/services/googleCalendarService.ts` — fluxo OAuth inteiro no cliente.
4. `Dockerfile` / `docker-compose.yml` — secrets em build args, container como root.
5. `server/scrapers/` — Puppeteer acionado por entrada externa.

---

## Attack Surface

**Fronteiras de confiança identificadas:**

| # | Fronteira | Autenticação | Observação |
|---|---|---|---|
| 1 | `/api/v1/leads/*`, `/brokers`, `/webhooks`, `/roleta`, `/property-assignments` | `validateApiKey` (Bearer `octo_...`) | Sem granularidade de papel. A key É o tenant inteiro. |
| 2 | `/api/v1/agent-actions/*`, `/kpis`, `/enps`, `/recommendations`, `/whatsapp`, `/view-as` | JWT Supabase + `tenant_memberships` | 6 implementações duplicadas; consistentes entre si. |
| 3 | `/api/v1/{kenlo,contact2sale,santa-angela,zap,anthropic}/*` | `requireOwner` / `requireManager` | Owner = e-mail hardcoded. |
| 4 | `/api/v1/integrations/meta/webhook/:token` | HMAC SHA-256 + token no path | Bem implementado. |
| 5 | `/api/v1/integrations/{zapimoveis,grupo-olx}/*` | Secret por tenant em header **ou query string** | Secret em query vaza para logs/Referer. |
| 6 | `/api/v1/scrape-imovel` | **NENHUMA** | Aciona Puppeteer. |
| 7 | `/api/v1/watermark/photos/:id[/:size]` | **NENHUMA** | Aciona geração de imagem. |
| 8 | `/api/v1/health/jobs`, `/watermark/worker/tick` | Token estático em header | Fail-closed correto. |
| 9 | Supabase PostgREST direto do browser | anon key + JWT + RLS | Superfície paralela, não coberta pelo backend. |
| 10 | `/oauth/google/callback` | `state` **não validado** | Ver SEC-002. |

**Ativos protegidos:** PII de leads (nome/telefone/e-mail/mensagem — LGPD), credenciais de integração por
tenant (WhatsApp access_token, Kenlo, C2S, Anthropic Admin API key, SMTP), tokens OAuth do Google
(access + refresh), API keys de tenant, e a chave `service_role` do Supabase.

**Perfis de atacante considerados:** anônimo na internet; corretor autenticado (papel mais baixo);
admin de um tenant tentando alcançar outro; integração externa comprometida (n8n, Meta, portais).

---

## Findings

### SEC-001 — Client secret OAuth do Google publicado no bundle JavaScript

```
Severity:   CRITICAL
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:**
- `src/features/agenda/services/googleCalendarService.ts:12`
- `Dockerfile:22,29` (declara como `ARG`/`ENV` do estágio de build)
- `dist/assets/googleCalendarService-Dli9wH3V.js` (artefato construído — secret presente em texto claro)

**Código relevante:**
```ts
// googleCalendarService.ts:12
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_SECRET ?? '';
...
body: new URLSearchParams({ code, client_id, client_secret: clientSecret, ... })
```

**Root Cause:** o prefixo `VITE_` instrui o Vite a **inlinear a variável no bundle em tempo de build**.
O fluxo escolhido foi o Authorization Code sem PKCE, que exige o `client_secret` no ponto de troca — e
esse ponto foi colocado no browser. O `Dockerfile` reforça o erro passando o secret como build arg.

**Verificação executada:**
```
$ grep -roE "GOCSPX-[A-Za-z0-9_-]{5}" dist/
dist/assets/googleCalendarService-Dli9wH3V.js:GOCSPX-jbrh8
```

**Attack Path:** qualquer pessoa abre a aplicação → baixa `/assets/googleCalendarService-*.js` → lê o
`client_secret`. Não requer conta, sessão ou privilégio.

**Preconditions:** nenhuma. O bundle é servido publicamente por `express.static` (`proxy-production.js:4862`).

**Impact:** o par `client_id` + `client_secret` permite ao atacante se passar pela aplicação OctoDash
perante o Google: montar telas de consentimento com a identidade e o logotipo da OctoDash para phishing
de contas Google, trocar authorization codes obtidos por outros meios, e renovar indefinidamente
refresh tokens que vazem. Combinado com SEC-002, permite sequestrar a agenda de usuários.

**Remediation:**
1. **Rotacionar o client secret no Google Cloud Console imediatamente.** O valor atual deve ser
   considerado público e comprometido de forma permanente.
2. Mover a troca de código e a renovação de token para o servidor. O browser recebe apenas o `code`;
   um endpoint autenticado faz o POST em `oauth2.googleapis.com/token` com o secret vindo de
   `process.env.GOOGLE_CALENDAR_CLIENT_SECRET` (**sem** prefixo `VITE_`).
3. Remover o `ARG`/`ENV` `VITE_GOOGLE_CALENDAR_CLIENT_SECRET` do `Dockerfile`.
4. Alternativa se manter no cliente for requisito: migrar para **PKCE** (`code_challenge`/`code_verifier`),
   que existe exatamente para clientes públicos e dispensa o secret.

**Suggested Patch (esboço do lado servidor):**
```js
// server/agenda/googleOAuthRoutes.js  (novo)
app.post('/api/v1/google-calendar/exchange', requireSupabaseAuth, async (req, res) => {
  const { code, verifierNonce } = req.body || {};
  // valida o nonce contra o que foi emitido em /authorize para ESTE req.userId
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET, // NUNCA VITE_
      redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'token_exchange_failed' });
  const tok = await r.json();
  // grava sempre em req.userId — nunca num id vindo do cliente
  await saveTokens(req.userId, tok);
  res.json({ ok: true });
});
```

---

### SEC-002 — OAuth `state` forjável: sequestro da agenda Google da vítima (CSRF de account-linking)

```
Severity:   CRITICAL
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:**
- `src/features/agenda/pages/GoogleOAuthCallbackPage.tsx:12-22` (`decodeState`)
- `src/features/agenda/services/googleCalendarService.ts:71` (geração do `state`)

**Código relevante:**
```ts
// geração
const state = btoa(JSON.stringify({ userId, tenantId, timestamp: Date.now() }));

// consumo — decodifica e CONFIA, sem comparar com nada guardado antes do redirect
function decodeState(stateB64) {
  const data = JSON.parse(atob(stateB64));
  if (data?.userId && data?.tenantId) return { userId: data.userId, tenantId: data.tenantId };
  return null;
}
...
const tokens = await exchangeCodeForTokens(code);
await saveGoogleTokens(stateData.userId, stateData.tenantId, tokens);
```

**Root Cause:** o `state` do OAuth existe para ser um **nonce anti-CSRF**: um valor aleatório gravado
antes do redirect e comparado na volta. Aqui ele foi reaproveitado como transporte de dados de
aplicação — é base64 (não criptografia), não é aleatório, não é assinado e nunca é comparado com um
valor previamente armazenado. Qualquer um constrói um `state` válido.

**Attack Path:**
1. O atacante inicia um consentimento OAuth com a **própria** conta Google e captura o `code` retornado.
2. Monta `https://octodash.octoia.org/oauth/google/callback?code=<code_do_atacante>&state=<btoa({userId:"<uuid-da-vítima>",tenantId:"<tenant-da-vítima>"})>`.
3. Envia o link à vítima (que está logada no CRM).
4. O browser da vítima troca o código pelo token — funciona porque o `client_secret` está no bundle (SEC-001) —
   e executa `saveGoogleTokens(userIdDaVítima, ...)`. O RLS aprova, porque o `user_id` gravado é o da própria vítima.
5. A linha `google_calendar_tokens` da vítima passa a conter os tokens da **conta Google do atacante**.

**Preconditions:** vítima autenticada no CRM clica em um link. Nenhum privilégio adicional.

**Impact:** a partir daí, todo evento de agenda que a vítima sincronizar (visitas, reuniões com clientes,
dados de leads no corpo do evento) é escrito no Google Calendar do atacante — exfiltração contínua de
dados comerciais e PII, silenciosa, sem alerta ao usuário. Adicionalmente,
`.from('agenda_eventos').update(...).eq('tenant_id', stateData.tenantId)` executa uma atualização em massa
com `tenant_id` controlado pelo atacante (limitada pelo RLS, mas ainda assim indevida).

**Remediation:**
1. Gerar `state` com `crypto.randomUUID()`, gravar em `sessionStorage` antes do redirect e, no callback,
   **comparar e descartar**. Divergência ⇒ aborta.
2. Nunca derivar `userId`/`tenantId` do `state`. Usar sempre a sessão autenticada corrente
   (`supabase.auth.getUser()`).
3. Fazer a troca no servidor (SEC-001), que já resolve o vetor pela raiz.

**Suggested Patch:**
```ts
// googleCalendarService.ts — emissão
export function getGoogleAuthUrl(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem('google_oauth_state', state);
  return `https://accounts.google.com/o/oauth2/v2/auth?...&state=${state}`;
}

// GoogleOAuthCallbackPage.tsx — consumo
const expected = sessionStorage.getItem('google_oauth_state');
sessionStorage.removeItem('google_oauth_state');
if (!state || !expected || state !== expected) {
  setStatus('error'); setMessage('Sessão inválida. Tente conectar novamente.'); return;
}
const { data: { user } } = await supabase.auth.getUser();
if (!user) { setStatus('error'); return; }
const tokens = await exchangeCodeForTokens(code);
await saveGoogleTokens(user.id, tenantIdDaSessao, tokens);  // NUNCA do state
```

---

### SEC-003 — Endpoint de scraping sem autenticação aciona Puppeteer (DoS + abuso de custo)

```
Severity:   HIGH
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/scrapers/index.js:162` · registrado em `server/proxy-production.js:479`

**Código relevante:**
```js
app.post('/api/v1/scrape-imovel', async (req, res) => {   // ← sem validateApiKey
  const { url } = req.body;
  ...
  const result = await enqueue(() => scrapeImovel(url, openaiKey));
```

Todas as demais ~50 rotas do arquivo recebem `validateApiKey`. Esta é a única exceção.

**Root Cause:** `registerScrapeRoute(app, supabase)` não recebe nem aplica middleware de autenticação.
`req.tenantId` é lido dentro do handler (`const tenantId = req.tenantId || null`) — evidência de que a
autenticação era esperada e nunca foi ligada.

**Attack Path:** `POST /api/v1/scrape-imovel {"url":"https://qualquer-site-publico/..."}` de qualquer
origem, sem credencial. Cada requisição levanta o pipeline `smartScraper` (Chromium via puppeteer-extra).

**Preconditions:** nenhuma. Endpoint público.

**Impact:**
- **DoS de disponibilidade (principal):** o processo roda com `NODE_OPTIONS=--max-old-space-size=512`
  (`Dockerfile:99`) e serve **também o frontend e toda a API**. 5 instâncias concorrentes de Chromium +
  uma fila de 20 derrubam o container inteiro, não só o scraper.
- **Exaustão de memória por cache:** `const cache = new Map()` (`scrapers/index.js:21`) tem TTL de 24 h
  mas **nenhum limite de tamanho**. URLs distintas em volume ⇒ crescimento ilimitado ⇒ OOM.
- **Abuso de custo:** com `req.tenantId === null`, o pipeline usa `process.env.OPENAI_API_KEY` — a chave
  da plataforma. Cada chamada anônima gasta dinheiro do operador.
- **Proxy de scraping de terceiros:** o servidor busca URLs arbitrárias, expondo o IP de produção a
  bloqueios/denúncias de sites-alvo (o `puppeteer-extra-plugin-stealth` agrava a leitura de intenção).

*Nota:* o **SSRF está corretamente bloqueado** por `assertSafeHttpUrl` (`scrapers/index.js:172`). O
problema é autenticação e recurso, não destino de rede.

**Remediation:**
```js
// server/scrapers/index.js
export function registerScrapeRoute(app, supabaseClient, { validateApiKey } = {}) {
  if (!validateApiKey) throw new Error('registerScrapeRoute exige validateApiKey');
  app.post('/api/v1/scrape-imovel', validateApiKey, async (req, res) => {
```
```js
// server/proxy-production.js:479
registerScrapeRoute(app, supabase, { validateApiKey });
```
Complementos: limitar o `Map` de cache (LRU com teto, ex. 5.000 entradas) e mover o Puppeteer para um
processo/container separado, de modo que o esgotamento do scraper não derrube a API.

---

### SEC-004 — API keys em texto claro concedem privilégio total do tenant a qualquer membro

```
Severity:   HIGH
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:**
- `supabase/migrations/20260214_create_tenant_api_keys.sql:16-24` (policy de SELECT)
- `server/proxy-production.js:243-306` (`validateApiKey`)
- `src/features/settings/services/apiKeyService.ts:48-60`

**Código relevante:**
```sql
CREATE POLICY "tenant_api_keys_select" ON public.tenant_api_keys
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.tenant_id = tenant_api_keys.tenant_id AND tm.user_id = auth.uid())
  );  -- ← qualquer papel, inclusive 'corretor'
```
```js
const { data } = await supabase.from('tenant_api_keys')
  .select('tenant_id, status').eq('api_key', apiKey)  // ← comparação de segredo em texto claro
```

**Root Cause:** dois problemas somados. (a) A chave é guardada e comparada em texto claro, em vez de
como hash — um dump do banco, um backup ou um log entrega credenciais utilizáveis. (b) A policy de
SELECT autoriza **qualquer membership**, sem distinguir papel, e as rotas protegidas por `validateApiKey`
**não têm nenhuma verificação de papel** — a key concede tudo o que a API oferece.

**Attack Path:** um corretor (papel mais baixo do produto) abre o DevTools ou consulta o PostgREST
diretamente com o próprio JWT:
`GET /rest/v1/tenant_api_keys?select=api_key&provider=eq.crm` → recebe a chave → passa a operar como
administrador da API do tenant.

**Preconditions:** qualquer membership ativa no tenant.

**Impact — escalonamento vertical de privilégio.** Com a key, o corretor pode:
`DELETE /api/v1/leads/:id` (apagar leads de colegas), `PATCH /api/v1/leads/:id/agent` (reatribuir a
carteira inteira para si), `GET /api/v1/leads?limit=…` (exportar toda a base de PII do tenant, incluindo
`raw_data`), `POST /api/v1/webhooks` (registrar um webhook para um servidor próprio e receber, em tempo
real, todo lead criado — exfiltração contínua), `POST /api/v1/bolsao/:id/redistribute` (manipular a
distribuição comercial). Nenhuma dessas ações é permitida ao papel `corretor` pela UI.

Na mesma tabela convivem as chaves `provider='openai'` e `provider='anthropic'` — as chaves de LLM da
imobiliária vazam pelo mesmo caminho.

**Remediation:**
1. Guardar apenas `sha256(api_key)`; exibir o valor uma única vez, no momento da geração.
   A validação passa a ser `.eq('api_key_hash', sha256(apiKey))`.
2. Restringir a policy de SELECT a `role IN ('admin','owner')`.
3. Nunca retornar a coluna do segredo em listagens (mostrar só o prefixo, ex. `octo_sk_AbCd…`).
4. Introduzir escopos na key (`leads:read`, `leads:write`, `webhooks:write`) e verificar por rota.

**Suggested Patch:**
```sql
-- migration
ALTER TABLE public.tenant_api_keys ADD COLUMN IF NOT EXISTS api_key_hash TEXT;
UPDATE public.tenant_api_keys SET api_key_hash = encode(digest(api_key,'sha256'),'hex')
  WHERE api_key_hash IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_api_keys_hash ON public.tenant_api_keys(api_key_hash);
-- após validar o corte: ALTER TABLE public.tenant_api_keys DROP COLUMN api_key;

ALTER POLICY "tenant_api_keys_select" ON public.tenant_api_keys
  USING (EXISTS (SELECT 1 FROM public.tenant_memberships tm
                 WHERE tm.tenant_id = tenant_api_keys.tenant_id
                   AND tm.user_id = auth.uid()
                   AND tm.role IN ('admin','owner')));
```
```js
// server/proxy-production.js
import crypto from 'crypto';
const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
const { data, error } = await supabase
  .from('tenant_api_keys')
  .select('tenant_id, status')
  .eq('api_key_hash', keyHash)
  .eq('provider', 'crm')
  .single();
```

---

### SEC-005 — Ausência total de rate limiting HTTP

```
Severity:   HIGH
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** todos os entrypoints (`server/proxy-production.js`, `server/api-server.js`). Nenhuma
dependência de rate limiting em `package.json` nem em `server/package.json`. O único limitador existente
(`server/communication/rateLimiter.js`) governa **envios de saída**, não requisições de entrada.

**Root Cause:** a proteção contra volume nunca foi adicionada; o `nginx.conf` (que também não tem
`limit_req`) sequer está no caminho do deploy do EasyPanel.

**Attack Path:** sem limite, um atacante pode: (a) forçar bruta contra `validateApiKey` — cada tentativa
é uma consulta ao Postgres, o que também é um vetor de DoS no banco; (b) enumerar tokens do webhook Meta
e secrets de feed do ZAP; (c) inundar `/api/v1/scrape-imovel` (SEC-003); (d) inundar o login do Supabase.

**Impact:** viabiliza força bruta de credenciais e DoS de camada de aplicação sobre um processo único que
serve API + frontend.

**Remediation:** aplicar `express-rate-limit` em três camadas — global generosa, agressiva nas rotas de
autenticação (`validateApiKey`, `/scrape-imovel`, webhooks) e por tenant nas rotas de escrita. Confiar em
`X-Forwarded-For` exige `app.set('trust proxy', 1)`.

```js
import rateLimit from 'express-rate-limit';
app.set('trust proxy', 1);
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true }));
const strict = rateLimit({ windowMs: 60_000, limit: 10 });
app.use('/api/v1/scrape-imovel', strict);
```

---

### SEC-006 — Upload de 25 MB em memória processado **antes** da autenticação

```
Severity:   HIGH
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/watermark/routes.js:95`

**Código relevante:**
```js
router.post('/photos', upload.single('photo'), requireTenant({ from: 'body' }), async (req, res) => {
//                     ^^^^^^^^^^^^^^^^^^^^^ multer roda ANTES do middleware de auth
```
com `multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })`.

**Root Cause:** a ordem é obrigatória do jeito que está escrito — `requireTenant({from:'body'})` lê
`req.body.tenantId`, que só existe **depois** que o multer parseia o multipart. A dependência entre
parsing e autorização inverteu a ordem correta.

**Attack Path:** um anônimo envia repetidamente `POST /api/v1/watermark/photos` com 25 MB de corpo.
Cada requisição aloca 25 MB no heap antes de qualquer verificação; a resposta 401 chega tarde demais.

**Preconditions:** nenhuma.

**Impact:** OOM do processo com `--max-old-space-size=512` — cerca de 20 requisições concorrentes bastam
para derrubar API e frontend. Comentário do próprio código: *"não passa pelo express.json, então não
infla o body parser"* — a preocupação estava certa, a conclusão não.

Secundariamente, o tipo do arquivo é validado apenas por `req.file.mimetype`, que é o `Content-Type`
declarado pelo cliente — não há verificação de magic bytes antes de entregar o buffer ao pipeline de
imagem.

**Remediation:** autenticar antes de aceitar bytes. Passar o `tenantId` na URL torna a ordem correta possível:
```js
router.post('/tenants/:tenantId/photos', requireTenant(), upload.single('photo'), handler);
// e manter a rota antiga por um ciclo, com um verifyUser() barato antes do multer:
router.post('/photos', async (req, res, next) => (await verifyUser(req, res)) ? next() : undefined,
            upload.single('photo'), requireTenant({ from: 'body' }), handler);
```
Complementar com verificação de magic bytes (`sharp(...).metadata()` em try/catch, ou `file-type`) e
reduzir o limite para o tamanho real necessário.

---

### SEC-007 — Container roda como root, sem headers de segurança e com CSP inútil

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `Dockerfile` (sem diretiva `USER`); `server/proxy-production.js` (sem `helmet`);
`index.html` (sem `<meta http-equiv="Content-Security-Policy">`); `nginx.conf:52`.

**Evidência:**
```
$ grep -c "USER " Dockerfile
0
$ grep -rn "helmet|Content-Security-Policy|Strict-Transport" server/*.js server/**/*.js
(nenhum resultado)
```
E no `nginx.conf` (não usado no deploy atual, mas presente no repositório):
```
Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'"
```
Essa política permite `http:`, `https:`, `data:`, `blob:` e `unsafe-inline` — ou seja, permite tudo. É
uma CSP que não nega nada.

**Impact:** o processo Node é PID 1 como root; qualquer RCE ou escape de container parte de root.
A ausência de `X-Frame-Options`/`frame-ancestors` permite clickjacking sobre o CRM. Sem `HSTS`, a
primeira visita fica exposta a downgrade. Sem CSP real, qualquer XSS (ver SEC-011) explora sem obstáculo.

**Remediation:**
```dockerfile
# Dockerfile — estágio de runtime, antes do ENTRYPOINT
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
```
```js
// server/proxy-production.js — após os imports
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.VITE_SUPABASE_URL, 'https://oauth2.googleapis.com'],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

---

### SEC-008 — Credencial de integração Kenlo hardcoded e versionada no Git

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:**
- `server/kenlo-proxy.js:16` (rastreado em Git — commit `bc4da7e`)
- `docker-compose.yml:60` (rastreado em Git)

Ambos contêm a URL do XML da Kenlo com o parâmetro de autenticação `?...&p=<token>` embutido literalmente.

**Root Cause:** a URL de integração carrega o segredo no query string e foi tratada como configuração
pública. Não é: quem tem a URL tem o catálogo de imóveis da imobiliária.

**Attack Path:** qualquer pessoa com acesso de leitura ao repositório (colaborador atual ou antigo, fork,
CI de terceiro, vazamento do repo) extrai o token do histórico. Como está no histórico, remover do
`HEAD` não resolve.

**Impact:** acesso não autorizado ao feed XML completo de imóveis do tenant Santa Ângela.

**Remediation:** rotacionar o token junto à Kenlo; mover a URL para `process.env.KENLO_XML_URL` (o
`.env.example` já prevê a variável); tratar o valor histórico como comprometido de forma permanente. Se
`server/kenlo-proxy.js` estiver obsoleto — ele não é referenciado por nenhum script do `package.json` —
o caminho mais simples é apagar o arquivo.

---

### SEC-009 — Secrets de integração armazenados em texto claro no banco

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:**
- `supabase/migrations/20260528_create_whatsapp_chat.sql:20-30` — `whatsapp_config.access_token`,
  `webhook_verify_token`, `app_secret`
- `supabase/migrations/20260214_create_tenant_api_keys.sql` — `tenant_api_keys.api_key`
- `src/features/agenda/services/googleCalendarService.ts:162` — `google_calendar_tokens.refresh_token`

**Root Cause:** inconsistência de padrão dentro do próprio projeto. A senha SMTP **é** cifrada com
AES-256-GCM (`server/recommendations/crypto.js`, com a chave-mestra fora do banco, em
`EMAIL_ENCRYPTION_KEY`) — a decisão certa, documentada com o raciocínio certo: *"assim um dump do
Postgres não revela a senha"*. Esse mesmo raciocínio não foi aplicado às demais credenciais.

**Impact:** um dump, um backup mal protegido, um `SELECT` acidental em log de query ou um comprometimento
da chave `service_role` entrega, em texto claro, os access tokens do WhatsApp Business (envio em nome da
imobiliária, com risco de banimento da conta Meta), os app secrets (forja de webhooks) e os refresh
tokens do Google (acesso persistente às agendas).

*Nota positiva:* as policies RLS de `whatsapp_config` estão corretas — restritas a `admin`/`owner`
(`20260528_create_whatsapp_chat.sql:160-196`). O problema é cifragem em repouso, não controle de acesso.

**Remediation:** reutilizar `encryptSecret`/`decryptSecret` de `server/recommendations/crypto.js` (o
módulo já é genérico) para `whatsapp_config.access_token`, `app_secret` e `google_calendar_tokens.refresh_token`.
Prever migração com dupla leitura (aceitar texto claro e cifrado) durante a transição.

---

### SEC-010 — Secret do feed ZAP/OLX aceito via query string

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/proxy-production.js:871-882` (`validateZapFeedAccess`)

```js
const providedSecret = firstHeaderValue(req.headers['x-zapimoveis-feed-secret'])
  || ... 
  || req.query.token         // ← segredo na URL
  || req.query.feed_token
  || req.query.secret;
```

**Root Cause:** aceitar o segredo pela URL é uma concessão de compatibilidade (portais que só sabem
consumir um link). O efeito colateral é que o segredo passa a viver em toda parte onde URLs vivem.

**Attack Path:** o secret aparece em logs de acesso do reverse proxy e do EasyPanel, no header `Referer`
de qualquer recurso carregado a partir da resposta, no histórico do browser, em bookmarks e em qualquer
sistema de APM/monitoramento que capture path completo.

**Impact:** posse do secret ⇒ `req.tenantId` definido ⇒ leitura do feed completo de imóveis do tenant e
**escrita** via `POST /api/v1/integrations/{zapimoveis,grupo-olx}/webhook` (injeção de leads falsos).

**Remediation:** manter o header como caminho preferencial; se a query string for inevitável para o
portal, emitir para ela um token **distinto, restrito a GET dos feeds XML** e sem acesso aos endpoints de
webhook. Redigir o valor nos logs de acesso e rotacionar periodicamente.

---

### SEC-011 — Injeção em filtros PostgREST via parâmetros de rota não sanitizados

```
Severity:   MEDIUM
Confidence: MEDIUM
Status:     LIKELY
```

**Affected:**
- `server/proxy-production.js:663` e `:2738` — `/api/v1/leads/phone/:phone`
- `server/proxy-production.js:3996`, `:4171`, `:4215`
- `server/api-server.js:1261`, `:2400`, `:3114`, `:3770`

**Código relevante:**
```js
// linha 663 — `phone` entra CRU no filtro
.or(`client_phone.ilike.%${cleanPhone}%,client_phone.ilike.%${phone}%`)
```
Compare com a linha 531, no mesmo arquivo, que faz certo:
```js
const s = sanitizeFilterValue(search);   // remove , ( ) * \
query = query.or(`client_name.ilike.%${s}%,...`);
```

**Root Cause:** existe um sanitizador correto (`sanitizeFilterValue`, linha 826) e ele é aplicado em
apenas 3 dos ~12 pontos de interpolação. Vírgulas e parênteses são metacaracteres da sintaxe `or=` do
PostgREST; sem removê-los, o cliente escreve predicados adicionais.

**Attack Path:** `GET /api/v1/leads/phone/x,client_email.ilike.*%40gmail.com` — o `,` fecha o predicado e
abre outro escolhido pelo atacante, transformando o endpoint num oráculo booleano sobre colunas
arbitrárias de `kenlo_leads`.

**Impact — limitado, e é importante ser preciso sobre o porquê:** o filtro `.eq('tenant_id', req.tenantId)`
é uma cláusula `AND` **separada**, e o conteúdo injetado fica confinado dentro do grupo `or=(...)`. Não é
possível romper esse grupo para alcançar o `AND` externo, portanto **não há bypass de tenant**. O ganho
real do atacante é consultar colunas do próprio tenant que a API não expõe (`raw_data`, colunas internas)
e provocar erros de sintaxe. Como quem chega aqui já possui uma API key com leitura completa do tenant, o
impacto incremental é baixo — mas é uma classe de bug que se torna crítica assim que uma dessas queries
perder o `.eq('tenant_id', ...)`.

**Remediation:** aplicar `sanitizeFilterValue` em **todos** os pontos de interpolação. O padrão já existe
no arquivo; é só usá-lo de forma consistente.
```js
// server/proxy-production.js:663 e :2738
const safePhone = sanitizeFilterValue(phone);
.or(`client_phone.ilike.%${cleanPhone}%,client_phone.ilike.%${safePhone}%`)
```
Melhor ainda: para o caso do telefone, `cleanPhone` (só dígitos) já basta — o segundo predicado com o
valor cru pode simplesmente ser removido.

---

### SEC-012 — Membro comum pode enviar WhatsApp para número arbitrário com as credenciais da imobiliária

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/whatsapp/index.js:97-140`

```js
app.post('/api/v1/whatsapp/send', requireSupabaseAuth, async (req, res) => {
  const { conversationId, to, body, template, media } = req.body || {};
  ...
  const { data: conv } = await supabase.from('whatsapp_conversations')
    .select('id, tenant_id, contact_phone').eq('id', conversationId).maybeSingle();
  const allowed = await ensureTenantAccess(supabase, req, conv.tenant_id);
  // ... `to` é usado no envio SEM ser comparado com conv.contact_phone
```

**Root Cause:** a conversa é carregada e serve para autorizar o tenant, mas o destinatário efetivo (`to`)
é um campo independente vindo do cliente. `conv.contact_phone` é selecionado e não é usado como validação.

**Attack Path:** qualquer membro autenticado (inclusive `corretor`) envia
`{"conversationId":"<id-de-conversa-válida>","to":"+55...qualquer...","body":"..."}`.

**Impact:** o número de WhatsApp Business da imobiliária vira ferramenta de spam/phishing por qualquer
membro, com risco concreto de banimento da conta pela Meta — e o rastro fica na imobiliária. Também não
há verificação de que o usuário tem acesso *àquela conversa* (a migration
`20260816_whatsapp_conversation_visibility.sql` restringe a visibilidade por corretor no RLS, mas o
backend usa `service_role` e não reaplica a regra).

**Remediation:**
```js
import { normalizePhone } from '../utils/phone.js';   // já existe no projeto
if (normalizePhone(to) !== normalizePhone(conv.contact_phone)) {
  return res.status(400).json({ error: 'recipient_mismatch' });
}
// e reaplicar a visibilidade por corretor:
if (conv.assigned_user_id && conv.assigned_user_id !== req.userId && !isManager(role)) {
  return res.status(403).json({ error: 'conversation_not_assigned' });
}
```

---

### SEC-013 — `xlsx` (SheetJS) com prototype pollution e ReDoS, sem correção disponível

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `package.json` → `"xlsx": "^0.18.5"`
Uso em: `src/features/relatorios/import/generic/services/genericImportService.ts:54`,
`src/features/leads/services/excelFunilInteressado.ts:32`, `src/components/ExportSpreadsheet.tsx:22`

```
xlsx  *   Severity: high
  Prototype Pollution in sheetJS — GHSA-4r6h-8v6p-xvw6
  SheetJS ReDoS              — GHSA-5pgg-2g8v-p4x9
  No fix available (registro npm)
```

**Attack Path:** o produto tem fluxos de importação em que o usuário escolhe uma planilha
(`GenericImportPage`, `KpiImportWizard`). Um `.xlsx` criado por um atacante e enviado a um corretor
("planilha de leads do mês") é parseado no browser da vítima com `XLSX.read()` — poluindo
`Object.prototype` no contexto autenticado do CRM, o que pode alterar o comportamento de checagens de
permissão no cliente e abrir caminho para XSS.

**Impact:** comprometimento do contexto da SPA autenticada. Agravado pela ausência de CSP (SEC-007).

**Remediation:** migrar para a distribuição oficial mantida (`https://cdn.sheetjs.com/`, versão ≥ 0.20.2),
que corrige ambos os avisos — o pacote no npm foi abandonado pelo mantenedor. Alternativa: o projeto **já
usa `exceljs`** em `excelReportGenerator.ts`; consolidar a leitura nele elimina a dependência. Enquanto
não migrar, fazer o parsing dentro de um Web Worker isolado limita o alcance da poluição.

---

### SEC-014 — Dependências vulneráveis adicionais

```
Severity:   MEDIUM
Confidence: HIGH
Status:     CONFIRMED
```

`npm audit --omit=dev`: **11 vulnerabilidades (1 crítica, 5 altas, 5 moderadas)**.

| Pacote | Severidade | Aviso | Exposição real neste projeto |
|---|---|---|---|
| `extract-zip` (via `puppeteer`) | HIGH | GHSA-jmr9-qjv8-65gv — path traversal por symlink | Só no download do Chromium; o Dockerfile define `PUPPETEER_SKIP_DOWNLOAD=true`. Risco baixo em runtime. |
| `dompurify` (via `jspdf`) | MODERATE | 16 avisos de bypass de XSS | `jspdf` gera PDFs a partir de dados de leads. Se o conteúdo do lead alimentar HTML, é um caminho de XSS. |
| `react-router` ≤ 7.17.0 | MODERATE | GHSA-wrjc-x8rr-h8h6 — open redirect via backslash | Redirecionamento aberto se algum `<Link>`/`useNavigate` receber destino vindo de query string. |
| `uuid` (via `exceljs`) | MODERATE | GHSA-w5hq-g745-h8pq | Baixo — o caminho `buf` não é usado. |

**Remediation:** `npm audit fix` resolve `react-router` sem quebra. `jspdf@4` e `puppeteer@25` são
breaking changes — agendar com teste de regressão. Adicionar `npm audit --omit=dev --audit-level=high` ao
CI (`.github/`) para que novas vulnerabilidades não entrem silenciosamente.

---

### SEC-015 — Mensagens de erro internas devolvidas ao cliente

```
Severity:   LOW
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/proxy-production.js:4901-4907` (handler global) e ~40 handlers individuais.

```js
app.use((err, req, res, next) => {
  console.error('❌ Erro no servidor:', err);
  res.status(500).json({ error: 'Erro interno do servidor', message: err.message, ... });
});
```
Padrão repetido em rotas: `error: { code: 'SERVER_ERROR', message: error.message }`, e
`/agent-actions/preview` devolve `detail: err?.message`.

**Impact:** erros do PostgREST expõem nomes de tabelas e colunas, códigos SQL (`42703`, `23505`) e
detalhes de constraints — mapa gratuito do schema para quem está sondando. Erros de `fetch` expõem
hostnames de integrações internas.

**Remediation:** logar o erro completo no servidor com um `errorId` correlacionável; devolver ao cliente
apenas `{ error: 'internal_error', errorId }`. Manter `err.message` na resposta somente quando
`process.env.NODE_ENV !== 'production'`.

---

### SEC-016 — Paginação sem limite superior e exposição excessiva de dados

```
Severity:   LOW
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/proxy-production.js:509-540`

```js
const { page = 1, limit = 50 } = req.query;
const offset = (parseInt(page) - 1) * parseInt(limit);
query = query.range(offset, offset + parseInt(limit) - 1);   // sem clamp
```

Não há teto (o PostgREST corta em 1000, mas isso é coincidência de configuração, não controle
deliberado), não há piso (`page=0` ⇒ offset negativo ⇒ erro 500), e `limit=abc` ⇒ `NaN` ⇒ erro.
A resposta inclui `raw_data` — o payload bruto e integral do portal de origem — em toda listagem.

**Remediation:** clampar como já se faz em `agent-actions/routes.js:159` (`Math.min(Math.max(n,1),200)`),
e remover `raw_data` da listagem, mantendo-o só no `GET /leads/:id`.

---

### SEC-017 — Comparação de tokens de serviço em tempo não-constante

```
Severity:   LOW
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/agent-actions/routes.js:56`, `server/observability/healthRoutes.js:31`,
`server/watermark/routes.js:259`, `server/metaLeadgen/webhookRoutes.js:48`.

Todos usam `!==` / `===` para comparar segredos. O próprio projeto **já sabe fazer certo** —
`server/metaLeadgen/signature.js` usa `crypto.timingSafeEqual` com um comentário explicando exatamente o
motivo. O padrão correto simplesmente não foi propagado.

**Impact:** baixo na prática (ruído de rede na internet inviabiliza o oráculo de tempo), mas é uma
inconsistência gratuita.

**Remediation:**
```js
// server/utils/secretCompare.js (novo)
import crypto from 'node:crypto';
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a), B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}
```

---

### SEC-018 — IDOR de leitura e trabalho computacional não autenticado no pipeline de marca d'água

```
Severity:   LOW
Confidence: HIGH
Status:     CONFIRMED
```

**Affected:** `server/watermark/routes.js:123` (`GET /photos/:id`) e `:134` (`GET /photos/:id/:size`)

Nenhuma das duas rotas tem middleware. `GET /photos/:id/:size` chama `service.ensureDerivative()`, que
**gera a imagem sob demanda** quando o derivado não existe.

**Impact:** de posse de um UUID de foto (imprevisível, o que limita bastante), lê-se metadados e URLs de
CDN de qualquer tenant. Mais relevante: cada combinação `id × size` inédita dispara processamento de
imagem sem credencial. Atenuante real: essas imagens são publicadas em feeds públicos de portais, então
a confidencialidade é baixa por design.

**Remediation:** manter público se for requisito dos portais, mas registrar explicitamente essa decisão e
proteger o custo — cache/CDN à frente e rate limit específico na rota. Se não for requisito, aplicar
`requireTenant()` derivando o tenant da própria foto.

---

### SEC-019 — `console.log` de operação vazando identificadores de tenant e telefone

```
Severity:   LOW
Confidence: MEDIUM
Status:     LIKELY
```

**Affected:** diversos pontos, ex. `server/proxy-production.js:303` (`'✅ API Key validada para tenant:'`),
`:145` (código do imóvel + tenant), `server/viewAs/authorize.js:167` (e-mail do usuário).

**Impact:** os logs do EasyPanel passam a conter PII (e-mails, telefones em rotas de busca) e mapeamento
de tenants. Isso amplia a superfície LGPD para qualquer pessoa com acesso ao painel de logs. O prefixo da
API key é truncado a 20 caracteres na linha 279 — cuidado correto, aplicado de forma isolada.

**Remediation:** adotar logging estruturado com redação de PII por campo; reduzir os logs de sucesso em
caminho quente (o `console.log` a cada validação de API key é ruído com custo de privacidade).

---

### SEC-020 — Duplicação de superfície entre `api-server.js` e `proxy-production.js`

```
Severity:   LOW
Confidence: HIGH
Status:     INFORMATIONAL
```

`server/api-server.js` (4.215 linhas) reimplementa a maior parte das rotas de `proxy-production.js`
(5.102 linhas), incluindo `validateApiKey` e `sanitizeFilterValue` — com divergências reais entre as duas
cópias (`api-server.js:1261` usa `.eq`, `proxy-production.js:663` usa `.ilike`; `api-server.js` tem
`/leads/:id/archive` que o outro não tem).

Em produção só roda `proxy-production.js` (`Dockerfile:CMD`, `package.json:start`), e `api-server.js` é
alcançado apenas por `npm run dev:api`. O `docker-compose.yml` referencia um `Dockerfile.api` que **não
existe** no repositório — configuração morta.

**Impact:** toda correção de segurança precisa ser aplicada duas vezes. Historicamente já falhou:
o próprio código comenta *"Registrar nos DOIS entrypoints — já houve 404 em prod por esquecer um"*. Uma
correção aplicada só em um lado cria uma falsa sensação de conserto.

**Remediation:** extrair as rotas compartilhadas para módulos `registerXRoutes(app, supabase)` — padrão
que o projeto **já adota bem** nos módulos mais novos (kenlo, zap, c2s, enps) — e deixar os dois
entrypoints como cascas finas. Remover `docker-compose.yml` e `nginx.conf` se não descrevem o deploy real.

---

### SEC-021 — `express.json({ limit: '50mb' })` global

```
Severity:   LOW
Confidence: HIGH
Status:     CONFIRMED
```

`server/proxy-production.js:118-122`. Todo endpoint JSON aceita 50 MB, incluindo os não autenticados.
Combinado com a ausência de rate limiting (SEC-005) e o heap de 512 MB, é um multiplicador de DoS.
O limite generoso existe para os webhooks de portal; deveria ser local a eles.

**Remediation:** limite global de `1mb`; `express.json({ limit: '50mb' })` aplicado apenas nas rotas de
webhook que comprovadamente precisam.

---

### SEC-022 — Notas informativas

```
Severity:   INFO
```

1. **`generateSecureApiKey()` com `Math.random()`** — `src/features/settings/services/apiKeyService.ts:34-41`
   gera chaves com um PRNG não criptográfico. A função está **morta** (`generateApiKey` usa a RPC
   `generate_crm_api_key`). Deve ser apagada antes que alguém a use. A RPC não está no repositório
   (`supabase/migrations/` não a contém) — **informação faltante**: é preciso auditar o corpo dessa
   função no banco para confirmar que ela usa `gen_random_bytes`, e não algo equivalente a `random()`.
2. **Owner da plataforma por e-mail hardcoded** — `octo.inteligenciaimobiliaria@gmail.com` aparece
   literalmente em `server/utils/ownerAuth.js:13`, em 6+ módulos duplicados e **dentro das policies RLS**
   (`20260801_fix_leads_rls_anon_escape.sql`). Existe uma tabela `platform_owners`
   (`20260624_create_platform_owners.sql`) que resolveria isso. Comprometer essa conta Google entrega a
   plataforma inteira; ela deveria ter MFA obrigatório e ser migrada para a tabela.
3. **Anon key do Supabase em `.env.example:4`** — rastreada em Git. É pública por natureza (vai no bundle
   do Vite), então **não é um vazamento** — mas só é segura enquanto o RLS estiver correto, e o histórico
   do projeto mostra que já não esteve (o escape anônimo corrigido em `20260801`). Vale como lembrete de
   que a anon key não é uma camada de segurança.

---

## Architectural Risks

**AR-1 — `service_role` como modo padrão de acesso ao banco.**
`proxy-production.js:56` escolhe `SUPABASE_SERVICE_ROLE_KEY` quando disponível, o que **desliga o RLS
para todo o backend**. Toda separação entre imobiliárias passa a depender de cada uma das ~90 rotas
lembrar de escrever `.eq('tenant_id', ...)`. Não há defesa em profundidade: um `.eq` esquecido é um
vazamento cross-tenant imediato e silencioso. O caminho maduro é usar o JWT do usuário para as operações
em nome dele (deixando o RLS trabalhar) e reservar `service_role` para os jobs de fundo que
comprovadamente precisam — que é, aliás, o que o comentário da migration `20260801` já reconhece.

**AR-2 — Cinco implementações independentes da mesma autenticação.**
`requireSupabaseAuth` está duplicado literalmente em `agent-actions`, `kpis`, `recommendations`,
`whatsapp` e `enps`; `isPlatformOwner` em 6+ lugares. `server/utils/ownerAuth.js` foi criado como
canônico e o próprio comentário admite que é usado por **um** módulo. Correções de segurança em auth não
se propagam. Consolidar em um único middleware é a mudança estrutural de maior retorno.

**AR-3 — Autorização por papel ausente na API v1.**
`validateApiKey` resolve *qual tenant*, nunca *o que pode fazer*. Não há escopos, e o modelo de papéis
(`corretor`/`admin`/`owner`/`team_leader`/`gestao`) existente na UI e nas rotas com JWT simplesmente não
tem contrapartida na API. É o que transforma SEC-004 de vazamento de credencial em escalonamento de
privilégio.

**AR-4 — Processo único com responsabilidades acopladas.**
O mesmo processo Node serve o frontend, a API, o Puppeteer, o processamento de imagens e vários
schedulers de cron, com heap de 512 MB. Não há isolamento de falha: esgotar o scraper derruba o login. As
flags `*_SCHEDULER=1` são a mitigação atual, mas dependem de disciplina operacional.

**AR-5 — Duas superfícies de dados em paralelo.**
O frontend fala **direto** com o PostgREST (protegido por RLS) *e* com a API Express (protegida por
`service_role` + checagens no código). As duas precisam concordar sobre autorização. Já divergiram: o
backend não reaplica a visibilidade por corretor de `whatsapp_conversations` que o RLS impõe (SEC-012).

**AR-6 — Ausência de trilha de auditoria.**
Existe `api_event_logs`, mas é escrita pelo **frontend** (`apiKeyService.ts:140`) — ou seja, um cliente
malicioso simplesmente não registra o próprio evento. Operações sensíveis do servidor (atribuição de
lead, exclusão, criação de webhook, "visualizar como", troca de credenciais) não têm registro confiável.
`viewAs/authorize.js:167` usa `console.log`, o que não é uma trilha auditável.

---

## Defense-in-Depth Improvements

1. **`helmet` + CSP real** e remoção do `nginx.conf` obsoleto para não confundir quem for endurecer depois.
2. **Rotação e cofre de segredos** — todos os secrets citados aqui devem ser considerados comprometidos e
   rotacionados; adotar o gerenciador de segredos do EasyPanel em vez de `.env` no disco.
3. **Scanner de segredos no CI** (`gitleaks`/`trufflehog`) — SEC-008 teria sido bloqueado no commit.
4. **`npm audit --audit-level=high` no CI** (`.github/`), falhando o build.
5. **Verificação de magic bytes** em todo upload, além do `Content-Type` declarado.
6. **Trilha de auditoria server-side** em tabela append-only para operações sensíveis.
7. **MFA obrigatório** para a conta owner da plataforma e para papéis `admin`/`owner` de tenant.
8. **Teste automatizado de isolamento cross-tenant** — o projeto já tem `api-server.leads-tenant-scope.test.js`
   e testes de RLS em `server/security/`. Estender esse padrão para cobrir toda rota que aceite um id.
9. **Contrato de erro padronizado** (`{ error, errorId }`), eliminando `err.message` das respostas.
10. **Limites de recurso no container** (`--memory`, `--pids-limit`) para conter os vetores de DoS.

---

## Prioritized Remediation Plan

### P0 — corrigir imediatamente (antes do próximo deploy)

| # | Ação |
|---|---|
| SEC-001 | **Rotacionar o client secret OAuth do Google** e mover a troca de token para o servidor. |
| SEC-002 | Corrigir o `state` do OAuth para nonce aleatório validado; derivar `userId` da sessão, nunca do `state`. |
| SEC-003 | Aplicar `validateApiKey` em `POST /api/v1/scrape-imovel`. |
| SEC-006 | Autenticar antes do `multer` em `POST /api/v1/watermark/photos`. |
| SEC-008 | Rotacionar o token da Kenlo; mover para env; remover `server/kenlo-proxy.js` se obsoleto. |

*SEC-001, SEC-003, SEC-006 e SEC-008 são mudanças pequenas e localizadas. SEC-002 exige tocar dois arquivos do frontend.*

### P1 — alta prioridade (próximos dias)

| # | Ação |
|---|---|
| SEC-004 | Hash das API keys + policy RLS restrita a `admin`/`owner`. |
| SEC-005 | `express-rate-limit` em três camadas. |
| SEC-007 | `helmet` com CSP real + `USER` não-root no `Dockerfile`. |
| SEC-012 | Validar `to` contra `conv.contact_phone` e reaplicar a visibilidade por corretor. |
| SEC-022.1 | Auditar o corpo da RPC `generate_crm_api_key` no banco (confirmar CSPRNG); apagar a função morta. |

### P2 — próxima sprint

| # | Ação |
|---|---|
| SEC-009 | Cifrar tokens de WhatsApp/Google reutilizando `recommendations/crypto.js`. |
| SEC-010 | Token de query string separado e restrito a GET dos feeds. |
| SEC-011 | `sanitizeFilterValue` em todos os pontos de interpolação PostgREST. |
| SEC-013/014 | Migrar `xlsx` para a distribuição oficial ou consolidar em `exceljs`; `npm audit fix`. |
| SEC-015 | Contrato de erro padronizado com `errorId`. |
| SEC-016 | Clamp de paginação; remover `raw_data` das listagens. |
| AR-3 | Introduzir escopos nas API keys. |

### P3 — hardening / backlog

| # | Ação |
|---|---|
| AR-1 | Migrar operações em nome do usuário para JWT + RLS; reservar `service_role` aos jobs. |
| AR-2 | Consolidar auth em `server/utils/ownerAuth.js`; eliminar as 5 cópias. |
| AR-4 | Separar Puppeteer e watermark worker em processo/container próprio. |
| AR-6 | Trilha de auditoria server-side append-only. |
| SEC-017 | `safeEqual` com `timingSafeEqual` em todas as comparações de segredo. |
| SEC-018 | Decidir e documentar a política de acesso das rotas de foto; rate limit dedicado. |
| SEC-019 | Logging estruturado com redação de PII. |
| SEC-020 | Unificar `api-server.js` e `proxy-production.js`; remover infra morta. |
| SEC-021 | Reduzir o limite global de corpo para 1 MB. |
| SEC-022.2 | Migrar o owner hardcoded para a tabela `platform_owners`; MFA obrigatório. |

---

## O que não foi verificado

Auditoria estática do repositório. Fora do alcance e recomendados como próximo passo:

- **Estado real do RLS em produção.** As migrations descrevem a intenção; só uma introspecção com a anon
  key contra o banco real confirma o que está aplicado. O histórico do projeto (a correção de `20260801`,
  e a nota de `portal_imoveis` com grant aplicado pela metade) mostra que divergência entre migration e
  banco já aconteceu mais de uma vez.
- **Corpo das funções `SECURITY DEFINER`** (`generate_crm_api_key`, `user_tenant_ids`,
  `is_platform_owner`, `delete_user_completely`) — vivem no banco, não no repositório. `SECURITY DEFINER`
  com `search_path` não fixado é um vetor clássico de escalonamento.
- **Configuração do Supabase Auth** (política de senha, expiração de JWT, rate limit de login, verificação
  de e-mail obrigatória).
- **Fluxos n8n** (`n8n/` é git-ignored) — a integração `DISPARADOR_SERVICE_TOKEN` autoriza ações em
  **qualquer** tenant; o que esses fluxos fazem com esse poder não foi verificado.
- **Teste dinâmico.** Nenhum finding foi validado contra uma instância em execução; as classificações de
  confiança refletem análise de código, com verificação em disco onde foi possível (o caso do
  `GOCSPX-` no bundle foi confirmado por `grep` no `dist/`).
