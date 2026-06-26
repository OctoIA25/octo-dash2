# Módulo Kenlo — sync nativo de leads

Substitui a automação N8N + serviço Puppeteer externo + polling do frontend.
Roda no `proxy-production.js`, gated por `KENLO_SYNC_SCHEDULER=1` (apenas um processo).

## Componentes
- `kenloConfig` — mapa idMediaOrigin→portal, env.
- `leadNormalizer` — achata payload, filtra teste, fingerprint de token.
- `KenloAuthService` — token por tenant (cache + cifra AES-256-GCM); login via `puppeteerLoginDriver` (injetável).
- `KenloApiClient` — Bearer + retry/backoff + timeout + breaker + rate-limit.
- `KenloLeadService` — paginação real + detalhes concorrentes.
- `brokerAssigner` — atribuição de corretor (código→attendedBy).
- `KenloSyncService` — orquestra incremental + upsert idempotente + webhook Lia.
- `kenloScheduler` / `routes` — cron + endpoints owner.

## Fluxo de login (puppeteerLoginDriver) — VALIDADO no smoke
Confirmado end-to-end (token RS256 len 1371 → leads API 200):
1. `goto signin.valuegaia.com.br/?provider=imob`
2. preenche `#email`/`#password`, clica `#enter-login` → redireciona p/ `imob.valuegaia.com.br/admin/default.aspx#/home`
3. navega p/ `…#/leads` — **só aí** o painel chama `leads.ingaia.com.br`; intercepta-se o header `Authorization` (Bearer JWT).

Detalhes que importam: o e-mail é `...@imobiliariajapi.com.br` (com `.br`); provider `imob`
(env `KENLO_PROVIDER` se mudar). O token NÃO aparece em `#/home`, só em `#/leads`.

O driver não tem teste unitário (I/O de browser). Re-validar manualmente:

```bash
KENLO_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
KENLO_SMOKE_EMAIL=... KENLO_SMOKE_PW=... node -e "import('./server/kenlo/puppeteerLoginDriver.js').then(async ({default:d}) => { \
  const t = await d.login(process.env.KENLO_SMOKE_EMAIL, process.env.KENLO_SMOKE_PW); \
  console.log('token:', t ? t.slice(0,12)+'… len '+t.length : 'FALHOU'); })"
```

`KENLO_CHROME_PATH` aponta um Chrome do sistema quando o Chromium do puppeteer
está indisponível (dev local). Em produção/container, omitir — usa o Chromium do puppeteer.

## Pendências (ponytail debt)
- `makeSyncService`: `brokerLookups` é no-op por padrão — wirar as queries reais
  (`imoveis_corretores` + memberships) para atribuir corretor. Até lá, lead salva sem corretor.

## Operação
Disparo manual (owner): `POST /api/v1/kenlo/sync/run`. Status: `GET /api/v1/kenlo/sync/status`.
