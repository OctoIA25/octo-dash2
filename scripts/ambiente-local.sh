#!/usr/bin/env bash
# Sobe um Supabase LOCAL com o schema de produção, para aplicar e testar
# migrations sem encostar no banco real.
#
#   bash scripts/ambiente-local.sh
#
# Exige: Docker rodando e SUPABASE_DB_PASSWORD no .env (senha do banco de
# produção, obtida em Dashboard › Settings › Database). O .env está no
# .gitignore. NÃO use o prefixo VITE_ nessa variável: o Vite embute toda
# VITE_* no bundle do navegador.
#
# POR QUE FORA DO REPO
# O projeto local nasce em $DESTINO, não em supabase/. Fazer o baseline dentro
# do repo obrigaria a mexer nas 251 migrations existentes para não rodarem duas
# vezes, e outras sessões trabalham nessa pasta ao mesmo tempo.
#
# POR QUE O PASSO DE ACL
# `supabase db dump` emite GRANT, nunca REVOKE. E o pg_default_acl do Supabase
# local concede arwdDxtm a anon/authenticated em TODA tabela nova, então o
# GRANT do dump SOMA a esse padrão em vez de substituí-lo: o local nasce mais
# permissivo que produção e todo teste de RLS/grant passa por engano. Por isso
# revogamos tudo e reaplicamos exatamente as linhas de GRANT do próprio dump.
set -euo pipefail

REF=glbtwvusiaaovllxhiig
DESTINO=${DESTINO:-/tmp/octo-plano-local}
REPO=$(cd "$(dirname "$0")/.." && pwd)

PW=$(grep '^SUPABASE_DB_PASSWORD=' "$REPO/.env" | sed 's/^SUPABASE_DB_PASSWORD=//' | tr -d '"'"'"'')
[ -n "$PW" ] || { echo "SUPABASE_DB_PASSWORD ausente no .env"; exit 1; }
ENC=$(PW="$PW" python3 -c "import urllib.parse,os;print(urllib.parse.quote(os.environ['PW'],safe=''))")

mkdir -p "$DESTINO/supabase/migrations"
cp "$REPO/supabase/config.toml" "$DESTINO/supabase/config.toml"
sed -i '' 's/^project_id = .*/project_id = "octo-plano-local"/' "$DESTINO/supabase/config.toml"

echo "1/4 baixando o schema de produção (leitura apenas)..."
npx supabase db dump --db-url "postgresql://postgres:${ENC}@db.${REF}.supabase.co:5432/postgres" \
  -f "$DESTINO/supabase/migrations/20250101000000_baseline_producao.sql" 2>&1 | grep -vF "$PW"

echo "2/4 subindo os containers..."
npx supabase start --workdir "$DESTINO" >/dev/null

echo "3/4 espelhando o ACL de produção (ver POR QUE O PASSO DE ACL, acima)..."
BASE="$DESTINO/supabase/migrations/20250101000000_baseline_producao.sql"
{ echo "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;"
  grep -E '^GRANT .* ON TABLE "public"\."[^"]+" TO "(anon|authenticated)";$' "$BASE"
} | docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -

echo "4/4 pronto. Rodar um teste:"
echo "  docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \\"
echo "    -v ON_ERROR_STOP=1 -f - < supabase/tests/<nome>.test.sql"
echo
echo "Nota: testes que usam UUID fixo de tenant de produção não rodam aqui"
echo "(hoje: bloqueio_atividade_tira_da_roleta, lead_toques_aviso_e_atraso,"
echo "leads_phone_key). Teste novo deve criar o próprio tenant no fixture."
