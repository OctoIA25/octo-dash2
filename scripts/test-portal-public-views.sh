#!/usr/bin/env bash
# Testa as views públicas do Portal (portal_condominios / portal_imoveis).
# RODAR APÓS aplicar a migration 20260717_create_portal_public_views.sql.
#
# Usa a ANON KEY (prova o que o público realmente vê) e a service_role só para
# estabelecer a verdade-base (counts). Somente LEITURA.
#
# Uso:  bash scripts/test-portal-public-views.sh
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
TENANT="65c69875-dc83-4062-90f6-6f6adc30df26"   # Lotus / "Japi Lançamentos"

# Lê as chaves direto do .env sem `source` (não executa o conteúdo do arquivo,
# evita "unbound variable" de linhas que referenciam outras vars sob set -u).
read_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
URL="$(read_env VITE_SUPABASE_URL)"
AN="$(read_env VITE_SUPABASE_ANON_KEY)"
SR="$(read_env SUPABASE_SERVICE_ROLE_KEY)"
[ -n "$URL" ] && [ -n "$AN" ] && [ -n "$SR" ] || { echo "ERRO: faltam VITE_SUPABASE_URL/ANON_KEY ou SERVICE_ROLE_KEY no .env"; exit 1; }

pass=0; fail=0
ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1"; fail=$((fail+1)); }

count() { # $1=header apikey token, $2=path+query -> imprime total do content-range
  curl -s "$URL/rest/v1/$2" -H "apikey: $1" -H "Authorization: Bearer $1" \
    -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range | sed -E 's/.*\/([0-9]+).*/\1/' | tr -d '\r'
}

echo "== 1. anon LÊ condomínios publicados da Lotus =="
A_COND=$(count "$AN" "portal_condominios?tenant_id=eq.$TENANT&select=id")
S_COND=$(count "$SR" "condominios?tenant_id=eq.$TENANT&publicar_site=eq.true&select=id")
echo "  anon vê: ${A_COND:-0} | esperado (service_role, publicar_site=true): ${S_COND:-0}"
[ "${A_COND:-0}" = "${S_COND:-0}" ] && [ "${A_COND:-0}" -gt 0 ] \
  && ok "anon lê todos os condomínios publicados" \
  || bad "contagem de condomínios diverge ou é zero"

echo "== 2. anon NÃO vê condomínios não-publicados =="
A_ALL=$(count "$AN" "portal_condominios?tenant_id=eq.$TENANT&select=id")
S_ALL=$(count "$SR" "condominios?tenant_id=eq.$TENANT&select=id")
echo "  anon (view): ${A_ALL:-0} | total real no tenant: ${S_ALL:-0}"
[ "${A_ALL:-0}" -lt "${S_ALL:-0}" ] \
  && ok "rascunhos ficam de fora (${A_ALL:-0} < ${S_ALL:-0})" \
  || bad "view não está filtrando não-publicados"

echo "== 3. anon lê SÓ imóveis aprovados =="
A_IMV=$(count "$AN" "portal_imoveis?tenant_id=eq.$TENANT&select=id")
S_IMV=$(count "$SR" "imoveis_locais?tenant_id=eq.$TENANT&status_aprovacao=eq.aprovado&select=id")
echo "  anon vê: ${A_IMV:-0} | esperado (aprovados): ${S_IMV:-0}"
[ "${A_IMV:-0}" = "${S_IMV:-0}" ] && ok "imóveis aprovados batem" || bad "contagem de imóveis diverge"

echo "== 4. portal_imoveis NÃO expõe dados do proprietário (LGPD) =="
BODY=$(curl -s "$URL/rest/v1/portal_imoveis?tenant_id=eq.$TENANT&select=*&limit=1" -H "apikey: $AN" -H "Authorization: Bearer $AN")
if echo "$BODY" | grep -qiE 'proprietario_(nome|telefone|email)'; then
  bad "VAZOU dado de proprietário na view pública!"
else
  ok "nenhum campo proprietario_* presente"
fi

echo "== 5. PII NÃO vaza pela TABELA BASE (grant de coluna) — o teste crítico =="
# security_invoker: anon lê linhas publicadas na base (esperado). O que NÃO pode
# é ler colunas privadas. Pedimos proprietario_nome direto na tabela base:
# PostgREST deve recusar (erro 42501), não devolver o dado.
RAWPII=$(curl -s "$URL/rest/v1/imoveis_locais?tenant_id=eq.$TENANT&select=id,proprietario_nome,proprietario_telefone&limit=1" -H "apikey: $AN" -H "Authorization: Bearer $AN")
if echo "$RAWPII" | grep -qiE '"proprietario_(nome|telefone)"[[:space:]]*:[[:space:]]*"[^"]'; then
  bad "VAZOU PII pela tabela base: $RAWPII"
else
  ok "anon NÃO lê proprietario_* na tabela base (bloqueado por grant de coluna)"
fi

echo "== 6. anon lê SÓ linhas publicadas na tabela base (não rascunhos) =="
DRAFT=$(curl -s "$URL/rest/v1/condominios?tenant_id=eq.$TENANT&publicar_site=eq.false&select=id&limit=1" -H "apikey: $SR" -H "Authorization: Bearer $SR" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
if [ -z "$DRAFT" ]; then
  echo "  (tenant sem rascunhos — pulando)"; ok "sem rascunhos para testar"
else
  RAWDRAFT=$(curl -s "$URL/rest/v1/condominios?id=eq.$DRAFT&select=id,nome&limit=1" -H "apikey: $AN" -H "Authorization: Bearer $AN")
  [ "$RAWDRAFT" = "[]" ] && ok "rascunho (publicar_site=false) invisível p/ anon na base" || bad "anon leu rascunho na base: $RAWDRAFT"
fi

echo ""
echo "RESULTADO: $pass ok, $fail falhas"
[ "$fail" -eq 0 ] || exit 1
