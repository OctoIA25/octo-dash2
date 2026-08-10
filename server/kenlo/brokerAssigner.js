/**
 * Atribuição automática de corretor a leads. Porta a prioridade já validada no
 * frontend (kenloLeadsService.ts): código do imóvel (mais confiável) → attendedBy.
 * Lookups injetados; memoização evita N+1.
 *
 * Cache vive no escopo da INSTÂNCIA (não por chamada): no sync streaming, `assign`
 * roda uma vez por página, então o cache precisa persistir entre páginas do mesmo
 * tenant.
 *
 * A chave INCLUI o tenantId. O engine sincroniza os tenants em PARALELO
 * (crmSync/engine.js: Promise.allSettled sobre runTenantCycle) usando UMA instância
 * compartilhada de assigner (kenloScheduler) — com chave só por código/nome, o
 * mesmo "AP100" (ou o mesmo nome de corretor) resolvido antes por outro tenant
 * devolvia o corretor ERRADO, de outra imobiliária. `reset()` continua existindo
 * para limitar o crescimento do cache, mas já não é o que garante o isolamento.
 */
export function createBrokerAssigner({ getCorretorByPropertyCode, findCorretorInSystem }) {
  const byCodeCache = new Map();
  const byNameCache = new Map();
  const cacheKey = (tenantId, value) => `${tenantId} ${value}`;

  async function assign(tenantId, rows) {
    const resolveCode = async (codigo) => {
      const key = cacheKey(tenantId, codigo);
      if (byCodeCache.has(key)) return byCodeCache.get(key);
      const r = await getCorretorByPropertyCode(tenantId, codigo);
      byCodeCache.set(key, r);
      return r;
    };
    const resolveName = async (nome) => {
      const key = cacheKey(tenantId, nome);
      if (byNameCache.has(key)) return byNameCache.get(key);
      const r = await findCorretorInSystem(tenantId, { nome });
      byNameCache.set(key, r);
      return r;
    };

    for (const row of rows) {
      let id = null, nome = null;
      if (row.interest_reference) {
        const c = await resolveCode(row.interest_reference);
        if (c) {
          if (c.id) { id = c.id; nome = c.nome; }
          else {
            const m = await resolveName(c.nome);
            if (m) { id = m.id; nome = m.nome; } else { nome = c.nome; }
          }
        }
      }
      if (!id && row.attended_by_name) {
        const m = await resolveName(row.attended_by_name);
        if (m) { id = m.id; nome = m.nome; } else { nome = row.attended_by_name; }
      }
      if (nome) row.attended_by_name = nome;
      if (id) row.attended_by_id = id;
    }
    return rows;
  }

  function reset() {
    byCodeCache.clear();
    byNameCache.clear();
  }

  return { assign, reset };
}
