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

## Smoke manual do login (puppeteerLoginDriver)
O driver de login NÃO tem teste unitário (I/O de browser). Validar manualmente:

```bash
KENLO_SMOKE_EMAIL=... KENLO_SMOKE_PW=... node -e "import('./server/kenlo/puppeteerLoginDriver.js').then(async ({default:d}) => { \
  const t = await d.login(process.env.KENLO_SMOKE_EMAIL, process.env.KENLO_SMOKE_PW); \
  console.log('token capturado:', t ? t.slice(0,8)+'…' : 'FALHOU'); })"
```

Passar credenciais por env no shell (NÃO commitar). Ajustar seletores (`#email`,
`#password`, submit) e o ponto de captura do token conforme o DOM real do
`signin.valuegaia.com.br`. Validar que o token responde 200 em
`GET https://leads.ingaia.com.br/leads/ingaia/?page=1&perPage=1&idMediaOrigin=8`.

## Pendências (ponytail debt)
- `puppeteerLoginDriver`: seletores/captura confirmados só no smoke.
- `makeSyncService`: `brokerLookups` é no-op por padrão — wirar as queries reais
  (`imoveis_corretores` + memberships) para atribuir corretor. Até lá, lead salva sem corretor.

## Operação
Disparo manual (owner): `POST /api/v1/kenlo/sync/run`. Status: `GET /api/v1/kenlo/sync/status`.
