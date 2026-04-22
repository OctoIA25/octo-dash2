# Spec: Scraper Nativo para Estudo de Mercado

## Contexto
O preenchimento automatico do Estudo de Mercado depende de um webhook externo (n8n + Puppeteer em `puppeter.octoia.org`). Esse servico cai com frequencia, bloqueia em muitos portais (Cloudflare) e nao escala para multiplos tenants simultaneos. Precisamos migrar para um endpoint nativo no Express.

## Objetivo
Criar `POST /api/v1/scrape-imovel` no servidor Express que substitui o webhook do n8n com:
- Mesma resposta JSON que o frontend ja espera
- Anti-bloqueio robusto (User-Agent rotation, headers pt-BR, rate limiting, session pool)
- Fallback em 3 camadas (API JSON > Cheerio > Playwright)
- Cache de resultados para evitar re-scraping
- Escalavel para multiplos tenants simultaneos

## Arquitetura

### Pipeline (3 camadas de fallback)
```
URL recebida
  |
  v
[1] Portal Router - detecta portal pela URL
  |
  v
[2] Estrategia por portal:
    - ZAP/VivaReal: API JSON interna (glue-api.zapimoveis.com.br)
    - Chaves na Mao/Cliquei Mudei/outros: CheerioCrawler
    - OLX/sites com Cloudflare pesado: PlaywrightCrawler (fallback)
  |
  v
[3] Data Extractor - regex extrai preco, metragem, fotos do HTML/JSON
  |
  v
[4] AI Enricher - OpenAI GPT-4.1-mini extrai localizacao e classifica tipo
  |
  v
[5] Cache resultado (24h por URL)
  |
  v
[6] Retorna JSON padronizado
```

### Formato de resposta (identico ao n8n atual)
```json
{
  "rua": "string",
  "bairro": "string",
  "cidade": "string",
  "estado": "string (sigla 2 letras)",
  "Valor Total (R$)": number,
  "Metragem (m2)": number,
  "imagem": "string (URL)",
  "imagemzapimoveis": "string (URL)",
  "condominio": "string",
  "tipo": "string (Apartamento|Casa|Cobertura|Terreno|...)",
  "diferenciais": "string (max 250 chars)",
  "localizacao_completa": "string"
}
```

### Anti-bloqueio
- Rate limiting: max 12 requests/min por tenant
- Session pool: 20 sessoes, rotacao de cookies
- User-Agent rotation: headers Chrome reais em pt-BR
- Headers realistas: Referer Google, Sec-Fetch-*, Accept-Language pt-BR
- Retry com backoff: 3 tentativas com delay crescente (2s, 4s, 8s)
- Cache: se scraping falhar e tiver cache, retorna cache stale

### Escalabilidade multi-tenant
- Fila por tenant (max 3 requests simultaneos por tenant)
- Fila global (max 10 requests simultaneos total)
- Timeout de 30s por request
- Se fila cheia: retorna 429 com retry-after header

### Cache
- Chave: SHA256 da URL normalizada
- TTL: 24 horas
- Storage: in-memory (Map) com limpeza periodica
- Hit de cache: resposta em <10ms

## Arquivos

### Novos
- `server/scrapers/index.ts` - Endpoint principal + cache + fila
- `server/scrapers/portalRouter.ts` - Detecta portal e escolhe estrategia
- `server/scrapers/cheerioCrawler.ts` - Crawlee CheerioCrawler com anti-bloqueio
- `server/scrapers/jsonApiScraper.ts` - APIs JSON dos portais (ZAP/VivaReal)
- `server/scrapers/dataExtractor.ts` - Regex para preco/area/fotos (codigo do n8n)
- `server/scrapers/aiEnricher.ts` - OpenAI GPT-4.1-mini para localizacao

### Modificados
- `server/api-server.js` - Registrar rota POST /api/v1/scrape-imovel
- `src/pages/EstudoMercadoPage.tsx` - Trocar WEBHOOK_URL para /api/v1/scrape-imovel
- `src/pages/EstudoMercadoAgentePage.tsx` - Mesmo ajuste de URL
- `package.json` (server) - Adicionar crawlee, openai

## Dependencias
- crawlee (CheerioCrawler) - ~150MB, sem Chromium
- openai (SDK oficial) - para GPT-4.1-mini
- crypto (built-in Node) - para hash de cache

## Verificacao
1. Testar com URL do ZAP Imoveis - deve retornar dados via API JSON
2. Testar com URL do Chaves na Mao - deve retornar via CheerioCrawler
3. Testar com URL invalida - deve retornar erro 400
4. Testar cache - segunda chamada com mesma URL deve ser instantanea
5. Testar no frontend - colar link e verificar preenchimento automatico
