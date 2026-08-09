/**
 * Contagem e estatísticas de leads por corretor, sobre kenlo_leads.
 *
 * Existe porque `GET /api/v1/brokers` e `GET /api/v1/brokers/:id` liam colunas que
 * não existem em kenlo_leads (`corretor_id`, `etapa_funil`, `temperatura`). O
 * PostgREST respondia 400/42703, o handler fazia `const { data } = await query`
 * sem olhar `error`, e `(data || [])` virava lista vazia — todo corretor saía com
 * `leads_count: 0` e `statistics` zerada. As colunas reais são `attended_by_id`,
 * `stage` e `temperature`.
 *
 * E não dá para baixar as linhas e contar no Node: um tenant tem +70k leads e o
 * PostgREST corta em 1000 SEM erro (db-max-rows). Contar no cliente devolve 1000
 * como se fosse o total. Por isso a contagem da lista é feita no banco.
 */

const PAGE_SIZE = 1000;

// Teto de páginas do detalhe de UM corretor (60k leads). Se estourar, o número sai
// incompleto — e aí `truncated: true` diz isso em vez de mentir um total menor.
const MAX_PAGES = 60;

const STAGE_CONVERSION = 'closed_won';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vírgula e parênteses são separadores dentro de um `or()` do PostgREST; aspas
 * duplas protegem o valor inteiro. Aspas no próprio nome são removidas — a sintaxe
 * de filtro não tem escape para elas.
 */
function quoteFilterValue(value) {
  return `"${String(value ?? '').replace(/"/g, '')}"`;
}

/**
 * Associação lead↔corretor: por `attended_by_id` e, como alternativa, pelo nome.
 *
 * SÓ `auth_user_id` entra no termo de id. Conferido nos dados: todo valor de
 * kenlo_leads.attended_by_id é um auth_user_id (11/11 na amostra) e nenhum é um
 * tenant_brokers.id (0/11). Incluir o tenant_brokers.id — que é o que `broker.id`
 * carrega quando o corretor não tem login — não casaria com nada e ainda tornaria
 * o filtro único por registro, impedindo o agrupamento dos duplicados abaixo.
 *
 * Na prática o vínculo que existe é o nome: attended_by_id vem preenchido em ~1%
 * das linhas.
 */
export function brokerMatchTerms(broker = {}) {
  const terms = [];
  if (broker.auth_user_id && UUID_RE.test(broker.auth_user_id)) {
    terms.push(`attended_by_id.eq.${broker.auth_user_id}`);
  }
  if (broker.name) terms.push(`attended_by_name.ilike.${quoteFilterValue(broker.name)}`);
  return terms;
}

/**
 * Quantos leads cada corretor atende. UMA query: a RPC kenlo_leads_count_by_broker
 * faz o GROUP BY no banco e devolve ~50 linhas (ver a migration homônima — uma
 * COUNT por corretor custava ~2,8s num tenant com 71.626 leads, mesmo indexado).
 *
 * Devolve `{ ok, counts }`. `ok: false` quando a contagem não pôde ser feita — e
 * aí o chamador precisa dizer isso na resposta em vez de mandar zero: zero é uma
 * afirmação ("este corretor não atende ninguém") e seria mentira. Foi justamente
 * um zero silencioso que escondeu este bug até agora.
 */
export async function countLeadsPerBroker(supabase, tenantId, brokers = []) {
  const counts = new Map();
  if (brokers.length === 0) return { ok: true, counts };

  const { data, error } = await supabase.rpc('kenlo_leads_count_by_broker', { p_tenant_id: tenantId });

  if (error) {
    console.error('❌ Erro ao contar leads por corretor:', error);
    return { ok: false, counts };
  }

  // Um lead casa com o corretor por attended_by_id (quando existe) ou pelo nome.
  // Registros duplicados do mesmo corretor recebem o MESMO total: tenant_brokers
  // costuma ter a pessoa repetida (77 registros para 51 nomes num tenant real) e o
  // código anterior dava tudo ao primeiro do Map e zero ao gêmeo, dependendo da
  // ordem de iteração.
  const porId = new Map();
  const porNome = new Map();
  for (const linha of data || []) {
    const total = Number(linha.total) || 0;
    if (linha.attended_by_id) {
      porId.set(linha.attended_by_id, (porId.get(linha.attended_by_id) || 0) + total);
    }
    if (linha.attended_by_name) {
      const chave = linha.attended_by_name.toLowerCase().trim();
      porNome.set(chave, (porNome.get(chave) || 0) + total);
    }
  }

  for (const broker of brokers) {
    const porIdDele = broker.auth_user_id ? porId.get(broker.auth_user_id) : undefined;
    // Nome só como alternativa, e nunca somado ao id: a mesma linha entra nos dois
    // índices, somar contaria o lead duas vezes.
    const total = porIdDele ?? (broker.name ? porNome.get(broker.name.toLowerCase().trim()) : undefined);
    // A RPC respondeu, então "não apareceu no agrupamento" significa zero lead.
    counts.set(broker.id, total ?? 0);
  }

  return { ok: true, counts };
}

/**
 * Estatísticas de UM corretor. Aqui as linhas são buscadas (paginadas) em vez de
 * contadas: o recorte por stage não é fixo — `by_stage` acompanha os valores que
 * existirem — e o volume de um corretor só é pequeno perto do tenant inteiro.
 */
export async function fetchBrokerLeadStats(supabase, tenantId, broker) {
  const stats = {
    total_leads: 0,
    by_stage: {},
    by_temperature: { cold: 0, warm: 0, hot: 0 },
    conversions: 0,
    truncated: false,
  };

  const terms = brokerMatchTerms(broker);
  if (terms.length === 0) return stats;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    // `order` é obrigatório: sem ordenação estável o range do Postgres pode repetir
    // ou pular linhas entre páginas.
    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('stage, temperature')
      .eq('tenant_id', tenantId)
      .or(terms.join(','))
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`❌ Erro ao buscar leads do corretor ${broker?.name || broker?.id}:`, error);
      stats.truncated = true;
      return stats;
    }

    const rows = data || [];
    for (const row of rows) {
      stats.total_leads += 1;
      const stage = row.stage || 'unknown';
      stats.by_stage[stage] = (stats.by_stage[stage] || 0) + 1;
      if (stats.by_temperature[row.temperature] !== undefined) stats.by_temperature[row.temperature] += 1;
      if (stage === STAGE_CONVERSION) stats.conversions += 1;
    }

    if (rows.length < PAGE_SIZE) return stats;
  }

  stats.truncated = true;
  console.warn(`⚠️ Estatísticas do corretor ${broker?.name || broker?.id} truncadas em ${MAX_PAGES * PAGE_SIZE} leads`);
  return stats;
}
